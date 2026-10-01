import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { findRepository } from './registry.js';

export async function createWorktree(repoQuery: string, branch: string): Promise<string> {
  const repository = findRepository(repoQuery);
  if (!repository) {
    throw new Error(`Repository not found: ${repoQuery}`);
  }
  if (repository.layout !== 'workspaces') {
    throw new Error(`Unsupported layout: ${repository.layout}`);
  }

  const checkout = join(repository.path, '.workspaces', branch);
  mkdirSync(join(repository.path, '.workspaces'), { recursive: true });
  execFileSync('git', ['worktree', 'add', checkout, branch], {
    cwd: repository.path,
    stdio: 'inherit',
  });
  return checkout;
}
