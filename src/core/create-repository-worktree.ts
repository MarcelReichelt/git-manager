import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import TOML from '@iarna/toml';

/**
 * Per-repository worktree config, relative to the repository root.
 * `layout` is `workspaces` or `sibling`.
 */
export const REPOSITORY_WORKTREE_CONFIG_FILE = '.git-manager.toml';

export function createRepositoryWorktree(repositoryPath: string, branch: string): string {
  const root = resolve(repositoryPath);
  const layout = readLayout(root);
  const destination = worktreeDestination(root, layout, branch);
  mkdirSync(dirname(destination), { recursive: true });
  execFileSync('git', ['worktree', 'add', destination, branch], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return destination;
}

function worktreeDestination(repositoryPath: string, layout: 'workspaces' | 'sibling', branch: string): string {
  const directoryName = worktreeDirectoryName(branch);
  if (layout === 'workspaces') {
    return join(repositoryPath, '.workspaces', directoryName);
  }
  return join(dirname(repositoryPath), directoryName);
}

function worktreeDirectoryName(branch: string): string {
  return branch.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
}

function readLayout(repositoryPath: string): 'workspaces' | 'sibling' {
  const path = join(repositoryPath, REPOSITORY_WORKTREE_CONFIG_FILE);
  if (!existsSync(path)) {
    throw new Error(`Repository layout is not configured: ${path}`);
  }
  const parsed: unknown = TOML.parse(readFileSync(path, 'utf8'));
  if (!isRecord(parsed) || (parsed.layout !== 'workspaces' && parsed.layout !== 'sibling')) {
    throw new Error('Repository layout must be workspaces or sibling');
  }
  return parsed.layout;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
