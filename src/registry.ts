import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import Database from 'better-sqlite3';

export type RegisteredRepository = {
  path: string;
  displayName: string;
};

export function resolveRegistryPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.GIT_MANAGER_REGISTRY_PATH;
  if (override && override.trim().length > 0) {
    return resolve(override);
  }
  return join(homedir(), '.config', 'git-manager', 'registry.db');
}

function openRegistry(env?: NodeJS.ProcessEnv): Database.Database {
  const path = resolveRegistryPath(env);
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      path TEXT PRIMARY KEY,
      display_name TEXT NOT NULL
    );
  `);
  return db;
}

export function addRepository(repoPath: string, displayName: string): RegisteredRepository {
  const path = resolve(repoPath);
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: path,
      stdio: 'ignore',
    });
  } catch {
    throw new Error(`Not a git repository: ${path}`);
  }

  const db = openRegistry();
  try {
    db.prepare('INSERT INTO repositories (path, display_name) VALUES (?, ?)').run(path, displayName);
  } finally {
    db.close();
  }
  return { path, displayName };
}

export function unregisterRepository(repoPath: string): void {
  const path = resolve(repoPath);
  const db = openRegistry();
  try {
    const result = db.prepare('DELETE FROM repositories WHERE path = ?').run(path);
    if (result.changes === 0) {
      throw new Error(`Repository is not registered: ${path}`);
    }
  } finally {
    db.close();
  }
}

export function listRepositories(): RegisteredRepository[] {
  const db = openRegistry();
  try {
    const rows = db
      .prepare('SELECT path, display_name FROM repositories ORDER BY display_name, path')
      .all() as { path: string; display_name: string }[];
    return rows.map((row) => ({ path: row.path, displayName: row.display_name }));
  } finally {
    db.close();
  }
}
