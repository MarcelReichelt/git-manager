import { execFileSync } from 'node:child_process';

export function primaryCheckoutBranch(repoPath: string): string {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: repoPath,
    encoding: 'utf8',
  }).trim();
}

export function listBranches(repoPath: string): string[] {
  const output = execFileSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], {
    cwd: repoPath,
    encoding: 'utf8',
  });
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

export function findWorktree(repoPath: string, branch: string): string | undefined {
  const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoPath,
    encoding: 'utf8',
  });
  const blocks = output.split('\n\n');
  for (const block of blocks) {
    const lines = block.split('\n');
    const pathLine = lines.find((line) => line.startsWith('worktree '));
    const branchLine = lines.find((line) => line.startsWith('branch '));
    if (!pathLine || !branchLine) {
      continue;
    }
    const name = branchLine.slice('branch refs/heads/'.length);
    if (name === branch) {
      return pathLine.slice('worktree '.length);
    }
  }
  return undefined;
}
