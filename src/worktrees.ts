import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { findRepository, type RegisteredRepository } from './registry.js';

function folderName(branch: string): string {
  return branch.replace(/[/\\<>:"|?*\u0000-\u001f\u007f]/g, '-');
}

function checkoutPath(repository: RegisteredRepository, folder: string): string {
  if (repository.layout === 'sibling') {
    return join(dirname(repository.path), folder);
  }
  return join(repository.path, '.workspaces', folder);
}

export async function createWorktree(repoQuery: string, branch: string): Promise<string> {
  const repository = findRepository(repoQuery);
  if (!repository) {
    throw new Error(`Repository not found: ${repoQuery}`);
  }

  const checkout = checkoutPath(repository, folderName(branch));
  if (existsSync(checkout)) {
    throw new Error(`Worktree folder already exists: ${checkout}`);
  }
  mkdirSync(dirname(checkout), { recursive: true });
  execFileSync('git', ['worktree', 'add', checkout, branch], {
    cwd: repository.path,
    stdio: 'inherit',
  });
  return checkout;
}
