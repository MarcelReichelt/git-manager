import React from 'react';
import { Box, Text } from 'ink';
import { NEW_BRANCH_OPTION } from '../layout.js';
import { sliceScrollLines, scrollIndicator } from '../scroll.js';

export type CreateWorktreeOverlayState = {
  phase: 'loading' | 'pick' | 'name';
  branches: string[];
  pickerIndex: number;
  pickerScroll: number;
  newBranchName: string;
  error?: string;
};

interface CreateWorktreeOverlayProps {
  state: CreateWorktreeOverlayState;
  height: number;
  width: number;
}

export function pickerChoices(branches: string[]): string[] {
  return [...branches, NEW_BRANCH_OPTION];
}

export function pickerLabel(choice: string): string {
  if (choice === NEW_BRANCH_OPTION) {
    return '+ Create new branch…';
  }
  return choice;
}

export function CreateWorktreeOverlay({ state, height, width }: CreateWorktreeOverlayProps) {
  if (state.phase === 'loading') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} height={height}>
        <Text bold color="cyan">
          Create worktree
        </Text>
        <Text>Loading remote branches…</Text>
      </Box>
    );
  }

  if (state.phase === 'name') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} height={height}>
        <Text bold color="cyan">
          New branch name
        </Text>
        <Text>
          {state.newBranchName}
          <Text color="cyan">▌</Text>
        </Text>
        {state.error ? <Text color="red">{state.error}</Text> : null}
        <Text color="gray">Enter confirm · Esc back · Type branch name</Text>
      </Box>
    );
  }

  const choices = pickerChoices(state.branches);
  const innerHeight = Math.max(3, height - 4);
  const rows = choices.map((choice, index) => ({
    choice,
    index,
    label: pickerLabel(choice),
    selected: index === state.pickerIndex,
  }));
  const { visible, hiddenAbove, hiddenBelow } = sliceScrollLines(
    rows,
    innerHeight,
    state.pickerScroll,
  );
  const indicator = scrollIndicator(hiddenAbove, hiddenBelow);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} height={height}>
      <Text bold color="cyan">
        Create worktree — pick branch
      </Text>
      <Text color="gray">{truncateHint(width)}</Text>
      {choices.length === 1 ? (
        <Text dimColor>No remote branches without a checkout. Pick “Create new branch”.</Text>
      ) : null}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visible.map((row) => (
          <Text key={row.choice} color={row.selected ? 'cyan' : undefined} inverse={row.selected}>
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

function truncateHint(width: number): string {
  const hint = '↑/↓ select · Enter confirm · Esc cancel';
  if (hint.length <= width) {
    return hint;
  }
  return hint.slice(0, width);
}

export function initialCreateOverlayState(): CreateWorktreeOverlayState {
  return {
    phase: 'loading',
    branches: [],
    pickerIndex: 0,
    pickerScroll: 0,
    newBranchName: '',
  };
}
