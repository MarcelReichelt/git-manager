import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listRepositories } from '../src/registry.js';

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

  it('reads display names from a registry created before display_name existed', () => {
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

    expect(listRepositories()).toEqual([{ path: '/repos/harbor', displayName: 'Harbor' }]);
  });
});
