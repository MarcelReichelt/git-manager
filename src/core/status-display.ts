import { getActiveContext } from './active-session.js';
import type { WorktreeChanges } from './changes-service.js';

export function formatStatusHeader(changes?: WorktreeChanges): string {
  const ctx = getActiveContext();
  if (!ctx) {
    return 'No active repository';
  }
  const { repository, worktree } = ctx;
  const label = worktree.label ?? worktree.branch;
  const changeInfo =
    changes !== undefined
      ? changes.isClean
        ? ' (clean)'
        : ` (${changes.totalCount} change${changes.totalCount === 1 ? '' : 's'})`
      : '';
  return `${repository.name} / ${label} (${worktree.branch})${changeInfo}`;
}

export function printStatusHeader(changes?: WorktreeChanges): void {
  console.log(`\n${formatStatusHeader(changes)}\n`);
}
