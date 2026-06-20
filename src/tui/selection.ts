export function resolveWorktreeSelectionIndex(
  worktrees: { id: number }[],
  options: {
    previousWorktreeId?: number;
    activeWorktreeId: number;
    previousIndex?: number;
  },
): number {
  if (worktrees.length === 0) {
    return 0;
  }

  const { previousWorktreeId, activeWorktreeId, previousIndex = 0 } = options;

  if (previousWorktreeId !== undefined) {
    const idx = worktrees.findIndex((w) => w.id === previousWorktreeId);
    if (idx >= 0) {
      return idx;
    }
  }

  const activeIdx = worktrees.findIndex((w) => w.id === activeWorktreeId);
  if (activeIdx >= 0) {
    return activeIdx;
  }

  return Math.min(Math.max(0, previousIndex), worktrees.length - 1);
}
