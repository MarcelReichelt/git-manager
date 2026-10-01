import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const createRepositoriesTable = `
  CREATE TABLE repositories (
    path TEXT PRIMARY KEY,
    display_name TEXT NOT NULL
  );
`;

export interface RegisteredRepository {
  path: string;
  displayName: string;
}

export function resolveRegistryPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.GIT_MANAGER_REGISTRY_PATH ?? join(homedir(), '.config', 'git-manager', 'registry.db');
}

function openDatabase(env: NodeJS.ProcessEnv = process.env): Database.Database {
  const dbPath = resolveRegistryPath(env);
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'repositories'")
    .get();
  if (!table) {
    db.exec(createRepositoriesTable);
    return db;
  }
  const columns = db.prepare('PRAGMA table_info(repositories)').all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));
  if (names.size === 2 && names.has('path') && names.has('display_name')) {
    return db;
  }
  db.close();
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`]) {
    rmSync(path, { force: true });
  }
  const fresh = new Database(dbPath);
  fresh.exec(createRepositoriesTable);
  return fresh;
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

export function addRepository(repoPath: string, displayName: string): RegisteredRepository {
  const path = resolve(repoPath);
  if (!isGitRepository(path)) {
    throw new Error(`Not a git repository: ${path}`);
  }
  const record = { path, displayName };
  const db = openDatabase();
  try {
    db.prepare(
      `INSERT INTO repositories (path, display_name)
       VALUES (?, ?)
       ON CONFLICT(path) DO UPDATE SET
         display_name = excluded.display_name`,
    ).run(path, displayName);
    return record;
  } finally {
    db.close();
  }
}

export function listRepositories(): RegisteredRepository[] {
  const db = openDatabase();
  try {
    const rows = db
      .prepare('SELECT path, display_name FROM repositories ORDER BY path')
      .all() as Array<{ path: string; display_name: string }>;
    return rows.map((row) => ({
      path: row.path,
      displayName: row.display_name,
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
