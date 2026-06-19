import React from 'react';
import { Box, Text } from 'ink';
import type { WorktreeChanges } from '../../core/changes-service.js';
import { sliceScrollLines, scrollIndicator } from '../scroll.js';

interface WorktreePanelProps {
  worktrees: Array<{ id: number; label: string | null; branch: string }>;
  changes: WorktreeChanges[];
  activeWorktreeId: number;
  selectedIndex: number;
  height: number;
  scrollOffset: number;
  focused: boolean;
}

export function WorktreePanel({
  worktrees,
  changes,
  activeWorktreeId,
  selectedIndex,
  height,
  scrollOffset,
  focused,
}: WorktreePanelProps) {
  const innerHeight = Math.max(1, height - 2);
  const rows = worktrees.map((wt, i) => {
    const ch = changes[i];
    const marker = wt.id === activeWorktreeId ? '*' : ' ';
    const sel = i === selectedIndex ? '>' : ' ';
    const name = wt.label ?? wt.branch;
    const count = ch?.totalCount ?? 0;
    return {
      id: wt.id,
      text: `${sel}${marker} ${name} [${count}]`,
      selected: i === selectedIndex,
    };
  });

  const { visible, hiddenAbove, hiddenBelow } = sliceScrollLines(rows, innerHeight, scrollOffset);
  const indicator = scrollIndicator(hiddenAbove, hiddenBelow);

  return (
    <Box
      width="30%"
      flexDirection="column"
      borderStyle="single"
      borderColor={focused ? 'cyan' : undefined}
      paddingX={1}
      height={height}
      overflow="hidden"
    >
      <Text bold color={focused ? 'cyan' : undefined}>
        Worktrees
      </Text>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visible.map((row) => (
          <Text key={row.id} color={row.selected ? 'cyan' : undefined}>
            {row.text}
          </Text>
        ))}
      </Box>
      {indicator ? <Text color="gray">{indicator}</Text> : null}
    </Box>
  );
}
