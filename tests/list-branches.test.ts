import { execFileSync } from 'node:child_process';
import { unlinkSync, utimesSync, writeFileSync } from 'node:fs';
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

  it('lists the default branch first and orders the other worktrees by newest commit', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const { feature, zeta } = addFeatureAndZeta(repoPath);
    commitAt(repoPath, '2020-01-01T00:00:00Z', 'old master');
    commitAt(feature, '2020-03-01T00:00:00Z', 'feature');
    commitAt(zeta, '2020-06-01T00:00:00Z', 'zeta');

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual([
      'master',
      'zeta',
      'feature',
    ]);
  });

  it('orders a worktree with a newer uncommitted file ahead of a later commit', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const { feature, zeta } = addFeatureAndZeta(repoPath);
    commitAt(repoPath, '2020-01-01T00:00:00Z', 'old master');
    commitAt(feature, '2020-06-01T00:00:00Z', 'feature');
    commitAt(zeta, '2020-01-01T00:00:00Z', 'zeta');
    const edited = join(zeta, 'README.md');
    writeFileSync(edited, '# edited\n');
    touchAt(edited, '2020-12-01T00:00:00Z');

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual([
      'master',
      'zeta',
      'feature',
    ]);
  });

  it('orders a worktree with a newer untracked file ahead of a later commit', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const { feature, zeta } = addFeatureAndZeta(repoPath);
    commitAt(repoPath, '2020-01-01T00:00:00Z', 'old master');
    commitAt(feature, '2020-06-01T00:00:00Z', 'feature');
    commitAt(zeta, '2020-01-01T00:00:00Z', 'zeta');
    const notes = join(zeta, 'notes.txt');
    writeFileSync(notes, 'new\n');
    touchAt(notes, '2020-12-01T00:00:00Z');

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual([
      'master',
      'zeta',
      'feature',
    ]);
  });

  it('orders a worktree with a newer deleted file ahead of a later commit', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const { feature, zeta } = addFeatureAndZeta(repoPath);
    commitAt(repoPath, '2020-01-01T00:00:00Z', 'old master');
    commitAt(feature, '2020-06-01T00:00:00Z', 'feature');
    commitAt(zeta, '2020-01-01T00:00:00Z', 'zeta');
    unlinkSync(join(zeta, 'README.md'));
    touchAt(zeta, '2020-12-01T00:00:00Z');

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual([
      'master',
      'zeta',
      'feature',
    ]);
  });

  it('orders by the commit when that is newer than the uncommitted file', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const { feature, zeta } = addFeatureAndZeta(repoPath);
    commitAt(repoPath, '2020-01-01T00:00:00Z', 'old master');
    commitAt(feature, '2020-03-01T00:00:00Z', 'feature');
    commitAt(zeta, '2020-06-01T00:00:00Z', 'zeta');
    const edited = join(zeta, 'README.md');
    writeFileSync(edited, '# old edit\n');
    touchAt(edited, '2020-01-01T00:00:00Z');

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual([
      'master',
      'zeta',
      'feature',
    ]);
  });

  it('keeps branch order when the last changes are equal', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const { feature, zeta } = addFeatureAndZeta(repoPath);
    commitAt(repoPath, '2020-01-01T00:00:00Z', 'old master');
    commitAt(feature, '2020-06-01T00:00:00Z', 'feature');
    commitAt(zeta, '2020-06-01T00:00:00Z', 'zeta');

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual([
      'master',
      'feature',
      'zeta',
    ]);
    expect(listWorktreeBranches(repoPath, listBranches(repoPath)).map((branch) => branch.name)).toEqual([
      'master',
      'feature',
      'zeta',
    ]);
  });

  it('leaves an ignored file out of the last change', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const { feature, zeta } = addFeatureAndZeta(repoPath);
    commitAt(repoPath, '2020-01-01T00:00:00Z', 'old master');
    commitAt(feature, '2020-06-01T00:00:00Z', 'feature');
    writeFileSync(join(zeta, '.gitignore'), 'secret.txt\n');
    git(zeta, ['add', '.gitignore']);
    commitAt(zeta, '2020-01-01T00:00:00Z', 'ignore secrets');
    const secret = join(zeta, 'secret.txt');
    writeFileSync(secret, 'hidden\n');
    touchAt(secret, '2020-12-01T00:00:00Z');

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual([
      'master',
      'feature',
      'zeta',
    ]);
  });

  it('orders checked out worktrees by last change when the default branch is absent', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    initGitRepo(repoPath);
    git(repoPath, ['checkout', '-b', 'feature']);
    git(repoPath, ['branch', 'zeta']);
    const zeta = join(repoPath, '.workspaces', 'zeta');
    git(repoPath, ['worktree', 'add', zeta, 'zeta']);
    commitAt(repoPath, '2020-03-01T00:00:00Z', 'feature');
    commitAt(zeta, '2020-06-01T00:00:00Z', 'zeta');

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual(['zeta', 'feature']);
  });

  it('orders by the committer date when the author date is older', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const { feature, zeta } = addFeatureAndZeta(repoPath);
    commitAt(repoPath, '2020-01-01T00:00:00Z', 'old master');
    commitWithDates(feature, '2020-06-01T00:00:00Z', '2020-03-01T00:00:00Z', 'feature');
    commitWithDates(zeta, '2020-01-01T00:00:00Z', '2020-12-01T00:00:00Z', 'zeta');

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual([
      'master',
      'zeta',
      'feature',
    ]);
  });

  it('orders by the commit when that is newer than a deleted file', () => {
    const root = makeTempDir('git-worktree-manager-list-branches-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const { feature, zeta } = addFeatureAndZeta(repoPath);
    commitAt(repoPath, '2020-01-01T00:00:00Z', 'old master');
    commitAt(feature, '2021-06-01T00:00:00Z', 'feature');
    commitAt(zeta, '2020-01-01T00:00:00Z', 'zeta');
    unlinkSync(join(zeta, 'README.md'));
    touchAt(zeta, '2020-12-01T00:00:00Z');

    expect(listWorktreeBranches(repoPath).map((branch) => branch.name)).toEqual([
      'master',
      'feature',
      'zeta',
    ]);
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

function addFeatureAndZeta(repoPath: string): { feature: string; zeta: string } {
  initGitRepo(repoPath);
  git(repoPath, ['branch', 'feature']);
  git(repoPath, ['branch', 'zeta']);
  const feature = join(repoPath, '.workspaces', 'feature');
  const zeta = join(repoPath, '.workspaces', 'zeta');
  git(repoPath, ['worktree', 'add', feature, 'feature']);
  git(repoPath, ['worktree', 'add', zeta, 'zeta']);
  return { feature, zeta };
}

function touchAt(path: string, date: string): void {
  const time = new Date(date);
  utimesSync(path, time, time);
}

function commitAt(cwd: string, date: string, message: string): void {
  commitWithDates(cwd, date, date, message);
}

function commitWithDates(cwd: string, authorDate: string, committerDate: string, message: string): void {
  execFileSync('git', ['commit', '--allow-empty', '-m', message], {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: authorDate,
      GIT_COMMITTER_DATE: committerDate,
    },
  });
}

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
