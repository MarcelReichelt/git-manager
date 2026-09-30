import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { getRegistryPathDefault, normalizePath } from '../config/paths.js';

export interface RegisteredRepository {
  readonly path: string;
  readonly displayName: string;
}

interface RegisteredRepositoryRow {
  readonly path: string;
  readonly display_name: string;
}

let database: Database.Database | null = null;
let databasePath: string | null = null;

export function closeRegisteredRepositoryRegistry(): void {
  if (database) {
    database.close();
    database = null;
    databasePath = null;
  }
}

export function listRegisteredRepositories(): readonly RegisteredRepository[] {
  const rows: unknown[] = openRegistry()
    .prepare('SELECT path, display_name FROM registered_repositories ORDER BY display_name, path')
    .all();
  return rows.map(readRegisteredRepository);
}

export function addRegisteredRepository(path: string, displayName: string): void {
  const repositoryPath = normalizePath(path);
  const name = requiredDisplayName(displayName);
  if (!isGitRepository(repositoryPath)) {
    throw new Error(`Not a git repository: ${repositoryPath}`);
  }
  saveRegisteredRepository(repositoryPath, name);
}

export function unregisterRegisteredRepository(path: string): void {
  const repositoryPath = normalizePath(path);
  const result = openRegistry().prepare('DELETE FROM registered_repositories WHERE path = ?').run(repositoryPath);
  if (result.changes === 0) {
    throw new Error(`Repository not found: ${repositoryPath}`);
  }
}

/**
 * Records a registered repository without checking that the path is a git checkout.
 * The desktop sidebar fixtures use sample paths that are not checkouts yet.
 */
export function rememberRegisteredRepository(path: string, displayName: string): void {
  saveRegisteredRepository(path, requiredDisplayName(displayName));
}

function saveRegisteredRepository(path: string, displayName: string): void {
  openRegistry()
    .prepare(
      `INSERT INTO registered_repositories (path, display_name)
       VALUES (?, ?)
       ON CONFLICT(path) DO UPDATE SET display_name = excluded.display_name`,
    )
    .run(path, displayName);
}

function requiredDisplayName(displayName: string): string {
  const name = displayName.trim();
  if (name === '') {
    throw new Error('Display name is required');
  }
  return name;
}

function isGitRepository(directory: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd: directory,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

function openRegistry(): Database.Database {
  const path = getRegistryPathDefault();
  if (database && databasePath === path) {
    return database;
  }
  closeRegisteredRepositoryRegistry();
  mkdirSync(dirname(path), { recursive: true });
  const opened = new Database(path);
  opened.exec(`
    CREATE TABLE IF NOT EXISTS registered_repositories (
      path TEXT PRIMARY KEY,
      display_name TEXT NOT NULL
    );
  `);
  database = opened;
  databasePath = path;
  return opened;
}

function readRegisteredRepository(row: unknown): RegisteredRepository {
  if (!isRegisteredRepositoryRow(row)) {
    throw new Error('Registered repository row is invalid');
  }
  return { path: row.path, displayName: row.display_name };
}

function isRegisteredRepositoryRow(row: unknown): row is RegisteredRepositoryRow {
  if (typeof row !== 'object' || row === null) {
    return false;
  }
  if (!('path' in row) || !('display_name' in row)) {
    return false;
  }
  return typeof row.path === 'string' && typeof row.display_name === 'string';
}
