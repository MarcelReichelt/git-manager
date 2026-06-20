import type { Repository, Worktree } from '../../core/registry.js';
import {
  mergeFromPrimary,
  mergeIntoPrimary,
  precheckUpdateFromPrimary,
  type UpdateFromPrimaryPlan,
  type UpdateFromPrimaryPrecheck,
} from '../../core/merge-service.js';
import {
  type MergeOverlayIntent,
  type MergeOverlayState,
  type UpdateConfirmStep,
} from './MergeOverlay.js';

export type { MergeOverlayIntent, MergeOverlayState, UpdateConfirmStep };

export type ConfirmMergeDialogResult =
  | { action: 'execute'; pick: 'merge-into-primary' }
  | { action: 'cancel' };

export type ConfirmUpdateStepResult =
  | { action: 'next-step'; nextStepIndex: number }
  | { action: 'execute'; plan: UpdateFromPrimaryPlan }
  | { action: 'cancel' };

export function primarySyncBlockedMessage(isPrimary: boolean, primaryBranch: string): string | null {
  if (isPrimary) {
    return `Already on ${primaryBranch}. Select a feature worktree first.`;
  }
  return null;
}

export function createUpdateOverlayState(
  worktree: Worktree,
  primaryBranch: string,
  updateSteps: UpdateConfirmStep[],
): MergeOverlayState {
  return {
    intent: 'update-from-primary',
    phase: 'confirm-update-step',
    primaryBranch,
    worktreeLabel: worktree.label ?? worktree.branch,
    worktreeBranch: worktree.branch,
    confirmIndex: 0,
    updateSteps,
    updateStepIndex: 0,
  };
}

export function createMergeIntoOverlayState(
  worktree: Worktree,
  primaryBranch: string,
): MergeOverlayState {
  return {
    intent: 'merge-into-primary',
    phase: 'confirm-merge-into',
    primaryBranch,
    worktreeLabel: worktree.label ?? worktree.branch,
    worktreeBranch: worktree.branch,
    confirmIndex: 0,
    updateSteps: [],
    updateStepIndex: 0,
  };
}

export function buildUpdateConfirmSteps(precheck: UpdateFromPrimaryPrecheck): UpdateConfirmStep[] {
  const needsPull = precheck.primaryTracksRemote && precheck.primaryBehind > 0;
  const steps: UpdateConfirmStep[] = [];

  if (needsPull && precheck.primaryHasLocalChanges) {
    steps.push({ kind: 'stash-primary' });
  }
  if (needsPull) {
    steps.push({ kind: 'pull-primary', behind: precheck.primaryBehind });
  }
  if (precheck.targetHasLocalChanges) {
    steps.push({ kind: 'stash-target' });
  }
  return steps;
}

export function planFromConfirmedSteps(steps: UpdateConfirmStep[]): UpdateFromPrimaryPlan {
  return {
    pullPrimary: steps.some((step) => step.kind === 'pull-primary'),
    stashPrimary: steps.some((step) => step.kind === 'stash-primary'),
    stashTarget: steps.some((step) => step.kind === 'stash-target'),
  };
}

export async function prepareUpdateFromPrimary(
  repository: Repository,
  target: Worktree,
  primary: Worktree,
): Promise<{
  steps: UpdateConfirmStep[];
  plan: UpdateFromPrimaryPlan;
  alreadyUpToDate: boolean;
}> {
  const precheck = await precheckUpdateFromPrimary(repository, target, primary);
  if (precheck.targetUpToDateWithPrimary) {
    return {
      steps: [],
      plan: { pullPrimary: false, stashPrimary: false, stashTarget: false },
      alreadyUpToDate: true,
    };
  }
  const steps = buildUpdateConfirmSteps(precheck);
  return {
    steps,
    plan: planFromConfirmedSteps(steps),
    alreadyUpToDate: false,
  };
}

export function moveMergeConfirmSelection(
  state: MergeOverlayState,
  delta: number,
): MergeOverlayState {
  const confirmIndex = Math.min(Math.max(0, state.confirmIndex + delta), 1);
  return { ...state, confirmIndex, error: undefined };
}

export function confirmMergeIntoDialog(state: MergeOverlayState): ConfirmMergeDialogResult {
  if (state.confirmIndex !== 0) {
    return { action: 'cancel' };
  }
  return { action: 'execute', pick: 'merge-into-primary' };
}

export function confirmUpdateStep(state: MergeOverlayState): ConfirmUpdateStepResult {
  if (state.confirmIndex !== 0) {
    return { action: 'cancel' };
  }

  const nextStepIndex = state.updateStepIndex + 1;
  if (nextStepIndex < state.updateSteps.length) {
    return { action: 'next-step', nextStepIndex };
  }

  return {
    action: 'execute',
    plan: planFromConfirmedSteps(state.updateSteps),
  };
}

export async function executeMergeAction(
  repository: Repository,
  worktree: Worktree,
  pick: MergeOverlayIntent,
  options: { updatePlan?: UpdateFromPrimaryPlan } = {},
): Promise<void> {
  const query = worktree.label ?? worktree.branch;
  if (pick === 'update-from-primary') {
    const plan = options.updatePlan ?? {
      pullPrimary: false,
      stashPrimary: false,
      stashTarget: false,
    };
    await mergeFromPrimary(repository, query, {
      pullPrimary: plan.pullPrimary,
      stashDirtyPrimary: plan.stashPrimary,
      stashDirtyTarget: plan.stashTarget,
    });
    return;
  }
  await mergeIntoPrimary(repository, query);
}
