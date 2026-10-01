import { execFileSync } from 'node:child_process';
import { findRepository, type RegisteredRepository } from './registry.js';
import { findCheckedOutWorktree } from './worktrees.js';

function git(args: string[], cwd: string): void {
  try {
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr =
      error instanceof Error && 'stderr' in error ? String((error as { stderr?: unknown }).stderr).trim() : '';
    throw new Error(stderr || `git ${args.join(' ')} failed`);
  }
}

function requireRepository(repoQuery: string): RegisteredRepository {
  const repo = findRepository(repoQuery);
  if (!repo) {
    throw new Error(`Repository is not registered: ${repoQuery}`);
  }
  return repo;
}

function primaryBranch(repoPath: string): string {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: repoPath,
    encoding: 'utf8',
  }).trim();
}

function mergeBranch(cwd: string, branch: string, squash: boolean, message: string): void {
  if (squash) {
    git(['merge', '--squash', branch], cwd);
    git(['commit', '-m', message], cwd);
    return;
  }
  git(['merge', '--no-edit', branch], cwd);
}

export function mergeIntoMasterTree(repoQuery: string, branch: string, squash = false): void {
  const repo = requireRepository(repoQuery);
  mergeBranch(repo.path, branch, squash, `Squash merge ${branch} into the master tree`);
}

export function mergeFromMasterTree(repoQuery: string, branch: string, squash = false): void {
  const repo = requireRepository(repoQuery);
  const source = primaryBranch(repo.path);
  const worktree = findCheckedOutWorktree(repo.path, branch);
  mergeBranch(worktree, source, squash, `Squash merge the master tree into ${branch}`);
}

export function mergeSourceIntoTarget(
  repoQuery: string,
  source: string,
  target: string,
  squash = false,
): void {
  const repo = requireRepository(repoQuery);
  const cwd = target === primaryBranch(repo.path) ? repo.path : findCheckedOutWorktree(repo.path, target);
  mergeBranch(cwd, source, squash, `Squash merge ${source} into ${target}`);
}
