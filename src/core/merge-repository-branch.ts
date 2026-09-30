import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export type RepositoryMergeDirection = 'update-from-master' | 'into-master';

export interface RepositoryBranchMergeOptions {
  readonly squash?: boolean;
}

/**
 * Update from master checks out `branch` and merges master into it.
 * Merge into master checks out master and merges `branch` into it.
 * Squash performs that same direction as one commit.
 */
export function mergeRepositoryBranch(
  repositoryPath: string,
  branch: string,
  direction: RepositoryMergeDirection,
  options: RepositoryBranchMergeOptions = {},
): void {
  const root = resolve(repositoryPath);
  const squash = options.squash === true;
  if (direction === 'update-from-master') {
    checkoutAndMerge(root, branch, 'master', squash);
    return;
  }
  checkoutAndMerge(root, 'master', branch, squash);
}

function checkoutAndMerge(repositoryPath: string, target: string, source: string, squash: boolean): void {
  git(repositoryPath, ['checkout', target]);
  if (!squash) {
    git(repositoryPath, ['merge', '--no-edit', source]);
    return;
  }
  git(repositoryPath, ['merge', '--squash', source]);
  if (!hasStagedChanges(repositoryPath)) {
    return;
  }
  git(repositoryPath, ['commit', '-F', squashMessagePath(repositoryPath)]);
}

function hasStagedChanges(repositoryPath: string): boolean {
  try {
    execFileSync('git', ['diff', '--cached', '--quiet'], {
      cwd: repositoryPath,
      stdio: 'ignore',
    });
    return false;
  } catch {
    return true;
  }
}

function squashMessagePath(repositoryPath: string): string {
  return execFileSync('git', ['rev-parse', '--git-path', 'SQUASH_MSG'], {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function git(repositoryPath: string, args: readonly string[]): void {
  try {
    execFileSync('git', [...args], {
      cwd: repositoryPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_MERGE_AUTOEDIT: 'no' },
    });
  } catch (error) {
    throw new Error(commandError(error));
  }
}

function commandError(error: unknown): string {
  if (isCommandFailure(error)) {
    const stderr = error.stderr.trim();
    if (stderr !== '') {
      return stderr;
    }
  }
  if (error instanceof Error && error.message !== '') {
    return error.message;
  }
  return 'Command failed';
}

function isCommandFailure(error: unknown): error is { stderr: string } {
  return typeof error === 'object' && error !== null && 'stderr' in error && typeof error.stderr === 'string';
}
