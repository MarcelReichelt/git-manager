import { loadGlobalConfig, saveGlobalConfig } from '../../config/loader.js';
import type { LayoutMode } from '../../config/schema.js';
import { sliceScrollLines } from '../scroll.js';
import {
  GLOBAL_SETTING_FIELDS,
  LAYOUT_MODE_OPTIONS,
  initialSettingsOverlayState,
  type SettingsOverlayState,
  type SettingFieldRow,
} from './SettingsOverlay.js';

export type OpenSettingsFieldResult =
  | { action: 'edit'; value: string }
  | { action: 'pick_layout'; index: number }
  | { action: 'error'; message: string };

export type SaveSettingsResult =
  | { action: 'saved'; message: string; state: SettingsOverlayState }
  | { action: 'error'; message: string };

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

export function buildSettingsFieldRows(): SettingFieldRow[] {
  const config = loadGlobalConfig();
  const record = config as unknown as Record<string, unknown>;
  return GLOBAL_SETTING_FIELDS.map((field) => ({
    ...field,
    value: String(getNestedValue(record, field.key) ?? ''),
  }));
}

export function createInitialSettingsState(): SettingsOverlayState {
  return initialSettingsOverlayState(buildSettingsFieldRows());
}

export function moveSettingsSelection(
  state: SettingsOverlayState,
  delta: number,
  innerHeight: number,
): SettingsOverlayState {
  if (state.phase === 'pick_layout') {
    const pickerIndex = Math.min(
      Math.max(0, state.layoutPickerIndex + delta),
      LAYOUT_MODE_OPTIONS.length - 1,
    );
    const maxScroll = sliceScrollLines(LAYOUT_MODE_OPTIONS, innerHeight, 0).maxScroll;
    let scroll = state.scroll;
    if (pickerIndex < scroll) {
      scroll = pickerIndex;
    }
    if (pickerIndex >= scroll + innerHeight) {
      scroll = Math.min(maxScroll, pickerIndex - innerHeight + 1);
    }
    return { ...state, layoutPickerIndex: pickerIndex, scroll, error: undefined };
  }

  if (state.phase !== 'list' || state.fields.length === 0) {
    return state;
  }

  const selectedIndex = Math.min(
    Math.max(0, state.selectedIndex + delta),
    state.fields.length - 1,
  );
  const maxScroll = sliceScrollLines(state.fields, innerHeight, 0).maxScroll;
  let scroll = state.scroll;
  if (selectedIndex < scroll) {
    scroll = selectedIndex;
  }
  if (selectedIndex >= scroll + innerHeight) {
    scroll = Math.min(maxScroll, selectedIndex - innerHeight + 1);
  }
  return { ...state, selectedIndex, scroll, error: undefined };
}

export function openSettingsField(state: SettingsOverlayState): OpenSettingsFieldResult {
  const field = state.fields[state.selectedIndex];
  if (!field) {
    return { action: 'error', message: 'Select a setting' };
  }
  if (field.type === 'layout_mode') {
    const index = LAYOUT_MODE_OPTIONS.indexOf(field.value as LayoutMode);
    return { action: 'pick_layout', index: index >= 0 ? index : 0 };
  }
  return { action: 'edit', value: field.value };
}

export function saveSettingsEdit(state: SettingsOverlayState): SaveSettingsResult {
  const field = state.fields[state.selectedIndex];
  if (!field) {
    return { action: 'error', message: 'Select a setting' };
  }

  let parsed: string | number;
  if (field.type === 'number') {
    const num = Number(state.editValue.trim());
    if (Number.isNaN(num) || state.editValue.trim() === '') {
      return { action: 'error', message: 'Enter a valid number' };
    }
    if (!Number.isInteger(num) || num < 0) {
      return { action: 'error', message: `${field.label} must be a non-negative integer` };
    }
    parsed = num;
  } else {
    parsed = state.editValue.trim();
    if (!parsed) {
      return { action: 'error', message: 'Value is required' };
    }
  }

  const config = loadGlobalConfig();
  setNestedValue(config as unknown as Record<string, unknown>, field.key, parsed);
  saveGlobalConfig(config);

  const fields = buildSettingsFieldRows();
  return {
    action: 'saved',
    message: `Saved ${field.label}`,
    state: {
      ...backToSettingsList(state),
      fields,
      selectedIndex: state.selectedIndex,
    },
  };
}

export function saveLayoutModePick(state: SettingsOverlayState): SaveSettingsResult {
  const mode = LAYOUT_MODE_OPTIONS[state.layoutPickerIndex];
  if (!mode) {
    return { action: 'error', message: 'Select a layout mode' };
  }

  const config = loadGlobalConfig();
  setNestedValue(config as unknown as Record<string, unknown>, 'defaults.layout_mode', mode);
  saveGlobalConfig(config);

  const fields = buildSettingsFieldRows();
  return {
    action: 'saved',
    message: 'Saved default layout',
    state: {
      ...backToSettingsList(state),
      fields,
      selectedIndex: state.selectedIndex,
      scroll: state.scroll,
      layoutPickerIndex: state.layoutPickerIndex,
    },
  };
}

export function backToSettingsList(state: SettingsOverlayState): SettingsOverlayState {
  return {
    ...state,
    phase: 'list',
    editValue: '',
    error: undefined,
  };
}
