import { existsSync } from 'node:fs';
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

    const added = runGitManager(
      ['add', '--path', repoPath, '--name', 'Harbor', '--layout', 'workspaces'],
      env,
    );
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

    const added = runGitManager(
      ['add', '--path', repoPath, '--name', 'Harbor', '--layout', 'sibling'],
      env,
    );
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
});
