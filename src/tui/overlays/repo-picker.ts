import {
  listRepositoriesByLastOpened,
  getRepositoryByName,
  type Repository,
} from '../../core/registry.js';
import { getActiveRepository, activateRepository } from '../../core/active-session.js';
import { syncWorktreesFromGit } from '../../core/worktree-service.js';
import { sliceScrollLines } from '../scroll.js';
import {
  initialRepoPickerState,
  type RepoPickerChoice,
  type RepoPickerMode,
  type RepoPickerOverlayState,
} from './RepoPickerOverlay.js';

export type ConfirmRepoPickerResult =
  | { action: 'switch'; repository: Repository }
  | { action: 'unsupported'; message: string }
  | { action: 'error'; message: string };

export function buildRepoPickerChoices(): RepoPickerChoice[] {
  const repos = listRepositoriesByLastOpened();
  const active = getActiveRepository();
  return [
    ...repos.map((repo) => ({
      type: 'repo' as const,
      name: repo.name,
      active: active?.id === repo.id,
    })),
    { type: 'clone' as const },
    { type: 'add' as const },
  ];
}

export function createRepoPickerState(mode: RepoPickerMode = 'change'): RepoPickerOverlayState {
  return initialRepoPickerState(buildRepoPickerChoices(), mode);
}

export function moveRepoPickerSelection(
  state: RepoPickerOverlayState,
  delta: number,
  innerHeight: number,
): RepoPickerOverlayState {
  if (state.choices.length === 0) {
    return state;
  }
  const pickerIndex = Math.min(
    Math.max(0, state.pickerIndex + delta),
    state.choices.length - 1,
  );
  const maxScroll = sliceScrollLines(state.choices, innerHeight, 0).maxScroll;
  let pickerScroll = state.pickerScroll;
  if (pickerIndex < pickerScroll) {
    pickerScroll = pickerIndex;
  }
  if (pickerIndex >= pickerScroll + innerHeight) {
    pickerScroll = Math.min(maxScroll, pickerIndex - innerHeight + 1);
  }
  return { ...state, pickerIndex, pickerScroll, error: undefined };
}

export async function confirmRepoPicker(
  state: RepoPickerOverlayState,
): Promise<ConfirmRepoPickerResult> {
  const choice = state.choices[state.pickerIndex];
  if (!choice) {
    return { action: 'error', message: 'Select a repository' };
  }
  if (choice.type === 'clone') {
    return {
      action: 'unsupported',
      message: 'Clone from the shell: git-manager clone <url>',
    };
  }
  if (choice.type === 'add') {
    return {
      action: 'unsupported',
      message: 'Add from the shell: git-manager add [path]',
    };
  }
  const repo = getRepositoryByName(choice.name);
  if (!repo) {
    return { action: 'error', message: `Repository not found: ${choice.name}` };
  }
  await syncWorktreesFromGit(repo);
  const ctx = activateRepository(repo.id);
  return { action: 'switch', repository: ctx.repository };
}
