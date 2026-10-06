import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  listBranches,
  listWorktreeBranches,
  pruneRemoteTrackingRefs,
  readChangedFiles,
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
    const root = makeTempDir('git-worktree-manager-list-branches-');
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
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = switchedDefaultRepository(root);

    refreshRemoteHead(repoPath);

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual(['main', 'feature', 'zeta']);
  });

  it('lists main ahead of a master worktree when the remote default branch is main', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = switchedDefaultRepository(root);
    git(repoPath, ['worktree', 'add', join(repoPath, '.workspaces', 'master'), 'master']);

    refreshRemoteHead(repoPath);

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual([
      'main',
      'feature',
      'master',
      'zeta',
    ]);
  });

  it('lists main first when the only remote is not named origin', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = switchedDefaultRepository(root, 'upstream');

    refreshRemoteHead(repoPath);

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual(['main', 'feature', 'zeta']);
  });

  it('asks again for the remote default branch when the repository is opened again', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
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
    const root = makeTempDir('git-worktree-manager-list-branches-');
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
    const root = makeTempDir('git-worktree-manager-list-branches-');
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

  it('keeps the stored default branch until the remote is asked', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = switchedDefaultRepository(root);

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual(['feature', 'main', 'zeta']);
  });

  it('counts a renamed path once and reads untracked line counts from the file', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    initGitRepo(repoPath);
    git(repoPath, ['mv', 'README.md', 'guide.md']);
    writeFileSync(join(repoPath, 'notes.txt'), 'one\ntwo\n');
    writeFileSync(join(repoPath, 'logo.bin'), Buffer.from([0x00, 0x01]));

    const master = listBranches(repoPath).find((branch) => branch.name === 'master');
    expect(master?.changedFileCount).toBe(3);

    const files = readChangedFiles(repoPath, 'master');
    const notes = files.find((file) => file.path === 'notes.txt');
    const logo = files.find((file) => file.path === 'logo.bin');
    expect(files.some((file) => file.path === 'guide.md' && file.previousPath === 'README.md')).toBe(true);
    expect(notes).toMatchObject({ added: 2, deleted: 0, binary: false });
    expect(logo).toMatchObject({ added: null, deleted: null, binary: true });
  });

  it('counts commits against the default branch when a branch has no upstream', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    initGitRepo(repoPath);
    git(repoPath, ['checkout', '-b', 'feature']);
    git(repoPath, ['commit', '--allow-empty', '-m', 'one']);
    git(repoPath, ['commit', '--allow-empty', '-m', 'two']);
    git(repoPath, ['checkout', 'master']);
    git(repoPath, ['commit', '--allow-empty', '-m', 'master']);

    const feature = listBranches(repoPath).find((branch) => branch.name === 'feature');
    expect(feature).toMatchObject({ status: 'local-only', ahead: 2, behind: 1, changedFileCount: 0 });
  });

  it('reports ahead and behind for a branch that matches its upstream', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const origin = join(root, 'origin.git');
    initGitRepo(repoPath);
    execFileSync('git', ['init', '--bare', '-b', 'master', origin], { stdio: 'ignore' });
    git(repoPath, ['remote', 'add', 'origin', origin]);
    git(repoPath, ['push', '-u', 'origin', 'master']);
    git(repoPath, ['checkout', '-b', 'feature']);
    writeFileSync(join(repoPath, 'feature.txt'), 'feature\n');
    git(repoPath, ['add', 'feature.txt']);
    git(repoPath, ['commit', '-m', 'feature']);
    git(repoPath, ['push', '-u', 'origin', 'feature']);
    git(repoPath, ['commit', '--allow-empty', '-m', 'published']);
    git(repoPath, ['push']);
    git(repoPath, ['reset', '--hard', 'HEAD~1']);
    git(repoPath, ['commit', '--allow-empty', '-m', 'local-1']);
    git(repoPath, ['commit', '--allow-empty', '-m', 'local-2']);
    git(repoPath, ['checkout', 'master']);
    writeFileSync(join(repoPath, 'master.txt'), 'master\n');
    git(repoPath, ['add', 'master.txt']);
    git(repoPath, ['commit', '-m', 'master']);
    git(repoPath, ['push']);

    const feature = listBranches(repoPath).find((branch) => branch.name === 'feature');
    const master = listBranches(repoPath).find((branch) => branch.name === 'master');
    expect(feature).toMatchObject({ status: 'local-and-remote', ahead: 2, behind: 1 });
    expect(master).toMatchObject({ status: 'local-and-remote', ahead: 0, behind: 0 });
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
