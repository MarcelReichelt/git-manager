import { execFileSync } from 'node:child_process';

export interface RepositoryWorktree {
  readonly path: string;
  readonly branch: string | null;
}

export function listRepositoryWorktrees(repositoryPath: string): readonly RepositoryWorktree[] {
  return parseWorktreeList(
    execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repositoryPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
}

export function repositoryWorktreeDirectory(repositoryPath: string, branch: string): string | null {
  try {
    return listRepositoryWorktrees(repositoryPath).find((worktree) => worktree.branch === branch)?.path ?? null;
  } catch {
    return null;
  }
}

function parseWorktreeList(output: string): readonly RepositoryWorktree[] {
  const worktrees: RepositoryWorktree[] = [];
  let current: { path?: string; branch?: string; detached?: boolean } = {};
  const push = (): void => {
    if (!current.path) {
      return;
    }
    worktrees.push({ path: current.path, branch: current.detached ? null : (current.branch ?? null) });
    current = {};
  };
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      push();
      current = { path: line.slice('worktree '.length) };
    } else if (line.startsWith('branch refs/heads/')) {
      current.branch = line.slice('branch refs/heads/'.length);
    } else if (line === 'detached') {
      current.detached = true;
    } else if (line === '') {
      push();
    }
  }
  push();
  return worktrees;
}
