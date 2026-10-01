import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export type LayoutMode = 'workspaces' | 'sibling';

export interface RegisteredRepository {
  path: string;
  displayName: string;
  layout: LayoutMode;
}

export function resolveRegistryPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.GIT_MANAGER_REGISTRY_PATH ?? join(homedir(), '.config', 'git-manager', 'registry.db');
}

function openDatabase(env: NodeJS.ProcessEnv = process.env): Database.Database {
  const dbPath = resolveRegistryPath(env);
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      path TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      layout TEXT NOT NULL
    );
  `);
  return db;
}

function isGitRepository(repoPath: string): boolean {
  try {
    execFileSync('git', ['-C', repoPath, 'rev-parse', '--is-inside-work-tree'], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

export function addRepository(
  repoPath: string,
  displayName: string,
  layout: LayoutMode,
): RegisteredRepository {
  if (layout !== 'workspaces' && layout !== 'sibling') {
    throw new Error(`Unsupported layout: ${layout}`);
  }
  const path = resolve(repoPath);
  if (!isGitRepository(path)) {
    throw new Error(`Not a git repository: ${path}`);
  }
  const record = { path, displayName, layout };
  const db = openDatabase();
  try {
    db.prepare(
      `INSERT INTO repositories (path, display_name, layout)
       VALUES (?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         display_name = excluded.display_name,
         layout = excluded.layout`,
    ).run(path, displayName, layout);
    return record;
  } finally {
    db.close();
  }
}

export function listRepositories(): RegisteredRepository[] {
  const db = openDatabase();
  try {
    const rows = db
      .prepare(
        'SELECT path, display_name, layout FROM repositories ORDER BY path',
      )
      .all() as Array<{ path: string; display_name: string; layout: LayoutMode }>;
    return rows.map((row) => ({
      path: row.path,
      displayName: row.display_name,
      layout: row.layout,
    }));
  } finally {
    db.close();
  }
}

export function unregisterRepository(repoPath: string): void {
  const path = resolve(repoPath);
  const db = openDatabase();
  try {
    const result = db.prepare('DELETE FROM repositories WHERE path = ?').run(path);
    if (result.changes === 0) {
      throw new Error(`Repository is not registered: ${path}`);
    }
  } finally {
    db.close();
  }
}

export function findRepository(query: string): RegisteredRepository | undefined {
  const resolved = resolve(query);
  const repositories = listRepositories();
  return (
    repositories.find((repository) => repository.path === resolved) ??
    repositories.find((repository) => repository.displayName === query)
  );
}
