import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Remove the worktree checkout for `branch`.
 * The branch itself stays. Git refuses a dirty checkout, and that error is returned as-is.
 */
export function removeRepositoryWorktree(repositoryPath: string, branch: string): void {
  const root = resolve(repositoryPath);
  const checkout = checkoutForBranch(root, branch);
  if (checkout === undefined) {
    throw new Error(`No worktree for branch: ${branch}`);
  }
  git(root, ['worktree', 'remove', checkout]);
}

function checkoutForBranch(repositoryPath: string, branch: string): string | undefined {
  const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let path: string | undefined;
  let current: string | undefined;
  for (const line of `${output}\n`.split('\n')) {
    if (line.startsWith('worktree ')) {
      path = line.slice('worktree '.length);
      current = undefined;
      continue;
    }
    if (line.startsWith('branch refs/heads/')) {
      current = line.slice('branch refs/heads/'.length);
      continue;
    }
    if (line === '' && path !== undefined && current === branch) {
      return path;
    }
  }
  return undefined;
}

function git(repositoryPath: string, args: readonly string[]): void {
  try {
    execFileSync('git', [...args], {
      cwd: repositoryPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
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
