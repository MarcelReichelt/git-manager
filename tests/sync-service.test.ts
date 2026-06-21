import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import {
  createTempDir,
  initRepoWithRemote,
  pushExternalCommit,
  setupTestEnv,
  runGit,
} from './helpers.js';
import { resolveFromGitRoot } from '../src/core/context.js';
import { registerContext } from '../src/core/register-service.js';
import { getPrimaryWorktree, listWorktrees, type Worktree } from '../src/core/registry.js';
import { createWorktree } from '../src/core/worktree-service.js';
import {
  pullWorktree,
  pushWorktree,
  pullAllWorktrees,
  getSyncStatus,
} from '../src/core/sync-service.js';

async function setupRepoWithRemote(base: string) {
  const remotePath = join(base, 'origin.git');
  const repoPath = join(base, 'repo');
  initRepoWithRemote(repoPath, remotePath);
  const ctx = await resolveFromGitRoot(repoPath);
  const repo = await registerContext(ctx);
  return { remotePath, repoPath, repo };
}

function remoteHasBranch(remotePath: string, branch: string): boolean {
  const refs = runGit(`ls-remote --heads "${remotePath}"`, process.cwd());
  return refs.includes(`refs/heads/${branch}`);
}

describe('pushWorktree', () => {
  let cleanup: () => void;
  let base: string;

  beforeEach(() => {
    base = createTempDir();
    cleanup = setupTestEnv(base).cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('pushes a new branch and sets upstream', async () => {
    const { remotePath, repo } = await setupRepoWithRemote(base);
    const feature = await createWorktree(repo, 'feature', { newBranch: true });
    writeFileSync(join(feature.path, 'feature.txt'), 'feature work\n');
    runGit('add . && git commit -m "feature work"', feature.path);

    expect(remoteHasBranch(remotePath, 'feature')).toBe(false);

    const result = await pushWorktree(repo, feature, { setUpstream: true });

    expect(remoteHasBranch(remotePath, 'feature')).toBe(true);
    expect(result.upstream).toContain('feature');
    expect(runGit('rev-parse --abbrev-ref feature@{upstream}', feature.path)).toBe('origin/feature');
  });

  it('rejects pushing a branch without an upstream', async () => {
    const { repo } = await setupRepoWithRemote(base);
    const feature = await createWorktree(repo, 'feature', { newBranch: true });

    await expect(pushWorktree(repo, feature)).rejects.toThrow(/no upstream/i);
  });

  it('blocks push of a dirty worktree in strict mode', async () => {
    const { repo } = await setupRepoWithRemote(base);
    const primary = getPrimaryWorktree(repo.id) as Worktree;
    writeFileSync(join(primary.path, 'dirty.txt'), 'uncommitted\n');

    await expect(pushWorktree(repo, primary, { strict: true })).rejects.toThrow(
      /uncommitted changes/i,
    );
  });
});

describe('pullWorktree', () => {
  let cleanup: () => void;
  let base: string;

  beforeEach(() => {
    base = createTempDir();
    cleanup = setupTestEnv(base).cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('pulls commits pushed to the remote by someone else', async () => {
    const { remotePath, repo } = await setupRepoWithRemote(base);
    const primary = getPrimaryWorktree(repo.id) as Worktree;

    pushExternalCommit(remotePath, base, { fileName: 'remote.txt' });
    expect(existsSync(join(primary.path, 'remote.txt'))).toBe(false);

    await pullWorktree(repo, primary);

    expect(existsSync(join(primary.path, 'remote.txt'))).toBe(true);
  });

  it('rejects pulling a branch without an upstream', async () => {
    const { repo } = await setupRepoWithRemote(base);
    const feature = await createWorktree(repo, 'feature', { newBranch: true });

    await expect(pullWorktree(repo, feature)).rejects.toThrow(/no upstream/i);
  });
});

describe('pullAllWorktrees', () => {
  let cleanup: () => void;
  let base: string;

  beforeEach(() => {
    base = createTempDir();
    cleanup = setupTestEnv(base).cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('pulls tracking worktrees and skips those without an upstream', async () => {
    const { remotePath, repo } = await setupRepoWithRemote(base);
    const primary = getPrimaryWorktree(repo.id) as Worktree;
    await createWorktree(repo, 'feature', { newBranch: true });

    pushExternalCommit(remotePath, base, { fileName: 'remote.txt' });

    await pullAllWorktrees(repo, listWorktrees(repo.id));

    expect(existsSync(join(primary.path, 'remote.txt'))).toBe(true);
  });
});

describe('getSyncStatus', () => {
  let cleanup: () => void;
  let base: string;

  beforeEach(() => {
    base = createTempDir();
    cleanup = setupTestEnv(base).cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('reports ahead/behind against the upstream', async () => {
    const { repo } = await setupRepoWithRemote(base);
    const primary = getPrimaryWorktree(repo.id) as Worktree;

    const initial = await getSyncStatus(primary);
    expect(initial).toMatchObject({ ahead: 0, behind: 0, upstream: 'origin/main' });

    writeFileSync(join(primary.path, 'local.txt'), 'local work\n');
    runGit('add . && git commit -m "local work"', primary.path);

    const afterCommit = await getSyncStatus(primary);
    expect(afterCommit.ahead).toBe(1);
    expect(afterCommit.behind).toBe(0);
  });
});
