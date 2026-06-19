import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { createTempDir, initRepo, setupTestEnv } from './helpers.js';
import { saveGlobalConfig, loadGlobalConfig, isSetupComplete } from '../src/config/loader.js';
import { defaultGlobalConfig } from '../src/config/schema.js';
import { resolveFromGitRoot } from '../src/core/context.js';
import { registerContext } from '../src/core/register-service.js';
import { getRepositoryByName, listWorktrees } from '../src/core/registry.js';

describe('config', () => {
  let cleanup: () => void;

  beforeEach(() => {
    const base = createTempDir();
    const env = setupTestEnv(base);
    cleanup = env.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('loads default global config', () => {
    const config = defaultGlobalConfig();
    expect(config.defaults.clone_root).toBe('~/DEV');
    expect(config.defaults.layout_mode).toBe('workspaces');
  });

  it('detects setup incomplete without editor', () => {
    saveGlobalConfig({ ...defaultGlobalConfig(), meta: { setup_completed: false, setup_version: 1 } });
    expect(isSetupComplete()).toBe(false);
  });

  it('saves and loads global config', () => {
    const config = defaultGlobalConfig();
    config.editor.command = 'nvim';
    config.meta.setup_completed = true;
    saveGlobalConfig(config);
    const loaded = loadGlobalConfig();
    expect(loaded.editor.command).toBe('nvim');
    expect(loaded.meta.setup_completed).toBe(true);
  });
});

describe('layout inference', () => {
  let cleanup: () => void;
  let base: string;

  beforeEach(() => {
    base = createTempDir();
    const env = setupTestEnv(base);
    cleanup = env.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('infers workspaces when git root folder name differs from branch', async () => {
    const repoPath = join(base, 'my-app');
    initRepo(repoPath, { initialBranch: 'main' });
    const ctx = await resolveFromGitRoot(repoPath);
    expect(ctx.layoutMode).toBe('workspaces');
    expect(ctx.layoutRoot).toBe(repoPath);
  });

  it('infers sibling when checkout folder matches primary branch', async () => {
    const layoutRoot = join(base, 'my-project');
    const gitRoot = join(layoutRoot, 'main');
    initRepo(gitRoot, { initialBranch: 'main' });
    const ctx = await resolveFromGitRoot(gitRoot);
    expect(ctx.layoutMode).toBe('sibling');
    expect(ctx.layoutRoot).toBe(layoutRoot);
  });
});

describe('register', () => {
  let cleanup: () => void;
  let base: string;

  beforeEach(() => {
    base = createTempDir();
    const env = setupTestEnv(base);
    cleanup = env.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('registers repo and primary worktree', async () => {
    const repoPath = join(base, 'test-repo');
    initRepo(repoPath);
    const ctx = await resolveFromGitRoot(repoPath);
    await registerContext(ctx);
    const repo = getRepositoryByName('test-repo');
    expect(repo).toBeDefined();
    expect(repo!.layout_mode).toBe('workspaces');
    const worktrees = listWorktrees(repo!.id);
    expect(worktrees.length).toBeGreaterThan(0);
    expect(worktrees.some((w) => w.is_primary)).toBe(true);
  });
});

describe('ensureActiveRepository', () => {
  let cleanup: () => void;
  let base: string;
  let previousCwd: string;

  beforeEach(() => {
    previousCwd = process.cwd();
    base = createTempDir();
    const env = setupTestEnv(base);
    cleanup = env.cleanup;
  });

  afterEach(() => {
    process.chdir(previousCwd);
    cleanup();
  });

  it('auto-selects repository when started inside a git repo', async () => {
    const repoPath = join(base, 'test-repo');
    initRepo(repoPath);
    process.chdir(repoPath);

    const { ensureActiveRepository } = await import('../src/core/startup-context.js');
    const { getActiveContext } = await import('../src/core/active-session.js');

    await ensureActiveRepository({ promptIfMissing: false });

    const ctx = getActiveContext();
    expect(ctx).toBeDefined();
    expect(ctx!.repository.name).toBe('test-repo');
  });
});

describe('gitignore workspaces', () => {
  it('appends .workspaces to gitignore', async () => {
    const base = createTempDir();
    setupTestEnv(base);
    const repoPath = join(base, 'repo');
    initRepo(repoPath);
    const { ensureGitignoreEntry } = await import('../src/core/git-service.js');
    await ensureGitignoreEntry(repoPath, '.workspaces');
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(join(repoPath, '.gitignore'), 'utf8');
    expect(content).toContain('.workspaces/');
  });
});
