import React from 'react';
import { Box, Text } from 'ink';
import type { StashEntry } from '../../core/git-service.js';
import { pickerDialogWidth, pickerInnerHeight, truncatePickerHint } from '../dialog.js';
import { sliceScrollLines, scrollIndicator } from '../scroll.js';

export type StashOverlayState = {
  phase: 'loading' | 'list';
  worktreePath: string;
  worktreeLabel: string;
  stashes: StashEntry[];
  selectedIndex: number;
  scroll: number;
  busy?: boolean;
  error?: string;
};

export function stashDialogWidth(columns: number): number {
  return Math.min(Math.max(40, pickerDialogWidth(columns)), 72);
}

export function stashInnerHeight(stashCount: number): number {
  return Math.max(1, pickerInnerHeight(stashCount));
}

interface StashOverlayProps {
  state: StashOverlayState;
  width: number;
}

export function StashOverlay({ state, width }: StashOverlayProps) {
  if (state.phase === 'loading') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} width={width}>
        <Text bold color="cyan">
          Stashes — {state.worktreeLabel}
        </Text>
        <Text color="gray">Loading stashes…</Text>
      </Box>
    );
  }

  const innerHeight = stashInnerHeight(state.stashes.length);
  const rows = state.stashes.map((stash, index) => ({
    stash,
    index,
    selected: index === state.selectedIndex,
  }));
  const { visible, hiddenAbove, hiddenBelow } = sliceScrollLines(rows, innerHeight, state.scroll);
  const indicator = scrollIndicator(hiddenAbove, hiddenBelow);
  const hint = state.busy
    ? 'Working…'
    : state.stashes.length === 0
      ? 's stash all (incl. untracked) · Esc close'
      : '↑/↓ select · s stash all · Enter/a apply · P pop · d delete · Esc close';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} width={width}>
      <Text bold color="cyan">
        Stashes — {state.worktreeLabel}
      </Text>
      <Text color="gray">{truncatePickerHint(width - 2, hint)}</Text>
      {state.stashes.length === 0 ? (
        <Text color="gray">No stashes</Text>
      ) : (
        <Box flexDirection="column" overflow="hidden">
          {visible.map(({ stash, selected }) => (
            <Text
              key={stash.index}
              color={selected ? 'cyan' : undefined}
              inverse={selected}
            >
              {selected ? '› ' : '  '}
              stash@{'{'}
              {stash.index}
              {'}: '}
              {stash.label}
            </Text>
          ))}
        </Box>
      )}
      {indicator ? <Text color="gray">{indicator}</Text> : null}
      {state.error ? <Text color="red">{state.error}</Text> : null}
    </Box>
  );
}

export function createStashOverlayState(worktreePath: string, worktreeLabel: string): StashOverlayState {
  return {
    phase: 'loading',
    worktreePath,
    worktreeLabel,
    stashes: [],
    selectedIndex: 0,
    scroll: 0,
  };
}
