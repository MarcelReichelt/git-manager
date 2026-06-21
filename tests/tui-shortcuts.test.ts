import { describe, it, expect } from 'vitest';
import {
  tuiShortcutEntries,
  formatShortcutLine,
  shortcutActionAt,
} from '../src/tui/shortcuts.js';
import {
  moveShortcutsSelection,
  selectedShortcutAction,
} from '../src/tui/overlays/shortcuts-overlay.js';
import { initialShortcutsOverlayState } from '../src/tui/overlays/ShortcutsOverlay.js';

describe('tui shortcuts', () => {
  it('lists shift overloads as separate entries', () => {
    const entries = tuiShortcutEntries('master');
    const keys = entries.map((entry) => entry.keys);
    expect(keys).toContain('p');
    expect(keys).toContain('P');
    expect(keys).toContain('u');
    expect(keys).toContain('U');
    expect(keys).toContain('S');
    expect(keys).toContain(',');
    expect(keys).toContain('m');
  });

  it('uses the primary branch name in sync shortcuts', () => {
    const entries = tuiShortcutEntries('main');
    expect(entries.find((entry) => entry.keys === 'u')?.label).toBe('Update from main');
    expect(entries.find((entry) => entry.keys === 'U')?.label).toBe('Merge into main');
  });

  it('formats shortcut lines with aligned keys', () => {
    expect(formatShortcutLine({ keys: 'p', label: 'Pull selected worktree', action: 'pull' })).toBe(
      'p       Pull selected worktree',
    );
  });

  it('moves selection through shortcuts and scrolls to keep it visible', () => {
    const state = initialShortcutsOverlayState();
    const down = moveShortcutsSelection(state, 1, 'master');
    expect(down.selectedIndex).toBe(1);
    expect(down.scroll).toBe(0);

    const up = moveShortcutsSelection(down, -1, 'master');
    expect(up.selectedIndex).toBe(0);
    expect(up.scroll).toBe(0);
  });

  it('clamps selection within bounds', () => {
    const entries = tuiShortcutEntries('master');
    const atEnd = {
      selectedIndex: entries.length - 1,
      scroll: 0,
    };
    expect(moveShortcutsSelection(atEnd, 1, 'master').selectedIndex).toBe(entries.length - 1);
    expect(moveShortcutsSelection(initialShortcutsOverlayState(), -1, 'master').selectedIndex).toBe(0);
  });

  it('returns the selected shortcut action', () => {
    const entries = tuiShortcutEntries('master');
    const openIndex = entries.findIndex((entry) => entry.action === 'open-editor');
    expect(selectedShortcutAction({ selectedIndex: openIndex, scroll: 0 }, 'master')).toBe(
      'open-editor',
    );
    expect(shortcutActionAt('master', openIndex)).toBe('open-editor');
  });
});
