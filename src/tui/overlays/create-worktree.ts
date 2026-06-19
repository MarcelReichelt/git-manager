import type { Repository, Worktree } from '../../core/registry.js';
import { listRemoteBranches } from '../../core/git-service.js';
import { createWorktree } from '../../core/worktree-service.js';
import { branchesAvailableForWorktree } from '../layout.js';
import { NEW_BRANCH_OPTION } from '../layout.js';
import {
  pickerChoices,
  type CreateWorktreeOverlayState,
} from './CreateWorktreeOverlay.js';
import { sliceScrollLines } from '../scroll.js';

export type ConfirmCreateResult =
  | { action: 'create'; branch: string; newBranch: boolean }
  | { action: 'open-name' }
  | { action: 'error'; message: string };

export async function loadCreateOverlayBranches(
  repository: Repository,
  worktrees: Worktree[],
): Promise<string[]> {
  const remoteBranches = await listRemoteBranches(repository.git_root);
  return branchesAvailableForWorktree(remoteBranches, worktrees);
}

export function movePickerSelection(
  state: CreateWorktreeOverlayState,
  delta: number,
  innerHeight: number,
): CreateWorktreeOverlayState {
  const choices = pickerChoices(state.branches);
  if (choices.length === 0) {
    return state;
  }
  const pickerIndex = Math.min(Math.max(0, state.pickerIndex + delta), choices.length - 1);
  const maxScroll = sliceScrollLines(choices, innerHeight, 0).maxScroll;
  let pickerScroll = state.pickerScroll;
  if (pickerIndex < pickerScroll) {
    pickerScroll = pickerIndex;
  }
  if (pickerIndex >= pickerScroll + innerHeight) {
    pickerScroll = Math.min(maxScroll, pickerIndex - innerHeight + 1);
  }
  return { ...state, pickerIndex, pickerScroll, error: undefined };
}

export function confirmCreateWorktree(state: CreateWorktreeOverlayState): ConfirmCreateResult {
  if (state.phase === 'name') {
    const branch = state.newBranchName.trim();
    if (!branch) {
      return { action: 'error', message: 'Branch name is required' };
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(branch)) {
      return { action: 'error', message: 'Invalid branch name' };
    }
    return { action: 'create', branch, newBranch: true };
  }

  const choices = pickerChoices(state.branches);
  const choice = choices[state.pickerIndex];
  if (!choice) {
    return { action: 'error', message: 'Select a branch' };
  }
  if (choice === NEW_BRANCH_OPTION) {
    return { action: 'open-name' };
  }
  return { action: 'create', branch: choice, newBranch: false };
}

export async function executeCreateWorktree(
  repository: Repository,
  branch: string,
  newBranch: boolean,
): Promise<Worktree> {
  return createWorktree(repository, branch, { newBranch });
}
