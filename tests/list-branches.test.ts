import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  listBranches,
  listWorktreeBranches,
  pruneRemoteTrackingRefs,
  refreshRemoteHead,
} from '../src/branches.js';
import { git, initGitRepo, makeTempDir, removeTemp } from './cli/run.js';

describe('listBranches', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      removeTemp(root);
    }
  });

  it('keeps remote-tracking refs until prune runs', () => {
    const root = makeTempDir('git-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const origin = join(root, 'origin.git');
    initGitRepo(repoPath);
    execFileSync('git', ['init', '--bare', '-b', 'master', origin], { stdio: 'ignore' });
    git(repoPath, ['remote', 'add', 'origin', origin]);
    git(repoPath, ['push', '-u', 'origin', 'master']);
    git(repoPath, ['update-ref', 'refs/remotes/origin/stale', git(repoPath, ['rev-parse', 'HEAD'])]);

    expect(listBranches(repoPath).some((branch) => branch.name === 'origin/stale')).toBe(true);

    pruneRemoteTrackingRefs(repoPath);

    expect(listBranches(repoPath).some((branch) => branch.name === 'origin/stale')).toBe(false);
  });

  it('lists main first when the remote default branch changed from master and the stored HEAD still says master', () => {
    const root = makeTempDir('git-manager-list-branches-');
    roots.push(root);
    const repoPath = switchedDefaultRepository(root);

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual(['main', 'feature', 'zeta']);
  });

  it('lists main ahead of a master worktree when the remote default branch is main', () => {
    const root = makeTempDir('git-manager-list-branches-');
    roots.push(root);
    const repoPath = switchedDefaultRepository(root);
    git(repoPath, ['worktree', 'add', join(repoPath, '.workspaces', 'master'), 'master']);

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual([
      'main',
      'feature',
      'master',
      'zeta',
    ]);
  });

  it('lists main first when the only remote is not named origin', () => {
    const root = makeTempDir('git-manager-list-branches-');
    roots.push(root);
    const repoPath = switchedDefaultRepository(root, 'upstream');

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual(['main', 'feature', 'zeta']);
  });

  it('asks again for the remote default branch when the repository is opened again', () => {
    const root = makeTempDir('git-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const origin = join(root, 'origin.git');
    initGitRepo(repoPath);
    execFileSync('git', ['init', '--bare', '-b', 'master', origin], { stdio: 'ignore' });
    git(repoPath, ['remote', 'add', 'origin', origin]);
    git(repoPath, ['push', '-u', 'origin', 'master']);
    git(repoPath, ['branch', 'feature']);
    git(repoPath, ['worktree', 'add', join(repoPath, '.workspaces', 'feature'), 'feature']);

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual(['master', 'feature']);

    git(repoPath, ['checkout', '-b', 'main']);
    git(repoPath, ['push', 'origin', 'main']);
    execFileSync('git', ['--git-dir', origin, 'symbolic-ref', 'HEAD', 'refs/heads/main'], { stdio: 'ignore' });

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual(['feature', 'main']);

    refreshRemoteHead(repoPath);

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual(['main', 'feature']);
  });

  it('keeps the stored default branch when the remote cannot be asked', () => {
    const root = makeTempDir('git-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    initGitRepo(repoPath);
    git(repoPath, ['remote', 'add', 'origin', 'https://example.com/harbor.git']);
    git(repoPath, ['update-ref', 'refs/remotes/origin/master', git(repoPath, ['rev-parse', 'HEAD'])]);
    git(repoPath, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/master']);
    git(repoPath, ['branch', 'feature']);
    git(repoPath, ['worktree', 'add', join(repoPath, '.workspaces', 'feature'), 'feature']);

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual(['master', 'feature']);
  });

  it('lists the checked out branches when the remote default branch has no local branch', () => {
    const root = makeTempDir('git-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const origin = join(root, 'origin.git');
    initGitRepo(repoPath);
    execFileSync('git', ['init', '--bare', '-b', 'master', origin], { stdio: 'ignore' });
    git(repoPath, ['remote', 'add', 'origin', origin]);
    git(repoPath, ['push', '-u', 'origin', 'master']);
    git(repoPath, ['checkout', '-b', 'main']);
    git(repoPath, ['push', 'origin', 'main']);
    git(repoPath, ['checkout', 'master']);
    git(repoPath, ['branch', '-D', 'main']);
    execFileSync('git', ['--git-dir', origin, 'symbolic-ref', 'HEAD', 'refs/heads/main'], { stdio: 'ignore' });
    git(repoPath, ['remote', 'set-head', 'origin', 'master']);
    git(repoPath, ['branch', 'feature']);
    git(repoPath, ['worktree', 'add', join(repoPath, '.workspaces', 'feature'), 'feature']);

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual(['master', 'feature']);
  });
});

function switchedDefaultRepository(root: string, remote = 'origin'): string {
  const repoPath = join(root, 'harbor');
  const origin = join(root, 'origin.git');
  initGitRepo(repoPath);
  execFileSync('git', ['init', '--bare', '-b', 'master', origin], { stdio: 'ignore' });
  git(repoPath, ['remote', 'add', remote, origin]);
  git(repoPath, ['push', '-u', remote, 'master']);
  git(repoPath, ['checkout', '-b', 'main']);
  git(repoPath, ['push', remote, 'main']);
  execFileSync('git', ['--git-dir', origin, 'symbolic-ref', 'HEAD', 'refs/heads/main'], { stdio: 'ignore' });
  git(repoPath, ['remote', 'set-head', remote, 'master']);
  git(repoPath, ['branch', 'feature']);
  git(repoPath, ['branch', 'zeta']);
  git(repoPath, ['worktree', 'add', join(repoPath, '.workspaces', 'feature'), 'feature']);
  git(repoPath, ['worktree', 'add', join(repoPath, '.workspaces', 'zeta'), 'zeta']);
  return repoPath;
}
