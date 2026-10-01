import { execSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initRepo, initRepoWithRemote, pushRemoteOnlyBranch, runCli } from './run-cli.js';

function writeLayout(repo: string, layout: 'workspaces' | 'sibling'): void {
  const dir = join(repo, '.git-manager');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.toml'), `layout = "${layout}"\n`);
}

describe('worktree create', () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('checks out a workspaces worktree under .workspaces', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);
    execSync('git branch feature', { cwd: repo, stdio: 'ignore' });
    writeLayout(repo, 'workspaces');
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    const created = await runCli(['worktree', 'create', 'feature', '--repo', repo], { env });
    expect(created.exitCode).toBe(0);

    const checkout = join(repo, '.workspaces', 'feature');
    expect(existsSync(checkout)).toBe(true);
    expect(execSync('git rev-parse --abbrev-ref HEAD', { cwd: checkout, encoding: 'utf8' }).trim()).toBe(
      'feature',
    );
  });

  it('checks out a sibling worktree in a folder next to the repository', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);
    execSync('git branch feature', { cwd: repo, stdio: 'ignore' });
    writeLayout(repo, 'sibling');
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    const created = await runCli(['worktree', 'create', 'feature', '--repo', repo], { env });
    expect(created.exitCode).toBe(0);

    const checkout = join(root, 'feature');
    expect(existsSync(checkout)).toBe(true);
    expect(existsSync(join(repo, '.workspaces', 'feature'))).toBe(false);
    expect(execSync('git rev-parse --abbrev-ref HEAD', { cwd: checkout, encoding: 'utf8' }).trim()).toBe(
      'feature',
    );
  });

  it('sanitizes the folder name and leaves the git branch unchanged', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);
    execSync('git branch feature/foo', { cwd: repo, stdio: 'ignore' });
    writeLayout(repo, 'sibling');
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    const created = await runCli(['worktree', 'create', 'feature/foo', '--repo', repo], { env });
    expect(created.exitCode).toBe(0);

    const checkout = join(root, 'feature-foo');
    expect(existsSync(checkout)).toBe(true);
    expect(execSync('git rev-parse --abbrev-ref HEAD', { cwd: checkout, encoding: 'utf8' }).trim()).toBe(
      'feature/foo',
    );
  });

  it('stops without overwriting when the folder already exists', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);
    execSync('git branch feature', { cwd: repo, stdio: 'ignore' });
    writeLayout(repo, 'workspaces');
    const checkout = join(repo, '.workspaces', 'feature');
    mkdirSync(checkout, { recursive: true });
    writeFileSync(join(checkout, 'keep.txt'), 'leave me\n');
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    const created = await runCli(['worktree', 'create', 'feature', '--repo', repo], { env });
    expect(created.exitCode).not.toBe(0);
    expect(readFileSync(join(checkout, 'keep.txt'), 'utf8')).toBe('leave me\n');

    const worktrees = execSync('git worktree list --porcelain', { cwd: repo, encoding: 'utf8' });
    expect(worktrees).not.toContain(checkout);
  });

  it('fetches a remote-only branch before create hooks run', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const remote = join(root, 'remote.git');
    const registry = join(root, 'registry.db');
    initRepoWithRemote(repo, remote);
    pushRemoteOnlyBranch(remote, root, 'remote-only');
    mkdirSync(join(repo, '.git-manager'), { recursive: true });
    writeFileSync(
      join(repo, '.git-manager', 'config.toml'),
      [
        'layout = "workspaces"',
        '',
        '[hooks.create]',
        'pre = ["git rev-parse --verify --quiet refs/remotes/origin/remote-only && echo fetched > hook-saw-fetch"]',
        '',
      ].join('\n'),
    );
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    const created = await runCli(['worktree', 'create', 'remote-only', '--repo', repo], { env });
    expect(created.exitCode).toBe(0);
    expect(readFileSync(join(repo, 'hook-saw-fetch'), 'utf8')).toBe('fetched\n');

    const checkout = join(repo, '.workspaces', 'remote-only');
    expect(readFileSync(join(checkout, 'remote-only.txt'), 'utf8')).toBe('from remote\n');
    expect(execSync('git rev-parse --abbrev-ref HEAD', { cwd: checkout, encoding: 'utf8' }).trim()).toBe(
      'remote-only',
    );
  });

  it('stops creation when a create hook fails', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);
    execSync('git branch feature', { cwd: repo, stdio: 'ignore' });
    mkdirSync(join(repo, '.git-manager'), { recursive: true });
    writeFileSync(
      join(repo, '.git-manager', 'config.toml'),
      ['layout = "workspaces"', '', '[hooks.create]', 'pre = ["echo ran > hook-ran && exit 1"]', ''].join('\n'),
    );
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    const created = await runCli(['worktree', 'create', 'feature', '--repo', repo], { env });
    expect(created.exitCode).not.toBe(0);
    expect(readFileSync(join(repo, 'hook-ran'), 'utf8')).toBe('ran\n');
    expect(existsSync(join(repo, '.workspaces', 'feature'))).toBe(false);

    const worktrees = execSync('git worktree list --porcelain', { cwd: repo, encoding: 'utf8' });
    expect(worktrees).not.toContain('.workspaces/feature');
  });

  it('stops creation when a TypeScript plugin aborts', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);
    execSync('git branch feature', { cwd: repo, stdio: 'ignore' });
    writeFileSync(
      join(repo, 'abort-plugin.ts'),
      [
        'export default {',
        "  name: 'abort-create',",
        '  preWorktreeCreate() {',
        "    return 'abort';",
        '  },',
        '};',
        '',
      ].join('\n'),
    );
    mkdirSync(join(repo, '.git-manager'), { recursive: true });
    writeFileSync(
      join(repo, '.git-manager', 'config.toml'),
      ['layout = "workspaces"', '', '[hooks]', 'plugins = ["./abort-plugin.ts"]', ''].join('\n'),
    );
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    const created = await runCli(['worktree', 'create', 'feature', '--repo', repo], { env });
    expect(created.exitCode).not.toBe(0);
    expect(existsSync(join(repo, '.workspaces', 'feature'))).toBe(false);
  });

  it('runs a shell command and a TypeScript plugin on create', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);
    execSync('git branch feature', { cwd: repo, stdio: 'ignore' });
    writeFileSync(
      join(repo, 'mark-plugin.ts'),
      [
        "import { writeFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        'export default {',
        "  name: 'mark-plugin',",
        '  postWorktreeCreate(context) {',
        "    writeFileSync(join(context.worktreePath, 'from-plugin.txt'), 'plugin\\n');",
        '  },',
        '};',
        '',
      ].join('\n'),
    );
    mkdirSync(join(repo, '.git-manager'), { recursive: true });
    writeFileSync(
      join(repo, '.git-manager', 'config.toml'),
      [
        'layout = "workspaces"',
        '',
        '[hooks]',
        'plugins = ["./mark-plugin.ts"]',
        '',
        '[hooks.create]',
        'post = ["echo shell > \\"$GIT_MANAGER_WORKTREE/from-shell.txt\\""]',
        '',
      ].join('\n'),
    );
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    const created = await runCli(['worktree', 'create', 'feature', '--repo', repo], { env });
    expect(created.exitCode).toBe(0);

    const checkout = join(repo, '.workspaces', 'feature');
    expect(readFileSync(join(checkout, 'from-shell.txt'), 'utf8')).toBe('shell\n');
    expect(readFileSync(join(checkout, 'from-plugin.txt'), 'utf8')).toBe('plugin\n');
  });

  it('copies a file into the new worktree as a normal editable file', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);
    execSync('git branch feature', { cwd: repo, stdio: 'ignore' });
    writeFileSync(join(repo, '.env'), 'TOKEN=1\n');
    mkdirSync(join(repo, '.git-manager'), { recursive: true });
    writeFileSync(
      join(repo, '.git-manager', 'config.toml'),
      ['layout = "workspaces"', 'copy = [".env"]', ''].join('\n'),
    );
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    const created = await runCli(['worktree', 'create', 'feature', '--repo', repo], { env });
    expect(created.exitCode).toBe(0);

    const copied = join(repo, '.workspaces', 'feature', '.env');
    expect(readFileSync(copied, 'utf8')).toBe('TOKEN=1\n');
    accessSync(copied, constants.W_OK);
    writeFileSync(copied, 'TOKEN=1\nTOKEN=2\n');
    expect(readFileSync(copied, 'utf8')).toBe('TOKEN=1\nTOKEN=2\n');
  });
});
