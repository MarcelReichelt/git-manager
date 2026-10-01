import { execFileSync } from 'node:child_process';
import { findRepository } from './registry.js';
import { findBranchCheckout } from './worktrees.js';

export function updateFromMaster(repoQuery: string, branch: string, squash: boolean): void {
  const repository = findRepository(repoQuery);
  if (!repository) {
    throw new Error(`Repository not found: ${repoQuery}`);
  }
  const checkout = findBranchCheckout(repository.path, branch);
  if (squash) {
    execFileSync('git', ['merge', '--squash', 'master'], { cwd: checkout, stdio: 'inherit' });
    execFileSync('git', ['commit', '-m', `Squash master into ${branch}`], {
      cwd: checkout,
      stdio: 'inherit',
    });
    return;
  }
  execFileSync('git', ['merge', 'master'], { cwd: checkout, stdio: 'inherit' });
}

export function mergeIntoMaster(repoQuery: string, branch: string, squash: boolean): void {
  const repository = findRepository(repoQuery);
  if (!repository) {
    throw new Error(`Repository not found: ${repoQuery}`);
  }
  const current = execFileSync('git', ['branch', '--show-current'], {
    cwd: repository.path,
    encoding: 'utf8',
  }).trim();
  if (current !== 'master') {
    throw new Error(`Primary checkout is on ${current}, not master`);
  }
  if (squash) {
    execFileSync('git', ['merge', '--squash', branch], {
      cwd: repository.path,
      stdio: 'inherit',
    });
    execFileSync('git', ['commit', '-m', `Squash ${branch} into master`], {
      cwd: repository.path,
      stdio: 'inherit',
    });
    return;
  }
  execFileSync('git', ['merge', branch], { cwd: repository.path, stdio: 'inherit' });
}
