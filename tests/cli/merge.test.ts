import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initRepo, runCli } from './run-cli.js';

function commitFile(repo: string, name: string, contents: string, message: string): void {
  writeFileSync(join(repo, name), contents);
  execSync('git add .', { cwd: repo, stdio: 'ignore' });
  execSync(`git commit -m "${message}"`, { cwd: repo, stdio: 'ignore' });
}

describe('merge', () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('merges into the master tree in the primary checkout', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);
    execSync('git checkout -b feature', { cwd: repo, stdio: 'ignore' });
    commitFile(repo, 'feature.txt', 'feature\n', 'add feature');
    execSync('git checkout main', { cwd: repo, stdio: 'ignore' });
    commitFile(repo, 'main.txt', 'main\n', 'add main');
    mkdirSync(join(repo, '.git-manager'), { recursive: true });
    writeFileSync(join(repo, '.git-manager', 'config.toml'), 'layout = "workspaces"\n');
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };
    const featureHead = execSync('git rev-parse feature', { cwd: repo, encoding: 'utf8' }).trim();

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    const created = await runCli(['worktree', 'create', 'feature', '--repo', repo], { env });
    expect(created.exitCode).toBe(0);

    const merged = await runCli(['merge', '--into-master-tree', 'feature', '--repo', repo], { env });
    expect(merged.exitCode).toBe(0);

    expect(execSync('git branch --show-current', { cwd: repo, encoding: 'utf8' }).trim()).toBe('main');
    expect(readFileSync(join(repo, 'feature.txt'), 'utf8')).toBe('feature\n');
    expect(readFileSync(join(repo, 'main.txt'), 'utf8')).toBe('main\n');

    const checkout = join(repo, '.workspaces', 'feature');
    expect(execSync('git rev-parse HEAD', { cwd: checkout, encoding: 'utf8' }).trim()).toBe(featureHead);
    expect(execSync('git branch --show-current', { cwd: checkout, encoding: 'utf8' }).trim()).toBe('feature');
  });

  it('merges from the master tree in the branch worktree and leaves the primary checkout', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);
    execSync('git checkout -b feature', { cwd: repo, stdio: 'ignore' });
    commitFile(repo, 'feature.txt', 'feature\n', 'add feature');
    execSync('git checkout main', { cwd: repo, stdio: 'ignore' });
    commitFile(repo, 'main.txt', 'main\n', 'add main');
    mkdirSync(join(repo, '.git-manager'), { recursive: true });
    writeFileSync(join(repo, '.git-manager', 'config.toml'), 'layout = "workspaces"\n');
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };
    const primaryHead = execSync('git rev-parse HEAD', { cwd: repo, encoding: 'utf8' }).trim();

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    const created = await runCli(['worktree', 'create', 'feature', '--repo', repo], { env });
    expect(created.exitCode).toBe(0);

    const merged = await runCli(['merge', '--from-master-tree', 'feature', '--repo', repo], { env });
    expect(merged.exitCode).toBe(0);

    expect(execSync('git rev-parse HEAD', { cwd: repo, encoding: 'utf8' }).trim()).toBe(primaryHead);
    expect(execSync('git branch --show-current', { cwd: repo, encoding: 'utf8' }).trim()).toBe('main');

    const checkout = join(repo, '.workspaces', 'feature');
    expect(execSync('git branch --show-current', { cwd: checkout, encoding: 'utf8' }).trim()).toBe('feature');
    expect(readFileSync(join(checkout, 'feature.txt'), 'utf8')).toBe('feature\n');
    expect(readFileSync(join(checkout, 'main.txt'), 'utf8')).toBe('main\n');
  });

  it('squashes as an option of merge into the master tree', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);
    execSync('git checkout -b feature', { cwd: repo, stdio: 'ignore' });
    commitFile(repo, 'feature.txt', 'feature\n', 'add feature');
    execSync('git checkout main', { cwd: repo, stdio: 'ignore' });
    commitFile(repo, 'main.txt', 'main\n', 'add main');
    mkdirSync(join(repo, '.git-manager'), { recursive: true });
    writeFileSync(join(repo, '.git-manager', 'config.toml'), 'layout = "workspaces"\n');
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };
    const featureHead = execSync('git rev-parse feature', { cwd: repo, encoding: 'utf8' }).trim();

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    await runCli(['worktree', 'create', 'feature', '--repo', repo], { env });

    const help = await runCli(['--help']);
    expect((help.stdout.split('Commands:')[1] ?? '')).not.toContain('squash');
    const mergeHelp = await runCli(['merge', '--help']);
    expect(mergeHelp.stdout).toContain('--squash');

    const merged = await runCli(
      ['merge', '--into-master-tree', 'feature', '--squash', '--repo', repo],
      { env },
    );
    expect(merged.exitCode).toBe(0);
    expect(execSync('git branch --show-current', { cwd: repo, encoding: 'utf8' }).trim()).toBe('main');
    expect(execSync('git diff --cached --name-only', { cwd: repo, encoding: 'utf8' })).toBe('');
    expect(execSync('git show HEAD:feature.txt', { cwd: repo, encoding: 'utf8' })).toBe('feature\n');

    const commit = execSync('git cat-file -p HEAD', { cwd: repo, encoding: 'utf8' });
    expect(commit.split('\n').filter((line) => line.startsWith('parent '))).toHaveLength(1);

    const checkout = join(repo, '.workspaces', 'feature');
    expect(execSync('git rev-parse HEAD', { cwd: checkout, encoding: 'utf8' }).trim()).toBe(featureHead);
  });

  it('merges an explicit source into the checkout of an explicit target', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);
    execSync('git checkout -b feature', { cwd: repo, stdio: 'ignore' });
    commitFile(repo, 'feature.txt', 'feature\n', 'add feature');
    execSync('git checkout main', { cwd: repo, stdio: 'ignore' });
    commitFile(repo, 'main.txt', 'main\n', 'add main');
    mkdirSync(join(repo, '.git-manager'), { recursive: true });
    writeFileSync(join(repo, '.git-manager', 'config.toml'), 'layout = "workspaces"\n');
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };
    const primaryHead = execSync('git rev-parse HEAD', { cwd: repo, encoding: 'utf8' }).trim();

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    await runCli(['worktree', 'create', 'feature', '--repo', repo], { env });

    const merged = await runCli(
      ['merge', '--source', 'main', '--target', 'feature', '--repo', repo],
      { env },
    );
    expect(merged.exitCode).toBe(0);
    expect(execSync('git rev-parse HEAD', { cwd: repo, encoding: 'utf8' }).trim()).toBe(primaryHead);
    expect(execSync('git branch --show-current', { cwd: repo, encoding: 'utf8' }).trim()).toBe('main');

    const checkout = join(repo, '.workspaces', 'feature');
    expect(execSync('git branch --show-current', { cwd: checkout, encoding: 'utf8' }).trim()).toBe('feature');
    expect(readFileSync(join(checkout, 'main.txt'), 'utf8')).toBe('main\n');
  });
});
