import { getActiveContext, resolveWorktree } from '../core/active-session.js';
import { getChangesForPath, getChangesForWorktrees } from '../core/changes-service.js';
import { listWorktrees } from '../core/registry.js';

export async function showChanges(options: {
  worktree?: string;
  all?: boolean;
  files?: boolean;
} = {}): Promise<void> {
  const ctx = getActiveContext();
  if (!ctx) {
    console.error('No active repository');
    return;
  }

  if (options.all) {
    const worktrees = listWorktrees(ctx.repository.id);
    const changes = await getChangesForWorktrees(worktrees);
    for (const c of changes) {
      const status = c.isClean ? 'clean' : `${c.totalCount} changes`;
      console.log(`${c.label} (${c.branch}): ${status}`);
      if (options.files && !c.isClean) {
        printChanges(c);
      }
    }
    return;
  }

  const wt = resolveWorktree(ctx.repository.id, options.worktree);
  const changes = await getChangesForPath(wt.path, {
    worktreeId: wt.id,
    label: wt.label ?? wt.branch,
    branch: wt.branch,
  });
  printChanges(changes);
}

function printChanges(changes: Awaited<ReturnType<typeof getChangesForPath>>): void {
  console.log(`\nChanges — ${changes.label} (${changes.branch})\n`);
  if (changes.isClean) {
    console.log('Working tree clean');
    return;
  }
  const sections: Array<[string, typeof changes.staged]> = [
    ['Staged', changes.staged],
    ['Modified', changes.unstaged.filter((f) => f.kind === 'modified')],
    ['Added', changes.unstaged.filter((f) => f.kind === 'added')],
    ['Deleted', changes.unstaged.filter((f) => f.kind === 'deleted')],
    ['Renamed', changes.unstaged.filter((f) => f.kind === 'renamed')],
    ['Untracked', changes.untracked],
    ['Conflicted', changes.conflicted],
  ];
  for (const [title, files] of sections) {
    if (files.length === 0) continue;
    console.log(`${title} (${files.length})`);
    for (const f of files) {
      const prefix =
        f.kind === 'renamed' ? `R  ${f.originalPath} -> ${f.path}` : `  ${f.path}`;
      console.log(`  ${prefix}`);
    }
    console.log('');
  }
}
