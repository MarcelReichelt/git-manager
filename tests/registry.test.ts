import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addRepository, listRepositories } from '../src/registry.js';

describe('registry schema', () => {
  const roots: string[] = [];
  const previousRegistryPath = process.env.GIT_MANAGER_REGISTRY_PATH;

  afterEach(() => {
    if (previousRegistryPath === undefined) {
      delete process.env.GIT_MANAGER_REGISTRY_PATH;
    } else {
      process.env.GIT_MANAGER_REGISTRY_PATH = previousRegistryPath;
    }
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('opens an empty registry when the file was created before display_name existed', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-old-registry-'));
    roots.push(root);
    const registryPath = join(root, 'registry.db');
    const db = new Database(registryPath);
    db.exec(`
      CREATE TABLE repositories (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        git_root TEXT NOT NULL,
        primary_branch TEXT NOT NULL,
        layout_mode TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    db.prepare(
      `INSERT INTO repositories (name, path, git_root, primary_branch, layout_mode, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('Harbor', '/repos/harbor', '/repos/harbor', 'main', 'in-place', '2020-01-01T00:00:00.000Z');
    db.close();

    process.env.GIT_MANAGER_REGISTRY_PATH = registryPath;

    expect(listRepositories()).toEqual([]);

    const listed = new Database(registryPath, { readonly: true });
    const columns = listed.prepare('PRAGMA table_info(repositories)').all() as Array<{ name: string }>;
    listed.close();
    expect(columns.map((column) => column.name)).toEqual(['path', 'display_name']);
  });

  it('replaces an older registry and adds a registered repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-legacy-registry-'));
    roots.push(root);
    const registryPath = join(root, 'registry.db');
    const db = new Database(registryPath);
    db.exec(`
      CREATE TABLE repositories (
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        git_root TEXT NOT NULL,
        primary_branch TEXT NOT NULL,
        layout_mode TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    db.prepare(
      `INSERT INTO repositories (name, path, git_root, primary_branch, layout_mode, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('Harbor', '/repos/harbor', '/repos/harbor', 'main', 'in-place', '2020-01-01T00:00:00.000Z');
    db.close();
    writeFileSync(`${registryPath}-wal`, '');
    writeFileSync(`${registryPath}-shm`, '');
    writeFileSync(`${registryPath}-journal`, '');

    const repoPath = join(root, 'atlas');
    mkdirSync(repoPath);
    execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath, stdio: 'ignore' });

    process.env.GIT_MANAGER_REGISTRY_PATH = registryPath;

    expect(listRepositories()).toEqual([]);
    expect(existsSync(`${registryPath}-wal`)).toBe(false);
    expect(existsSync(`${registryPath}-shm`)).toBe(false);
    expect(existsSync(`${registryPath}-journal`)).toBe(false);

    const listed = new Database(registryPath, { readonly: true });
    const columns = listed.prepare('PRAGMA table_info(repositories)').all() as Array<{ name: string }>;
    listed.close();
    expect(columns.map((column) => column.name)).toEqual(['path', 'display_name']);

    expect(addRepository(repoPath, 'Atlas')).toEqual({
      path: resolve(repoPath),
      displayName: 'Atlas',
    });
    expect(listRepositories()).toEqual([{ path: resolve(repoPath), displayName: 'Atlas' }]);
  });
});
