import React from 'react';
import { Box, Text } from 'ink';
import { pickerDialogWidth, pickerInnerHeight, truncatePickerHint } from '../dialog.js';
import { sliceScrollLines, scrollIndicator } from '../scroll.js';

export type RepoPickerChoice =
  | { type: 'repo'; name: string; active: boolean }
  | { type: 'clone' }
  | { type: 'add' };

export type RepoPickerMode = 'select' | 'change';

export type RepoPickerOverlayState = {
  choices: RepoPickerChoice[];
  pickerIndex: number;
  pickerScroll: number;
  mode: RepoPickerMode;
  error?: string;
};

interface RepoPickerOverlayProps {
  state: RepoPickerOverlayState;
  width: number;
}

export function choiceLabel(choice: RepoPickerChoice): string {
  switch (choice.type) {
    case 'repo':
      return `${choice.name}${choice.active ? ' *' : ''}`;
    case 'clone':
      return '+ Clone new repository…';
    case 'add':
      return '+ Add existing repository…';
  }
}

export function repoPickerDialogWidth(columns: number): number {
  return pickerDialogWidth(columns);
}

export function repoPickerInnerHeight(state: RepoPickerOverlayState): number {
  return Math.max(1, pickerInnerHeight(state.choices.length));
}

export function RepoPickerOverlay({ state, width }: RepoPickerOverlayProps) {
  const innerHeight = repoPickerInnerHeight(state);
  const rows = state.choices.map((choice, index) => ({
    choice,
    index,
    label: choiceLabel(choice),
    selected: index === state.pickerIndex,
  }));
  const { visible, hiddenAbove, hiddenBelow } = sliceScrollLines(
    rows,
    innerHeight,
    state.pickerScroll,
  );
  const indicator = scrollIndicator(hiddenAbove, hiddenBelow);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} width={width}>
      <Text bold color="cyan">
        {state.mode === 'select' ? 'Select repository' : 'Change repository'}
      </Text>
      <Text color="gray">{truncatePickerHint(width - 2)}</Text>
      <Box flexDirection="column" overflow="hidden">
        {visible.map((row) => (
          <Text key={`${row.choice.type}-${row.label}`} color={row.selected ? 'cyan' : undefined} inverse={row.selected}>
            {row.selected ? '› ' : '  '}
            {row.label}
          </Text>
        ))}
      </Box>
      {indicator ? <Text color="gray">{indicator}</Text> : null}
      {state.error ? <Text color="red">{state.error}</Text> : null}
    </Box>
  );
}

export function initialRepoPickerState(
  choices: RepoPickerChoice[],
  mode: RepoPickerMode = 'change',
): RepoPickerOverlayState {
  const activeIndex = choices.findIndex((choice) => choice.type === 'repo' && choice.active);
  return {
    choices,
    pickerIndex: activeIndex >= 0 ? activeIndex : 0,
    pickerScroll: 0,
    mode,
  };
}
