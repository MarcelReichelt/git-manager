import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createTempDir, initRepoWithRemote, setupTestEnv } from './helpers.js';
import { cloneRepo } from '../src/commands/clone.js';
import { getRepositoryByName, listWorktrees } from '../src/core/registry.js';

describe('cloneRepo', () => {
  let cleanup: () => void;
  let base: string;
  let remotePath: string;

  beforeEach(() => {
    base = createTempDir();
    cleanup = setupTestEnv(base).cleanup;
    remotePath = join(base, 'origin.git');
    const seed = join(base, 'seed');
    initRepoWithRemote(seed, remotePath);
  });

  afterEach(() => {
    cleanup();
  });

  it('clones and registers a workspaces-layout repo', async () => {
    const dest = join(base, 'cloned-workspaces');

    await cloneRepo(remotePath, { path: dest, layout: 'workspaces' });

    expect(existsSync(join(dest, 'README.md'))).toBe(true);
    expect(existsSync(join(dest, '.gitignore'))).toBe(true);

    const repo = getRepositoryByName('cloned-workspaces');
    expect(repo).toBeDefined();
    expect(repo!.layout_mode).toBe('workspaces');
    expect(repo!.git_root).toBe(dest);
    expect(listWorktrees(repo!.id).some((w) => w.is_primary)).toBe(true);
  });

  it('clones and registers a sibling-layout repo with a primary checkout dir', async () => {
    const dest = join(base, 'cloned-sibling');

    await cloneRepo(remotePath, { path: dest, layout: 'sibling' });

    expect(existsSync(join(dest, 'main', 'README.md'))).toBe(true);
    expect(existsSync(join(dest, '.git-manager'))).toBe(true);

    const repo = getRepositoryByName('cloned-sibling');
    expect(repo).toBeDefined();
    expect(repo!.layout_mode).toBe('sibling');
    expect(repo!.git_root).toBe(join(dest, 'main'));
    expect(repo!.primary_branch).toBe('main');
  });
});
