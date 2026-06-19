export type ChangeKind =
  | 'staged'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'conflicted';

export interface FileChange {
  path: string;
  kind: ChangeKind;
  originalPath?: string;
}

export interface WorktreeChanges {
  worktreeId: number;
  label: string;
  branch: string;
  path: string;
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: FileChange[];
  conflicted: FileChange[];
  totalCount: number;
  isClean: boolean;
}

export async function getChangesForPath(
  path: string,
  meta: { worktreeId: number; label: string; branch: string },
): Promise<WorktreeChanges> {
  const { git } = await import('./git-service.js');
  const status = await git(path).status();
  const staged: FileChange[] = [];
  const unstaged: FileChange[] = [];
  const untracked: FileChange[] = [];
  const conflicted: FileChange[] = [];

  for (const file of status.conflicted) {
    conflicted.push({ path: file, kind: 'conflicted' });
  }
  for (const file of status.staged) {
    staged.push({ path: file, kind: 'staged' });
  }
  for (const file of status.modified) {
    unstaged.push({ path: file, kind: 'modified' });
  }
  for (const file of status.created) {
    unstaged.push({ path: file, kind: 'added' });
  }
  for (const file of status.deleted) {
    unstaged.push({ path: file, kind: 'deleted' });
  }
  for (const file of status.renamed) {
    unstaged.push({
      path: file.to,
      kind: 'renamed',
      originalPath: file.from,
    });
  }
  for (const file of status.not_added) {
    untracked.push({ path: file, kind: 'untracked' });
  }

  const totalCount =
    staged.length + unstaged.length + untracked.length + conflicted.length;

  return {
    worktreeId: meta.worktreeId,
    label: meta.label,
    branch: meta.branch,
    path,
    staged,
    unstaged,
    untracked,
    conflicted,
    totalCount,
    isClean: totalCount === 0,
  };
}

export async function getChangesForWorktrees(
  worktrees: Array<{ id: number; path: string; label: string | null; branch: string }>,
): Promise<WorktreeChanges[]> {
  return Promise.all(
    worktrees.map((w) =>
      getChangesForPath(w.path, {
        worktreeId: w.id,
        label: w.label ?? w.branch,
        branch: w.branch,
      }),
    ),
  );
}
