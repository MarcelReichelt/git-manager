import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getRegistryPathDefault, getGlobalConfigDir } from '../config/paths.js';
import type { LayoutMode } from '../config/schema.js';

export interface Repository {
  id: number;
  name: string;
  path: string;
  git_root: string;
  primary_branch: string;
  remote_url: string | null;
  layout_mode: LayoutMode;
  last_opened_at: string | null;
  created_at: string;
}

export interface Worktree {
  id: number;
  repository_id: number;
  branch: string;
  path: string;
  label: string | null;
  is_primary: number;
  created_at: string;
}

export interface ActiveSession {
  repository_id: number;
  worktree_id: number;
  updated_at: string;
}

let dbInstance: Database.Database | null = null;

export function getRegistryPath(): string {
  return process.env.GIT_MANAGER_REGISTRY_PATH ?? getRegistryPathDefault();
}

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }
  const dbPath = getRegistryPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (dbPath === getRegistryPathDefault() && !existsSync(getGlobalConfigDir())) {
    mkdirSync(getGlobalConfigDir(), { recursive: true });
  }
  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  initSchema(dbInstance);
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      git_root TEXT NOT NULL,
      primary_branch TEXT NOT NULL,
      remote_url TEXT,
      layout_mode TEXT NOT NULL,
      last_opened_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS worktrees (
      id INTEGER PRIMARY KEY,
      repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      branch TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      label TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS active_sessions (
      repository_id INTEGER PRIMARY KEY REFERENCES repositories(id) ON DELETE CASCADE,
      worktree_id INTEGER NOT NULL REFERENCES worktrees(id) ON DELETE CASCADE,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS global_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      active_repository_id INTEGER REFERENCES repositories(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL
    );

    INSERT OR IGNORE INTO global_state (id, active_repository_id, updated_at)
    VALUES (1, NULL, datetime('now'));
  `);
}

export function listRepositories(): Repository[] {
  return getDb().prepare('SELECT * FROM repositories ORDER BY name').all() as Repository[];
}

export function getRepository(id: number): Repository | undefined {
  return getDb().prepare('SELECT * FROM repositories WHERE id = ?').get(id) as Repository | undefined;
}

export function getRepositoryByPath(path: string): Repository | undefined {
  return getDb().prepare('SELECT * FROM repositories WHERE path = ?').get(path) as Repository | undefined;
}

export function getRepositoryByName(name: string): Repository | undefined {
  return getDb().prepare('SELECT * FROM repositories WHERE name = ?').get(name) as Repository | undefined;
}

export function findRepositoryByGitRoot(gitRoot: string): Repository | undefined {
  const repos = listRepositories();
  return repos.find((r) => gitRoot === r.git_root || gitRoot.startsWith(r.path + '/'));
}

export function upsertRepository(input: {
  name: string;
  path: string;
  gitRoot: string;
  primaryBranch: string;
  remoteUrl?: string | null;
  layoutMode: LayoutMode;
}): Repository {
  const now = new Date().toISOString();
  const existing = getRepositoryByPath(input.path);
  if (existing) {
    getDb()
      .prepare(
        `UPDATE repositories SET name = ?, git_root = ?, primary_branch = ?, remote_url = ?,
         layout_mode = ?, last_opened_at = ? WHERE id = ?`,
      )
      .run(
        input.name,
        input.gitRoot,
        input.primaryBranch,
        input.remoteUrl ?? null,
        input.layoutMode,
        now,
        existing.id,
      );
    return getRepository(existing.id)!;
  }
  const result = getDb()
    .prepare(
      `INSERT INTO repositories (name, path, git_root, primary_branch, remote_url, layout_mode, last_opened_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.path,
      input.gitRoot,
      input.primaryBranch,
      input.remoteUrl ?? null,
      input.layoutMode,
      now,
      now,
    );
  return getRepository(Number(result.lastInsertRowid))!;
}

export function deleteRepository(id: number): void {
  getDb().prepare('DELETE FROM repositories WHERE id = ?').run(id);
  const state = getGlobalState();
  if (state?.active_repository_id === id) {
    setActiveRepository(null);
  }
}

export function listWorktrees(repositoryId: number): Worktree[] {
  return getDb()
    .prepare('SELECT * FROM worktrees WHERE repository_id = ? ORDER BY is_primary DESC, branch')
    .all(repositoryId) as Worktree[];
}

export function getWorktree(id: number): Worktree | undefined {
  return getDb().prepare('SELECT * FROM worktrees WHERE id = ?').get(id) as Worktree | undefined;
}

export function getWorktreeByPath(path: string): Worktree | undefined {
  return getDb().prepare('SELECT * FROM worktrees WHERE path = ?').get(path) as Worktree | undefined;
}

export function getPrimaryWorktree(repositoryId: number): Worktree | undefined {
  return getDb()
    .prepare('SELECT * FROM worktrees WHERE repository_id = ? AND is_primary = 1 LIMIT 1')
    .get(repositoryId) as Worktree | undefined;
}

export function upsertWorktree(input: {
  repositoryId: number;
  branch: string;
  path: string;
  label?: string;
  isPrimary?: boolean;
}): Worktree {
  const now = new Date().toISOString();
  const existing = getWorktreeByPath(input.path);
  const label = input.label ?? input.branch;
  if (existing) {
    getDb()
      .prepare(
        'UPDATE worktrees SET branch = ?, label = ?, is_primary = ?, repository_id = ? WHERE id = ?',
      )
      .run(input.branch, label, input.isPrimary ? 1 : 0, input.repositoryId, existing.id);
    return getWorktree(existing.id)!;
  }
  const result = getDb()
    .prepare(
      `INSERT INTO worktrees (repository_id, branch, path, label, is_primary, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(input.repositoryId, input.branch, input.path, label, input.isPrimary ? 1 : 0, now);
  return getWorktree(Number(result.lastInsertRowid))!;
}

export function deleteWorktree(id: number): void {
  getDb().prepare('DELETE FROM worktrees WHERE id = ?').run(id);
}

export function deleteWorktreesForRepo(repositoryId: number): void {
  getDb().prepare('DELETE FROM worktrees WHERE repository_id = ?').run(repositoryId);
}

export function getGlobalState(): { active_repository_id: number | null; updated_at: string } {
  return getDb().prepare('SELECT active_repository_id, updated_at FROM global_state WHERE id = 1').get() as {
    active_repository_id: number | null;
    updated_at: string;
  };
}

export function setActiveRepository(repositoryId: number | null): void {
  getDb()
    .prepare("UPDATE global_state SET active_repository_id = ?, updated_at = datetime('now') WHERE id = 1")
    .run(repositoryId);
  if (repositoryId) {
    getDb()
      .prepare("UPDATE repositories SET last_opened_at = datetime('now') WHERE id = ?")
      .run(repositoryId);
  }
}

export function getActiveSession(repositoryId: number): ActiveSession | undefined {
  return getDb()
    .prepare('SELECT * FROM active_sessions WHERE repository_id = ?')
    .get(repositoryId) as ActiveSession | undefined;
}

export function setActiveWorktree(repositoryId: number, worktreeId: number): void {
  getDb()
    .prepare(
      `INSERT INTO active_sessions (repository_id, worktree_id, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(repository_id) DO UPDATE SET worktree_id = excluded.worktree_id, updated_at = excluded.updated_at`,
    )
    .run(repositoryId, worktreeId);
}

export function clearActiveSession(repositoryId: number): void {
  getDb().prepare('DELETE FROM active_sessions WHERE repository_id = ?').run(repositoryId);
}

export function findWorktreeByLabelOrBranch(
  repositoryId: number,
  query: string,
): Worktree | undefined {
  const worktrees = listWorktrees(repositoryId);
  const q = query.toLowerCase();
  return (
    worktrees.find((w) => w.label?.toLowerCase() === q) ??
    worktrees.find((w) => w.branch.toLowerCase() === q) ??
    worktrees.find((w) => w.label?.toLowerCase().includes(q)) ??
    worktrees.find((w) => w.branch.toLowerCase().includes(q))
  );
}
