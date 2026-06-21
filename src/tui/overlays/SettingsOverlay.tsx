import React from 'react';
import { Box, Text } from 'ink';
import { pickerDialogWidth, pickerInnerHeight, truncatePickerHint } from '../dialog.js';
import { sliceScrollLines, scrollIndicator } from '../scroll.js';
import type { LayoutMode } from '../../config/schema.js';

export type SettingFieldType = 'string' | 'number' | 'layout_mode';

export type SettingFieldDef = {
  key: string;
  label: string;
  type: SettingFieldType;
};

export type SettingFieldRow = SettingFieldDef & {
  value: string;
};

export type SettingsOverlayState = {
  phase: 'list' | 'edit' | 'pick_layout';
  fields: SettingFieldRow[];
  selectedIndex: number;
  scroll: number;
  editValue: string;
  layoutPickerIndex: number;
  error?: string;
};

export const GLOBAL_SETTING_FIELDS: SettingFieldDef[] = [
  { key: 'editor.command', label: 'Editor command', type: 'string' },
  { key: 'defaults.clone_root', label: 'Clone root', type: 'string' },
  { key: 'defaults.layout_mode', label: 'Default layout', type: 'layout_mode' },
  { key: 'tui.refresh_interval_ms', label: 'Refresh interval (ms)', type: 'number' },
  { key: 'tui.diff_context_lines', label: 'Diff context lines', type: 'number' },
];

export const LAYOUT_MODE_OPTIONS: LayoutMode[] = ['workspaces', 'sibling'];

interface SettingsOverlayProps {
  state: SettingsOverlayState;
  width: number;
}

export function settingsDialogWidth(columns: number): number {
  return pickerDialogWidth(columns);
}

export function settingsInnerHeight(state: SettingsOverlayState): number {
  if (state.phase === 'pick_layout') {
    return Math.max(1, pickerInnerHeight(LAYOUT_MODE_OPTIONS.length));
  }
  if (state.phase === 'edit') {
    return 1;
  }
  return Math.max(1, pickerInnerHeight(state.fields.length));
}

export function SettingsOverlay({ state, width }: SettingsOverlayProps) {
  if (state.phase === 'edit') {
    const field = state.fields[state.selectedIndex];
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} width={width}>
        <Text bold color="cyan">
          {field?.label ?? 'Edit setting'}
        </Text>
        <Text>
          {state.editValue}
          <Text color="cyan">▌</Text>
        </Text>
        {state.error ? <Text color="red">{state.error}</Text> : null}
        <Text color="gray">
          {truncatePickerHint(width - 2, 'Enter save · Esc back · Type new value')}
        </Text>
      </Box>
    );
  }

  if (state.phase === 'pick_layout') {
    const innerHeight = settingsInnerHeight(state);
    const rows = LAYOUT_MODE_OPTIONS.map((mode, index) => ({
      mode,
      index,
      selected: index === state.layoutPickerIndex,
    }));
    const { visible, hiddenAbove, hiddenBelow } = sliceScrollLines(
      rows,
      innerHeight,
      state.scroll,
    );
    const indicator = scrollIndicator(hiddenAbove, hiddenBelow);

    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} width={width}>
        <Text bold color="cyan">
          Default layout
        </Text>
        <Text color="gray">{truncatePickerHint(width - 2)}</Text>
        <Box flexDirection="column" overflow="hidden">
          {visible.map((row) => (
            <Text key={row.mode} color={row.selected ? 'cyan' : undefined} inverse={row.selected}>
              {row.selected ? '› ' : '  '}
              {row.mode}
            </Text>
          ))}
        </Box>
        {indicator ? <Text color="gray">{indicator}</Text> : null}
        {state.error ? <Text color="red">{state.error}</Text> : null}
      </Box>
    );
  }

  const innerHeight = settingsInnerHeight(state);
  const rows = state.fields.map((field, index) => ({
    field,
    index,
    selected: index === state.selectedIndex,
  }));
  const { visible, hiddenAbove, hiddenBelow } = sliceScrollLines(rows, innerHeight, state.scroll);
  const indicator = scrollIndicator(hiddenAbove, hiddenBelow);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} width={width}>
      <Text bold color="cyan">
        Settings
      </Text>
      <Text color="gray">{truncatePickerHint(width - 2, '↑/↓ select · Enter edit · Esc close')}</Text>
      <Box flexDirection="column" overflow="hidden">
        {visible.map((row) => (
          <Text key={row.field.key} color={row.selected ? 'cyan' : undefined} inverse={row.selected}>
            {row.selected ? '› ' : '  '}
            {row.field.label}: {row.field.value || '(empty)'}
          </Text>
        ))}
      </Box>
      {indicator ? <Text color="gray">{indicator}</Text> : null}
      {state.error ? <Text color="red">{state.error}</Text> : null}
    </Box>
  );
}

export function initialSettingsOverlayState(fields: SettingFieldRow[]): SettingsOverlayState {
  return {
    phase: 'list',
    fields,
    selectedIndex: 0,
    scroll: 0,
    editValue: '',
    layoutPickerIndex: 0,
  };
}
