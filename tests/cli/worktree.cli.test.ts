import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  git,
  gitManagerEnv,
  initGitRepo,
  makeTempDir,
  removeTemp,
  runGitManager,
} from './run.js';

describe('git-manager worktree create', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      removeTemp(root);
    }
  });

  it('creates a worktree under .workspaces', () => {
    const root = makeTempDir('git-manager-workspaces-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'login']);
    const env = gitManagerEnv(registryPath);

    const added = runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env);
    expect(added.status).toBe(0);

    const created = runGitManager(
      ['worktree', 'create', 'login', '--repo', 'Harbor'],
      env,
    );
    expect(created.status).toBe(0);

    const checkout = resolve(repoPath, '.workspaces', 'login');
    expect(existsSync(checkout)).toBe(true);
    expect(git(checkout, ['branch', '--show-current'])).toBe('login');
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
  });

  it('creates a sibling worktree next to the repository', () => {
    const root = makeTempDir('git-manager-sibling-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'login']);
    const env = gitManagerEnv(registryPath);

    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(join(repoPath, '.git-manager', 'config.toml'), '[layout]\nmode = "sibling"\n');
    const added = runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env);
    expect(added.status).toBe(0);

    const created = runGitManager(
      ['worktree', 'create', 'login', '--repo', 'Harbor'],
      env,
    );
    expect(created.status).toBe(0);

    const checkout = resolve(root, 'login');
    expect(existsSync(checkout)).toBe(true);
    expect(git(checkout, ['branch', '--show-current'])).toBe('login');
    expect(existsSync(join(repoPath, '.workspaces', 'login'))).toBe(false);
  });

  it('creates feature/foo in a feature-foo folder without renaming the branch', () => {
    const root = makeTempDir('git-manager-sanitize-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'feature/foo']);
    const env = gitManagerEnv(registryPath);

    expect(runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status).toBe(0);

    const created = runGitManager(
      ['worktree', 'create', 'feature/foo', '--repo', 'Harbor'],
      env,
    );
    expect(created.status).toBe(0);

    const checkout = resolve(repoPath, '.workspaces', 'feature-foo');
    expect(existsSync(checkout)).toBe(true);
    expect(git(checkout, ['branch', '--show-current'])).toBe('feature/foo');
  });

  it('stops when that folder already exists and leaves git unchanged', () => {
    const root = makeTempDir('git-manager-exists-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'login']);
    const env = gitManagerEnv(registryPath);
    expect(
      runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status,
    ).toBe(0);

    const checkout = join(repoPath, '.workspaces', 'login');
    mkdirSync(checkout, { recursive: true });
    writeFileSync(join(checkout, 'keep.txt'), 'stay');
    const worktreesBefore = git(repoPath, ['worktree', 'list']);
    const branchesBefore = git(repoPath, ['branch', '--list']);

    const created = runGitManager(
      ['worktree', 'create', 'login', '--repo', 'Harbor'],
      env,
    );

    expect(created.status).toBe(1);
    expect(created.stderr).not.toBe('');
    expect(git(repoPath, ['worktree', 'list'])).toBe(worktreesBefore);
    expect(git(repoPath, ['branch', '--list'])).toBe(branchesBefore);
    expect(readFileSync(join(checkout, 'keep.txt'), 'utf8')).toBe('stay');
  });

  it('uses the layout mode from the repository config when that key is set', () => {
    const root = makeTempDir('git-manager-config-layout-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'login']);
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(
      join(repoPath, '.git-manager', 'config.toml'),
      '[layout]\nmode = "sibling"\n',
    );
    const env = gitManagerEnv(registryPath);
    expect(runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status).toBe(0);

    const created = runGitManager(
      ['worktree', 'create', 'login', '--repo', 'Harbor'],
      env,
    );
    expect(created.status).toBe(0);

    const checkout = resolve(root, 'login');
    expect(existsSync(checkout)).toBe(true);
    expect(git(checkout, ['branch', '--show-current'])).toBe('login');
    expect(existsSync(join(repoPath, '.workspaces', 'login'))).toBe(false);
  });

  it('fetches a remote-only branch before the create hook runs', () => {
    const root = makeTempDir('git-manager-fetch-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const remotePath = join(root, 'origin.git');
    const otherPath = join(root, 'other');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    mkdirSync(remotePath, { recursive: true });
    execFileSync('git', ['init', '--bare', '-b', 'master'], {
      cwd: remotePath,
      stdio: 'ignore',
    });
    git(repoPath, ['remote', 'add', 'origin', remotePath]);
    git(repoPath, ['push', '-u', 'origin', 'master']);
    execFileSync('git', ['clone', remotePath, otherPath], { stdio: 'ignore' });
    git(otherPath, ['config', 'user.name', 'git-manager test']);
    git(otherPath, ['config', 'user.email', 'test@git-manager.local']);
    git(otherPath, ['checkout', '-b', 'feature']);
    writeFileSync(join(otherPath, 'feature.txt'), 'from remote\n');
    git(otherPath, ['add', 'feature.txt']);
    git(otherPath, ['commit', '-m', 'add feature']);
    git(otherPath, ['push', '-u', 'origin', 'feature']);

    mkdirSync(join(repoPath, 'hooks'), { recursive: true });
    writeFileSync(
      join(repoPath, 'hooks', 'mark.mjs'),
      [
        "import { execFileSync } from 'node:child_process';",
        "import { writeFileSync } from 'node:fs';",
        "const ref = execFileSync('git', ['show-ref', '--verify', 'refs/remotes/origin/feature'], { encoding: 'utf8' }).trim();",
        "console.log('fetched-ref ' + ref);",
        "writeFileSync('hook-ran.txt', 'ran');",
        '',
      ].join('\n'),
    );
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(
      join(repoPath, '.git-manager', 'config.toml'),
      '[hooks.pre_worktree_create]\ncommands = ["node hooks/mark.mjs"]\n',
    );

    expect(() =>
      execFileSync('git', ['show-ref', '--verify', 'refs/remotes/origin/feature'], {
        cwd: repoPath,
        stdio: 'ignore',
      }),
    ).toThrow();

    const env = gitManagerEnv(registryPath);
    expect(
      runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status,
    ).toBe(0);

    const created = runGitManager(
      ['worktree', 'create', 'feature', '--repo', 'Harbor'],
      env,
    );
    expect(created.status).toBe(0);
    expect(created.stdout).toMatch(
      /fetched-ref [0-9a-f]{40} refs\/remotes\/origin\/feature/,
    );
    expect(readFileSync(join(repoPath, 'hook-ran.txt'), 'utf8')).toBe('ran');

    const checkout = resolve(repoPath, '.workspaces', 'feature');
    expect(existsSync(checkout)).toBe(true);
    expect(git(checkout, ['branch', '--show-current'])).toBe('feature');
  });

  it('leaves no worktree when a TypeScript plugin returns abort', () => {
    const root = makeTempDir('git-manager-abort-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'login']);
    mkdirSync(join(repoPath, 'plugins'), { recursive: true });
    writeFileSync(
      join(repoPath, 'plugins', 'abort.ts'),
      [
        'export default {',
        "  name: 'abort-create',",
        "  preWorktreeCreate(): 'abort' {",
        "    return 'abort';",
        '  },',
        '};',
        '',
      ].join('\n'),
    );
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(
      join(repoPath, '.git-manager', 'config.toml'),
      '[hooks]\nmodules = ["plugins/abort.ts"]\n',
    );
    const env = gitManagerEnv(registryPath);
    expect(
      runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status,
    ).toBe(0);
    const worktreesBefore = git(repoPath, ['worktree', 'list']);

    const created = runGitManager(
      ['worktree', 'create', 'login', '--repo', 'Harbor'],
      env,
    );

    expect(created.status).toBe(1);
    expect(created.stderr).toContain('abort');
    expect(git(repoPath, ['worktree', 'list'])).toBe(worktreesBefore);
    expect(existsSync(join(repoPath, '.workspaces', 'login'))).toBe(false);
  });

  it('runs a shell command and a TypeScript plugin when creating a worktree', () => {
    const root = makeTempDir('git-manager-both-hooks-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'login']);
    mkdirSync(join(repoPath, 'hooks'), { recursive: true });
    writeFileSync(
      join(repoPath, 'hooks', 'mark.mjs'),
      "import { writeFileSync } from 'node:fs';\nwriteFileSync('shell-ran.txt', 'ran');\n",
    );
    const pluginMarker = join(repoPath, 'plugin-ran.txt');
    mkdirSync(join(repoPath, 'plugins'), { recursive: true });
    writeFileSync(
      join(repoPath, 'plugins', 'mark.ts'),
      [
        "import { writeFileSync } from 'node:fs';",
        'export default {',
        "  name: 'mark',",
        '  preWorktreeCreate(): void {',
        `    writeFileSync(${JSON.stringify(pluginMarker)}, 'ran');`,
        '  },',
        '};',
        '',
      ].join('\n'),
    );
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(
      join(repoPath, '.git-manager', 'config.toml'),
      [
        '[hooks]',
        'modules = ["plugins/mark.ts"]',
        '',
        '[hooks.pre_worktree_create]',
        'commands = ["node hooks/mark.mjs"]',
        '',
      ].join('\n'),
    );
    const env = gitManagerEnv(registryPath);
    expect(
      runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status,
    ).toBe(0);

    const created = runGitManager(
      ['worktree', 'create', 'login', '--repo', 'Harbor'],
      env,
    );
    expect(created.status).toBe(0);
    expect(readFileSync(join(repoPath, 'shell-ran.txt'), 'utf8')).toBe('ran');
    expect(readFileSync(pluginMarker, 'utf8')).toBe('ran');
    expect(existsSync(join(repoPath, '.workspaces', 'login'))).toBe(true);
  });

  it('copies .env into the worktree as a file that can be edited', () => {
    const root = makeTempDir('git-manager-copy-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    writeFileSync(join(repoPath, '.env'), 'SECRET=1\n');
    git(repoPath, ['branch', 'login']);
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(
      join(repoPath, '.git-manager', 'config.toml'),
      '[copy]\nfiles = [".env"]\n',
    );
    const env = gitManagerEnv(registryPath);
    expect(
      runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status,
    ).toBe(0);

    const created = runGitManager(
      ['worktree', 'create', 'login', '--repo', 'Harbor'],
      env,
    );
    expect(created.status).toBe(0);

    const copied = join(repoPath, '.workspaces', 'login', '.env');
    expect(readFileSync(copied, 'utf8')).toBe('SECRET=1\n');
    writeFileSync(copied, 'SECRET=2\n');
    expect(readFileSync(copied, 'utf8')).toBe('SECRET=2\n');
    expect(readFileSync(join(repoPath, '.env'), 'utf8')).toBe('SECRET=1\n');
  });

  it('lists only the repository after a worktree is created', () => {
    const root = makeTempDir('git-manager-list-after-create-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'login']);
    const env = gitManagerEnv(registryPath);
    expect(
      runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status,
    ).toBe(0);

    expect(
      runGitManager(['worktree', 'create', 'login', '--repo', 'Harbor'], env).status,
    ).toBe(0);

    const listed = runGitManager(['list'], env);
    expect(listed.stdout).toBe(`Harbor\t${resolve(repoPath)}\n`);
  });

  it('removes the worktree and leaves the branch', () => {
    const root = makeTempDir('git-manager-remove-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'login']);
    const env = gitManagerEnv(registryPath);
    expect(
      runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status,
    ).toBe(0);
    expect(
      runGitManager(['worktree', 'create', 'login', '--repo', 'Harbor'], env).status,
    ).toBe(0);
    const checkout = resolve(repoPath, '.workspaces', 'login');
    expect(git(repoPath, ['worktree', 'list'])).toContain(checkout);

    const removed = runGitManager(
      ['worktree', 'remove', 'login', '--repo', 'Harbor'],
      env,
    );
    expect(removed.status).toBe(0);
    expect(git(repoPath, ['worktree', 'list'])).not.toContain(checkout);
    expect(git(repoPath, ['rev-parse', '--verify', 'refs/heads/login'])).toMatch(
      /^[0-9a-f]{40}$/,
    );
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
  });

  it('does not remove the primary checkout', () => {
    const root = makeTempDir('git-manager-remove-primary-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    const env = gitManagerEnv(registryPath);
    expect(
      runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status,
    ).toBe(0);

    const removed = runGitManager(
      ['worktree', 'remove', 'master', '--repo', 'Harbor'],
      env,
    );
    expect(removed.status).toBe(1);
    expect(git(repoPath, ['worktree', 'list'])).toContain(resolve(repoPath));
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
  });

  it('leaves an existing workspaces checkout in place when the app default becomes Sibling', () => {
    const root = makeTempDir('git-manager-app-default-stays-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    const settingsPath = join(root, 'app-settings.json');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'login']);
    git(repoPath, ['branch', 'notes']);
    const env = {
      ...gitManagerEnv(registryPath),
      GIT_MANAGER_APP_SETTINGS_PATH: settingsPath,
    };
    expect(runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status).toBe(0);

    const created = runGitManager(['worktree', 'create', 'login', '--repo', 'Harbor'], env);
    expect(created.status).toBe(0);
    const existing = resolve(repoPath, '.workspaces', 'login');
    expect(existsSync(existing)).toBe(true);
    expect(git(existing, ['branch', '--show-current'])).toBe('login');

    writeFileSync(settingsPath, '{"defaultLayout":"sibling"}\n');

    const next = runGitManager(['worktree', 'create', 'notes', '--repo', 'Harbor'], env);
    expect(next.status).toBe(0);
    expect(existsSync(existing)).toBe(true);
    expect(git(existing, ['branch', '--show-current'])).toBe('login');
    const sibling = resolve(root, 'notes');
    expect(existsSync(sibling)).toBe(true);
    expect(git(sibling, ['branch', '--show-current'])).toBe('notes');
    expect(existsSync(join(repoPath, '.workspaces', 'notes'))).toBe(false);
  });

  it('uses the repository Workspaces layout when the app default is Sibling', () => {
    const root = makeTempDir('git-manager-repo-workspaces-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    const settingsPath = join(root, 'app-settings.json');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'login']);
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(join(repoPath, '.git-manager', 'config.toml'), '[layout]\nmode = "workspaces"\n');
    writeFileSync(settingsPath, '{"defaultLayout":"sibling"}\n');
    const env = {
      ...gitManagerEnv(registryPath),
      GIT_MANAGER_APP_SETTINGS_PATH: settingsPath,
    };
    expect(runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status).toBe(0);

    const created = runGitManager(['worktree', 'create', 'login', '--repo', 'Harbor'], env);
    expect(created.status).toBe(0);
    const checkout = resolve(repoPath, '.workspaces', 'login');
    expect(existsSync(checkout)).toBe(true);
    expect(git(checkout, ['branch', '--show-current'])).toBe('login');
    expect(existsSync(resolve(root, 'login'))).toBe(false);
  });

  it('uses the repository Sibling layout when the app default is Workspaces', () => {
    const root = makeTempDir('git-manager-repo-sibling-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    const settingsPath = join(root, 'app-settings.json');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'login']);
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(join(repoPath, '.git-manager', 'config.toml'), '[layout]\nmode = "sibling"\n');
    writeFileSync(settingsPath, '{"defaultLayout":"workspaces"}\n');
    const env = {
      ...gitManagerEnv(registryPath),
      GIT_MANAGER_APP_SETTINGS_PATH: settingsPath,
    };
    expect(runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status).toBe(0);

    const created = runGitManager(['worktree', 'create', 'login', '--repo', 'Harbor'], env);
    expect(created.status).toBe(0);
    const checkout = resolve(root, 'login');
    expect(existsSync(checkout)).toBe(true);
    expect(git(checkout, ['branch', '--show-current'])).toBe('login');
    expect(existsSync(join(repoPath, '.workspaces', 'login'))).toBe(false);
  });

  it('creates nothing when the repository layout mode is unsupported', () => {
    const root = makeTempDir('git-manager-unsupported-layout-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    const settingsPath = join(root, 'app-settings.json');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'login']);
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(join(repoPath, '.git-manager', 'config.toml'), '[layout]\nmode = "custom"\n');
    writeFileSync(settingsPath, '{"defaultLayout":"sibling"}\n');
    const env = {
      ...gitManagerEnv(registryPath),
      GIT_MANAGER_APP_SETTINGS_PATH: settingsPath,
    };
    expect(runGitManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status).toBe(0);
    const worktreesBefore = git(repoPath, ['worktree', 'list']);

    const created = runGitManager(['worktree', 'create', 'login', '--repo', 'Harbor'], env);

    expect(created.status).toBe(1);
    expect(created.stderr).toContain('Unsupported layout: custom');
    expect(git(repoPath, ['worktree', 'list'])).toBe(worktreesBefore);
    expect(existsSync(join(repoPath, '.workspaces', 'login'))).toBe(false);
    expect(existsSync(resolve(root, 'login'))).toBe(false);
  });
});
