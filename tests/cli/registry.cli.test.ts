import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  gitWorktreeManagerEnv,
  initGitRepo,
  makeTempDir,
  removeTemp,
  runGitWorktreeManager,
} from './run.js';

describe('git-worktree-manager registry', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      removeTemp(root);
    }
  });

  it('adds, lists, and unregisters a git repository at GIT_WORKTREE_MANAGER_REGISTRY_PATH', () => {
    const root = makeTempDir('git-worktree-manager-registry-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    const env = gitWorktreeManagerEnv(registryPath);

    const added = runGitWorktreeManager(
      ['add', '--path', repoPath, '--name', 'Harbor'],
      env,
    );
    expect(added.status).toBe(0);

    const listed = runGitWorktreeManager(['list'], env);
    expect(listed.status).toBe(0);
    expect(listed.stdout).toBe(`Harbor\t${resolve(repoPath)}\n`);

    const removed = runGitWorktreeManager(['unregister', '--path', repoPath], env);
    expect(removed.status).toBe(0);

    const after = runGitWorktreeManager(['list'], env);
    expect(after.status).toBe(0);
    expect(after.stdout).toBe('');
  });

  it('records only a path and a display name', () => {
    const root = makeTempDir('git-worktree-manager-layout-');
    roots.push(root);
    const repoPath = join(root, 'atlas');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    const env = gitWorktreeManagerEnv(registryPath);

    const added = runGitWorktreeManager(['add', '--path', repoPath, '--name', 'Atlas'], env);
    expect(added.status).toBe(0);

    const listed = runGitWorktreeManager(['list'], env);
    expect(listed.stdout).toBe(`Atlas\t${resolve(repoPath)}\n`);

    const rejected = runGitWorktreeManager(
      ['add', '--path', repoPath, '--name', 'Atlas', '--layout', 'sibling'],
      env,
    );
    expect(rejected.status).not.toBe(0);

    const db = new Database(registryPath, { readonly: true });
    const columns = db.prepare('PRAGMA table_info(repositories)').all() as Array<{ name: string }>;
    db.close();
    expect(columns.map((column) => column.name)).toEqual(['path', 'display_name']);
  });

  it('stores a repositories table and no worktree or session table', () => {
    const root = makeTempDir('git-worktree-manager-schema-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    const env = gitWorktreeManagerEnv(registryPath);

    const added = runGitWorktreeManager(
      ['add', '--path', repoPath, '--name', 'Harbor'],
      env,
    );
    expect(added.status).toBe(0);

    const db = new Database(registryPath, { readonly: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    db.close();
    const names = tables.map((table) => table.name);

    expect(names).toContain('repositories');
    expect(names.filter((name) => name.toLowerCase().includes('worktree'))).toEqual([]);
    expect(names.filter((name) => name.toLowerCase().includes('session'))).toEqual([]);
  });

  it('rejects a path that is not a git repository', () => {
    const root = makeTempDir('git-worktree-manager-not-git-');
    roots.push(root);
    const plain = join(root, 'plain');
    mkdirSync(plain);
    const env = gitWorktreeManagerEnv(join(root, 'registry.db'));

    const added = runGitWorktreeManager(['add', '--path', plain, '--name', 'Plain'], env);
    expect(added.status).toBe(1);
    expect(added.stderr).toContain('Not a git repository');
    expect(runGitWorktreeManager(['list'], env).stdout).toBe('');
  });
});
