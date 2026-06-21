import { tuiShortcutEntries } from '../shortcuts.js';
import {
  shortcutsInnerHeight,
  type ShortcutsOverlayState,
} from './ShortcutsOverlay.js';
import { sliceScrollLines } from '../scroll.js';
import type { ShortcutActionId } from '../shortcuts.js';
import type { Stage } from '../carousel.js';

export function moveShortcutsSelection(
  state: ShortcutsOverlayState,
  delta: number,
  primaryBranch: string,
  stage?: Stage,
): ShortcutsOverlayState {
  const entries = tuiShortcutEntries(primaryBranch, stage);
  if (entries.length === 0) {
    return state;
  }

  const innerHeight = shortcutsInnerHeight(entries.length);
  const selectedIndex = Math.min(Math.max(0, state.selectedIndex + delta), entries.length - 1);
  const maxScroll = sliceScrollLines(entries, innerHeight, 0).maxScroll;
  let scroll = state.scroll;
  if (selectedIndex < scroll) {
    scroll = selectedIndex;
  }
  if (selectedIndex >= scroll + innerHeight) {
    scroll = Math.min(maxScroll, selectedIndex - innerHeight + 1);
  }

  return { selectedIndex, scroll };
}

export function selectedShortcutAction(
  state: ShortcutsOverlayState,
  primaryBranch: string,
  stage?: Stage,
): ShortcutActionId | undefined {
  return tuiShortcutEntries(primaryBranch, stage)[state.selectedIndex]?.action;
}
