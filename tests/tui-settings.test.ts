import { describe, it, expect } from 'vitest';
import {
  moveSettingsSelection,
  openSettingsField,
  saveSettingsEdit,
  backToSettingsList,
} from '../src/tui/overlays/settings-overlay.js';
import { initialSettingsOverlayState } from '../src/tui/overlays/SettingsOverlay.js';

describe('settings overlay', () => {
  const baseState = initialSettingsOverlayState([
    { key: 'editor.command', label: 'Editor command', type: 'string', value: 'cursor' },
    { key: 'defaults.clone_root', label: 'Clone root', type: 'string', value: '~/DEV' },
    {
      key: 'defaults.layout_mode',
      label: 'Default layout',
      type: 'layout_mode',
      value: 'workspaces',
    },
    {
      key: 'tui.refresh_interval_ms',
      label: 'Refresh interval (ms)',
      type: 'number',
      value: '2000',
    },
  ]);

  it('moves selection within bounds', () => {
    const next = moveSettingsSelection(baseState, 1, 5);
    expect(next.selectedIndex).toBe(1);
  });

  it('opens layout picker for layout_mode field', () => {
    const state = { ...baseState, selectedIndex: 2 };
    expect(openSettingsField(state)).toEqual({ action: 'pick_layout', index: 0 });
  });

  it('opens text edit for string fields', () => {
    expect(openSettingsField(baseState)).toEqual({ action: 'edit', value: 'cursor' });
  });

  it('rejects invalid refresh interval', () => {
    const state = {
      ...baseState,
      phase: 'edit' as const,
      selectedIndex: 3,
      editValue: 'not-a-number',
    };
    expect(saveSettingsEdit(state)).toEqual({
      action: 'error',
      message: 'Enter a valid number',
    });
  });

  it('returns to list from edit phase', () => {
    const state = { ...baseState, phase: 'edit' as const, editValue: 'nvim' };
    expect(backToSettingsList(state).phase).toBe('list');
  });
});
