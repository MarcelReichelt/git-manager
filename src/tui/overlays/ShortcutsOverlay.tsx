import React from 'react';
import { Box, Text } from 'ink';
import { truncatePickerHint } from '../dialog.js';
import { sliceScrollLines, scrollIndicator } from '../scroll.js';
import { tuiShortcutEntries, type ShortcutEntry } from '../shortcuts.js';
import type { Stage } from '../carousel.js';

export type ShortcutsOverlayState = {
  selectedIndex: number;
  scroll: number;
};

export function shortcutsDialogWidth(columns: number): number {
  return Math.min(Math.max(40, columns - 8), 62);
}

export function shortcutsInnerHeight(entryCount: number, maxVisible = 14): number {
  return Math.min(entryCount, maxVisible);
}

interface ShortcutsOverlayProps {
  primaryBranch: string;
  state: ShortcutsOverlayState;
  width: number;
  innerHeight: number;
  stage?: Stage;
}

export function ShortcutsOverlay({
  primaryBranch,
  state,
  width,
  innerHeight,
  stage,
}: ShortcutsOverlayProps) {
  const entries = tuiShortcutEntries(primaryBranch, stage);
  const rows = entries.map((entry, index) => ({
    entry,
    index,
    selected: index === state.selectedIndex,
  }));
  const { visible, hiddenAbove, hiddenBelow } = sliceScrollLines(rows, innerHeight, state.scroll);
  const indicator = scrollIndicator(hiddenAbove, hiddenBelow);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} width={width}>
      <Text bold color="cyan">
        Shortcuts
      </Text>
      <Text color="gray">{truncatePickerHint(width - 2, '↑/↓ select · Enter run · Esc close')}</Text>
      <Box flexDirection="column" overflow="hidden">
        {visible.map(({ entry, index, selected }) => (
          <ShortcutRow key={`${index}-${entry.keys}`} entry={entry} selected={selected} />
        ))}
      </Box>
      {indicator ? <Text color="gray">{indicator}</Text> : null}
    </Box>
  );
}

function ShortcutRow({ entry, selected }: { entry: ShortcutEntry; selected: boolean }) {
  return (
    <Text color={selected ? 'cyan' : undefined} inverse={selected}>
      {selected ? '› ' : '  '}
      <Text color={selected ? 'cyan' : undefined}>{entry.keys.padEnd(8, ' ')}</Text>
      {entry.label}
    </Text>
  );
}

export function initialShortcutsOverlayState(): ShortcutsOverlayState {
  return { selectedIndex: 0, scroll: 0 };
}
