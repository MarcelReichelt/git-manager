import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  git,
  gitWorktreeManagerEnv,
  initGitRepo,
  makeTempDir,
  removeTemp,
  runGitWorktreeManager,
} from './run.js';

describe('git-worktree-manager merge', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      removeTemp(root);
    }
  });

  it('updates a branch from master and leaves the primary checkout on master', () => {
    const root = makeTempDir('git-worktree-manager-merge-update-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'feature']);
    const env = gitWorktreeManagerEnv(registryPath);
    expect(
      runGitWorktreeManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status,
    ).toBe(0);
    expect(
      runGitWorktreeManager(['worktree', 'create', 'feature', '--repo', 'Harbor'], env).status,
    ).toBe(0);

    writeFileSync(join(repoPath, 'master.txt'), 'from master\n');
    git(repoPath, ['add', 'master.txt']);
    git(repoPath, ['commit', '-m', 'master change']);

    const merged = runGitWorktreeManager(
      ['merge', '--repo', 'Harbor', '--update-from-master', 'feature'],
      env,
    );
    expect(merged.status).toBe(0);

    const checkout = join(repoPath, '.workspaces', 'feature');
    expect(readFileSync(join(checkout, 'master.txt'), 'utf8')).toBe('from master\n');
    expect(git(checkout, ['branch', '--show-current'])).toBe('feature');
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
  });

  it('squashes master into the branch with the squash commit message', () => {
    const root = makeTempDir('git-worktree-manager-merge-squash-update-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'feature']);
    const env = gitWorktreeManagerEnv(registryPath);
    expect(
      runGitWorktreeManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status,
    ).toBe(0);
    expect(
      runGitWorktreeManager(['worktree', 'create', 'feature', '--repo', 'Harbor'], env).status,
    ).toBe(0);

    writeFileSync(join(repoPath, 'master.txt'), 'from master\n');
    git(repoPath, ['add', 'master.txt']);
    git(repoPath, ['commit', '-m', 'master change']);

    const merged = runGitWorktreeManager(
      ['merge', '--repo', 'Harbor', '--update-from-master', 'feature', '--squash'],
      env,
    );
    expect(merged.status).toBe(0);

    const checkout = join(repoPath, '.workspaces', 'feature');
    expect(readFileSync(join(checkout, 'master.txt'), 'utf8')).toBe('from master\n');
    expect(git(checkout, ['log', '-1', '--format=%s'])).toBe('Squash master into feature');
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
    expect(git(repoPath, ['log', '-1', '--format=%s'])).toBe('master change');
  });

  it('merges a branch into master on the primary checkout', () => {
    const root = makeTempDir('git-worktree-manager-merge-into-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'feature']);
    const env = gitWorktreeManagerEnv(registryPath);
    expect(
      runGitWorktreeManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status,
    ).toBe(0);
    expect(
      runGitWorktreeManager(['worktree', 'create', 'feature', '--repo', 'Harbor'], env).status,
    ).toBe(0);

    const checkout = join(repoPath, '.workspaces', 'feature');
    writeFileSync(join(checkout, 'feature.txt'), 'from feature\n');
    git(checkout, ['add', 'feature.txt']);
    git(checkout, ['commit', '-m', 'feature change']);
    expect(existsSync(join(repoPath, 'feature.txt'))).toBe(false);

    const merged = runGitWorktreeManager(
      ['merge', '--repo', 'Harbor', '--into-master', 'feature'],
      env,
    );
    expect(merged.status).toBe(0);
    expect(readFileSync(join(repoPath, 'feature.txt'), 'utf8')).toBe('from feature\n');
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
    expect(git(checkout, ['branch', '--show-current'])).toBe('feature');
  });

  it('squashes a branch into master with the squash commit message', () => {
    const root = makeTempDir('git-worktree-manager-merge-squash-into-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    git(repoPath, ['branch', 'feature']);
    const env = gitWorktreeManagerEnv(registryPath);
    expect(
      runGitWorktreeManager(['add', '--path', repoPath, '--name', 'Harbor'], env).status,
    ).toBe(0);
    expect(
      runGitWorktreeManager(['worktree', 'create', 'feature', '--repo', 'Harbor'], env).status,
    ).toBe(0);

    const checkout = join(repoPath, '.workspaces', 'feature');
    writeFileSync(join(checkout, 'feature.txt'), 'from feature\n');
    git(checkout, ['add', 'feature.txt']);
    git(checkout, ['commit', '-m', 'feature change']);

    const merged = runGitWorktreeManager(
      ['merge', '--repo', 'Harbor', '--into-master', 'feature', '--squash'],
      env,
    );
    expect(merged.status).toBe(0);
    expect(readFileSync(join(repoPath, 'feature.txt'), 'utf8')).toBe('from feature\n');
    expect(git(repoPath, ['log', '-1', '--format=%s'])).toBe('Squash feature into master');
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
    expect(git(checkout, ['log', '-1', '--format=%s'])).toBe('feature change');
  });
});
