import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listBranches, pruneRemoteTrackingRefs } from '../src/branches.js';
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
});
