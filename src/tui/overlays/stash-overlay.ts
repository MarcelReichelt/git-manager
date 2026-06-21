import {
  applyStash,
  dropStash,
  listStashes,
  popStashAt,
  stashAllChanges,
  type StashEntry,
} from '../../core/git-service.js';
import { sliceScrollLines } from '../scroll.js';
import { stashInnerHeight, type StashOverlayState } from './StashOverlay.js';

export type StashAction = 'apply' | 'pop' | 'drop';

export type RunStashActionResult =
  | { action: 'updated'; state: StashOverlayState; message: string; refreshChanges: boolean }
  | { action: 'error'; state: StashOverlayState; message: string };

export async function loadStashOverlayList(
  worktreePath: string,
  worktreeLabel: string,
): Promise<StashOverlayState> {
  const stashes = await listStashes(worktreePath);
  return {
    phase: 'list',
    worktreePath,
    worktreeLabel,
    stashes,
    selectedIndex: 0,
    scroll: 0,
  };
}

export function moveStashSelection(
  state: StashOverlayState,
  delta: number,
): StashOverlayState {
  if (state.phase !== 'list' || state.stashes.length === 0) {
    return state;
  }

  const innerHeight = stashInnerHeight(state.stashes.length);
  const selectedIndex = Math.min(
    Math.max(0, state.selectedIndex + delta),
    state.stashes.length - 1,
  );
  const maxScroll = sliceScrollLines(state.stashes, innerHeight, 0).maxScroll;
  let scroll = state.scroll;
  if (selectedIndex < scroll) {
    scroll = selectedIndex;
  }
  if (selectedIndex >= scroll + innerHeight) {
    scroll = Math.min(maxScroll, selectedIndex - innerHeight + 1);
  }

  return { ...state, selectedIndex, scroll, error: undefined };
}

function selectedStash(state: StashOverlayState): StashEntry | undefined {
  return state.stashes[state.selectedIndex];
}

function stashDescription(state: StashOverlayState, stash: StashEntry): string {
  return `stash@{${stash.index}} (${state.worktreeLabel})`;
}

async function reloadListState(state: StashOverlayState): Promise<StashOverlayState> {
  const stashes = await listStashes(state.worktreePath);
  const selectedIndex = Math.min(state.selectedIndex, Math.max(0, stashes.length - 1));
  const innerHeight = stashInnerHeight(stashes.length);
  const maxScroll = sliceScrollLines(stashes, innerHeight, 0).maxScroll;
  const scroll = Math.min(state.scroll, maxScroll);

  return {
    ...state,
    phase: 'list',
    stashes,
    selectedIndex,
    scroll,
    busy: false,
    error: undefined,
  };
}

export async function runStashAction(
  state: StashOverlayState,
  action: StashAction,
): Promise<RunStashActionResult> {
  if (state.phase !== 'list' || state.busy) {
    return { action: 'error', state, message: 'Stash list is not ready' };
  }

  const stash = selectedStash(state);
  if (!stash) {
    return { action: 'error', state, message: 'No stash selected' };
  }

  const busyState = { ...state, busy: true, error: undefined };

  try {
    if (action === 'apply') {
      await applyStash(state.worktreePath, stash.index);
    } else if (action === 'pop') {
      await popStashAt(state.worktreePath, stash.index);
    } else {
      await dropStash(state.worktreePath, stash.index);
    }

    const nextState = await reloadListState(busyState);
    const description = stashDescription(state, stash);
    const message =
      action === 'apply'
        ? `Applied ${description}`
        : action === 'pop'
          ? `Popped ${description}`
          : `Deleted ${description}`;

    return {
      action: 'updated',
      state: nextState,
      message,
      refreshChanges: action !== 'drop',
    };
  } catch (err) {
    return {
      action: 'error',
      state: { ...busyState, busy: false, error: (err as Error).message },
      message: (err as Error).message,
    };
  }
}

export async function runStashCreate(state: StashOverlayState): Promise<RunStashActionResult> {
  if (state.phase !== 'list' || state.busy) {
    return { action: 'error', state, message: 'Stash list is not ready' };
  }

  const busyState = { ...state, busy: true, error: undefined };

  try {
    const stashed = await stashAllChanges(state.worktreePath);
    if (!stashed) {
      return {
        action: 'error',
        state: { ...busyState, busy: false, error: 'No changes to stash' },
        message: 'No changes to stash',
      };
    }

    const nextState = await reloadListState(busyState);
    return {
      action: 'updated',
      state: nextState,
      message: `Stashed all changes (${state.worktreeLabel})`,
      refreshChanges: true,
    };
  } catch (err) {
    return {
      action: 'error',
      state: { ...busyState, busy: false, error: (err as Error).message },
      message: (err as Error).message,
    };
  }
}
