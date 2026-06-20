import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildUpdateConfirmSteps,
  confirmMergeIntoDialog,
  confirmUpdateStep,
  createMergeIntoOverlayState,
  createUpdateOverlayState,
  moveMergeConfirmSelection,
  planFromConfirmedSteps,
  primarySyncBlockedMessage,
} from '../src/tui/overlays/merge-worktree.js';
import type { Worktree } from '../src/core/registry.js';

const worktree = {
  id: 2,
  repository_id: 1,
  branch: 'feature/test',
  path: '/repo/.workspaces/feature-test',
  label: 'feature-test',
  is_primary: 0,
  created_at: '',
} satisfies Worktree;

const basePrecheck = {
  primaryHasLocalChanges: false,
  targetHasLocalChanges: false,
  primaryBehind: 0,
  primaryTracksRemote: true,
  targetUpToDateWithPrimary: false,
};

describe('merge overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks primary sync on the primary worktree', () => {
    expect(primarySyncBlockedMessage(true, 'master')).toMatch(/Already on master/);
    expect(primarySyncBlockedMessage(false, 'master')).toBeNull();
  });

  it('creates direct overlay states for update and merge into primary', () => {
    expect(createUpdateOverlayState(worktree, 'master', [{ kind: 'stash-target' }])).toMatchObject({
      intent: 'update-from-primary',
      phase: 'confirm-update-step',
      primaryBranch: 'master',
    });
    expect(createMergeIntoOverlayState(worktree, 'master')).toMatchObject({
      intent: 'merge-into-primary',
      phase: 'confirm-merge-into',
      primaryBranch: 'master',
    });
  });

  it('builds update steps for pull, primary stash, and target stash', () => {
    const steps = buildUpdateConfirmSteps({
      ...basePrecheck,
      primaryHasLocalChanges: true,
      targetHasLocalChanges: true,
      primaryBehind: 3,
    });
    expect(steps).toEqual([
      { kind: 'stash-primary' },
      { kind: 'pull-primary', behind: 3 },
      { kind: 'stash-target' },
    ]);
    expect(planFromConfirmedSteps(steps)).toEqual({
      pullPrimary: true,
      stashPrimary: true,
      stashTarget: true,
    });
  });

  it('does not stash primary when it does not need a pull', () => {
    expect(
      buildUpdateConfirmSteps({
        ...basePrecheck,
        primaryHasLocalChanges: true,
      }),
    ).toEqual([]);
    expect(
      buildUpdateConfirmSteps({
        ...basePrecheck,
        primaryHasLocalChanges: true,
        targetHasLocalChanges: true,
      }),
    ).toEqual([{ kind: 'stash-target' }]);
  });

  it('walks through update confirmation steps before executing', () => {
    const state = createUpdateOverlayState(
      worktree,
      'master',
      buildUpdateConfirmSteps({
        ...basePrecheck,
        primaryHasLocalChanges: true,
        targetHasLocalChanges: true,
        primaryBehind: 2,
      }),
    );

    const first = confirmUpdateStep(state);
    expect(first).toEqual({ action: 'next-step', nextStepIndex: 1 });

    if (first.action !== 'next-step') {
      throw new Error('expected next step');
    }

    const second = confirmUpdateStep({ ...state, updateStepIndex: first.nextStepIndex });
    expect(second).toEqual({ action: 'next-step', nextStepIndex: 2 });

    if (second.action !== 'next-step') {
      throw new Error('expected next step');
    }

    expect(confirmUpdateStep({ ...state, updateStepIndex: second.nextStepIndex })).toEqual({
      action: 'execute',
      plan: {
        pullPrimary: true,
        stashPrimary: true,
        stashTarget: true,
      },
    });
  });

  it('cancels update confirmation steps', () => {
    const state = {
      ...createUpdateOverlayState(worktree, 'master', [{ kind: 'stash-target' }]),
      confirmIndex: 1,
    };
    expect(confirmUpdateStep(state)).toEqual({ action: 'cancel' });
  });

  it('executes merge into primary only when confirmed', () => {
    const mergeState = {
      ...createMergeIntoOverlayState(worktree, 'master'),
      confirmIndex: 0,
    };
    expect(confirmMergeIntoDialog(mergeState)).toEqual({
      action: 'execute',
      pick: 'merge-into-primary',
    });
  });

  it('moves confirm selections within bounds', () => {
    const state = createMergeIntoOverlayState(worktree, 'master');
    expect(moveMergeConfirmSelection({ ...state, confirmIndex: 0 }, 1).confirmIndex).toBe(1);
    expect(moveMergeConfirmSelection({ ...state, confirmIndex: 1 }, 1).confirmIndex).toBe(1);
  });
});
