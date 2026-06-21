import { describe, it, expect } from 'vitest';
import {
  STAGE_REPOS,
  STAGE_WORKTREES,
  STAGE_CHANGES,
  STAGES,
  nextStage,
  prevStage,
  clampIndex,
  worktreeOpsAllowed,
} from '../src/tui/carousel.js';
import { tuiShortcutEntries } from '../src/tui/shortcuts.js';

describe('carousel stage navigation', () => {
  it('advances through stages and clamps at the last one', () => {
    expect(nextStage(STAGE_REPOS)).toBe(STAGE_WORKTREES);
    expect(nextStage(STAGE_WORKTREES)).toBe(STAGE_CHANGES);
    expect(nextStage(STAGE_CHANGES)).toBe(STAGE_CHANGES);
  });

  it('goes back through stages and clamps at the first one', () => {
    expect(prevStage(STAGE_CHANGES)).toBe(STAGE_WORKTREES);
    expect(prevStage(STAGE_WORKTREES)).toBe(STAGE_REPOS);
    expect(prevStage(STAGE_REPOS)).toBe(STAGE_REPOS);
  });

  it('exposes the three stages in order', () => {
    expect(STAGES).toEqual([STAGE_REPOS, STAGE_WORKTREES, STAGE_CHANGES]);
  });
});

describe('clampIndex', () => {
  it('keeps the index within bounds when moving', () => {
    expect(clampIndex(0, 3, 1)).toBe(1);
    expect(clampIndex(2, 3, 1)).toBe(2);
    expect(clampIndex(0, 3, -1)).toBe(0);
  });

  it('returns 0 for an empty list', () => {
    expect(clampIndex(5, 0, -1)).toBe(0);
    expect(clampIndex(0, 0, 1)).toBe(0);
  });

  it('re-clamps an out-of-range index when shrinking', () => {
    expect(clampIndex(5, 3)).toBe(2);
  });
});

describe('worktreeOpsAllowed', () => {
  it('disallows worktree ops on the repos stage only', () => {
    expect(worktreeOpsAllowed(STAGE_REPOS)).toBe(false);
    expect(worktreeOpsAllowed(STAGE_WORKTREES)).toBe(true);
    expect(worktreeOpsAllowed(STAGE_CHANGES)).toBe(true);
  });
});

describe('context-aware shortcut entries', () => {
  it('hides worktree ops on the repos stage', () => {
    const actions = tuiShortcutEntries('main', STAGE_REPOS).map((entry) => entry.action);
    expect(actions).not.toContain('pull');
    expect(actions).not.toContain('open-editor');
    expect(actions).not.toContain('create-worktree');
    expect(actions).toContain('change-repo');
    expect(actions).toContain('column-next');
  });

  it('shows worktree ops on the worktrees and changes stages', () => {
    for (const stage of [STAGE_WORKTREES, STAGE_CHANGES] as const) {
      const actions = tuiShortcutEntries('main', stage).map((entry) => entry.action);
      expect(actions).toContain('pull');
      expect(actions).toContain('open-editor');
      expect(actions).toContain('view-stashes');
    }
  });
});
