import { describe, it, expect } from 'vitest';
import { resolveWorktreeSelectionIndex } from '../src/tui/selection.js';

const worktrees = [
  { id: 1, branch: 'main' },
  { id: 2, branch: 'feature-a' },
  { id: 3, branch: 'feature-b' },
];

describe('resolveWorktreeSelectionIndex', () => {
  it('selects the active worktree on initial load', () => {
    expect(
      resolveWorktreeSelectionIndex(worktrees, { activeWorktreeId: 1 }),
    ).toBe(0);
  });

  it('preserves the highlighted worktree across refresh', () => {
    expect(
      resolveWorktreeSelectionIndex(worktrees, {
        previousWorktreeId: 3,
        activeWorktreeId: 1,
      }),
    ).toBe(2);
  });

  it('falls back to active worktree when the highlighted worktree is gone', () => {
    expect(
      resolveWorktreeSelectionIndex(worktrees, {
        previousWorktreeId: 99,
        activeWorktreeId: 2,
      }),
    ).toBe(1);
  });

  it('clamps to a valid index when neither worktree exists', () => {
    expect(
      resolveWorktreeSelectionIndex(worktrees, {
        previousWorktreeId: 99,
        activeWorktreeId: 99,
        previousIndex: 5,
      }),
    ).toBe(2);
  });

  it('returns 0 for an empty list', () => {
    expect(
      resolveWorktreeSelectionIndex([], {
        previousWorktreeId: 1,
        activeWorktreeId: 1,
      }),
    ).toBe(0);
  });
});
