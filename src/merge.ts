import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { findRepository } from './registry.js';

function checkoutForBranch(repoPath: string, branch: string): string {
  const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoPath,
    encoding: 'utf8',
  });
  const repo = resolve(repoPath);
  for (const block of output.split('\n\n')) {
    let path: string | undefined;
    let ref: string | undefined;
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length);
      } else if (line.startsWith('branch ')) {
        ref = line.slice('branch '.length);
      }
    }
    if (path && ref === `refs/heads/${branch}` && resolve(path) !== repo) {
      return path;
    }
  }
  throw new Error(`No worktree for branch: ${branch}`);
}

export function updateFromMaster(repoQuery: string, branch: string, squash: boolean): void {
  const repository = findRepository(repoQuery);
  if (!repository) {
    throw new Error(`Repository not found: ${repoQuery}`);
  }
  const checkout = checkoutForBranch(repository.path, branch);
  if (squash) {
    throw new Error(`Squash is not implemented for ${branch}`);
  }
  execFileSync('git', ['merge', 'master'], { cwd: checkout, stdio: 'inherit' });
}

export function mergeIntoMaster(repoQuery: string, branch: string, squash: boolean): void {
  throw new Error(
    `Merge into master is not implemented for ${repoQuery} ${branch} squash=${squash}`,
  );
}
