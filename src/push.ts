import { execFileSync } from 'node:child_process';
import { findRepository } from './registry.js';
import { findCheckout } from './worktrees.js';

function commandText(value: string | Buffer | undefined): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  return '';
}

function gitCommandError(error: unknown): Error {
  const failed = error as { stderr?: string | Buffer };
  const detail = commandText(failed.stderr).trim();
  if (detail !== '') {
    return new Error(detail);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error('git failed');
}

function remoteNames(repoPath: string): string[] {
  try {
    return execFileSync('git', ['remote'], { cwd: repoPath, encoding: 'utf8' })
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => name !== '');
  } catch {
    return [];
  }
}

function remoteForPush(repoPath: string): string | undefined {
  const names = remoteNames(repoPath);
  if (names.includes('origin')) {
    return 'origin';
  }
  return names[0];
}

export function pushBranch(repoQuery: string, branch: string): void {
  const repository = findRepository(repoQuery);
  if (!repository) {
    throw new Error(`Repository not found: ${repoQuery}`);
  }
  const checkout = findCheckout(repository.path, branch);
  if (!checkout) {
    throw new Error(`No worktree for branch: ${branch}`);
  }
  const remote = remoteForPush(repository.path);
  if (!remote) {
    throw new Error('No remote to push to');
  }
  try {
    execFileSync('git', ['push', '-u', remote, 'HEAD'], {
      cwd: checkout,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  } catch (error) {
    throw gitCommandError(error);
  }
}
