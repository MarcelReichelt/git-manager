import { describe, it, expect } from 'vitest';
import { branchesAvailableForWorktree } from '../src/tui/layout.js';
import { confirmCreateWorktree, movePickerSelection } from '../src/tui/overlays/create-worktree.js';
import { initialCreateOverlayState } from '../src/tui/overlays/CreateWorktreeOverlay.js';

describe('branchesAvailableForWorktree', () => {
  it('excludes branches that already have a checkout', () => {
    const available = branchesAvailableForWorktree(
      ['master', 'develop', 'feature/login'],
      [{ branch: 'master' }, { branch: 'feature/other' }],
    );
    expect(available).toEqual(['develop', 'feature/login']);
  });
});

describe('create worktree overlay', () => {
  it('opens name entry when new branch option is selected', () => {
    const state = {
      ...initialCreateOverlayState(),
      phase: 'pick' as const,
      branches: ['develop'],
      pickerIndex: 1,
    };
    expect(confirmCreateWorktree(state)).toEqual({ action: 'open-name' });
  });

  it('moves picker selection within bounds', () => {
    const state = {
      ...initialCreateOverlayState(),
      phase: 'pick' as const,
      branches: ['a', 'b', 'c'],
      pickerIndex: 0,
      pickerScroll: 0,
    };
    const next = movePickerSelection(state, 1, 5);
    expect(next.pickerIndex).toBe(1);
  });
});
