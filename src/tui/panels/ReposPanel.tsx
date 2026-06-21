import React from 'react';
import { Box, Text } from 'ink';
import { sliceScrollLines, scrollIndicator } from '../scroll.js';

interface ReposPanelProps {
  repos: Array<{ id: number; name: string }>;
  activeRepoId?: number | null;
  selectedIndex: number;
  height: number;
  scrollOffset: number;
  focused: boolean;
}

export function ReposPanel({
  repos,
  activeRepoId,
  selectedIndex,
  height,
  scrollOffset,
  focused,
}: ReposPanelProps) {
  const innerHeight = Math.max(1, height - 2);
  const rows = repos.map((repo, i) => {
    const marker = repo.id === activeRepoId ? '*' : ' ';
    const sel = i === selectedIndex ? '>' : ' ';
    return {
      id: repo.id,
      text: `${sel}${marker} ${repo.name}`,
      selected: i === selectedIndex,
    };
  });

  const { visible, hiddenAbove, hiddenBelow } = sliceScrollLines(rows, innerHeight, scrollOffset);
  const indicator = scrollIndicator(hiddenAbove, hiddenBelow);

  return (
    <Box
      width="35%"
      flexDirection="column"
      borderStyle="single"
      borderColor={focused ? 'cyan' : undefined}
      paddingX={1}
      height={height}
      overflow="hidden"
    >
      <Text bold color={focused ? 'cyan' : undefined}>
        Repositories
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
