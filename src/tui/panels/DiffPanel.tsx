import React from 'react';
import { Box, Text } from 'ink';
import { sliceScrollLines, scrollIndicator } from '../scroll.js';

interface DiffPanelProps {
  lines: string[];
  label: string;
  loading: boolean;
  height: number;
  scrollOffset: number;
  focused: boolean;
}

function lineColor(line: string): { color?: string; dim?: boolean } {
  if (line.startsWith('@@')) {
    return { color: 'cyan' };
  }
  if (line.startsWith('+++') || line.startsWith('---')) {
    return { dim: true };
  }
  if (line.startsWith('diff ') || line.startsWith('index ')) {
    return { dim: true };
  }
  if (line.startsWith('+')) {
    return { color: 'green' };
  }
  if (line.startsWith('-')) {
    return { color: 'red' };
  }
  return {};
}

export function DiffPanel({
  lines,
  label,
  loading,
  height,
  scrollOffset,
  focused,
}: DiffPanelProps) {
  const innerHeight = Math.max(1, height - 2);
  const displayLines = loading
    ? ['Loading diff…']
    : lines.length === 0
      ? ['No diff to display']
      : lines;
  const rows = displayLines.map((text, index) => ({ key: `${index}-${text}`, text }));
  const { visible, hiddenAbove, hiddenBelow } = sliceScrollLines(rows, innerHeight, scrollOffset);
  const indicator = scrollIndicator(hiddenAbove, hiddenBelow);

  return (
    <Box
      flexGrow={1}
      flexDirection="column"
      borderStyle="single"
      borderColor={focused ? 'cyan' : undefined}
      paddingX={1}
      marginLeft={1}
      height={height}
      overflow="hidden"
    >
      <Text bold color={focused ? 'cyan' : undefined} wrap="truncate">
        Diff — {label}
      </Text>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visible.map((row) => {
          const { color, dim } = lineColor(row.text);
          return (
            <Text key={row.key} color={color} dimColor={dim} wrap="truncate-end">
              {row.text.length === 0 ? ' ' : row.text}
            </Text>
          );
        })}
      </Box>
      {indicator ? <Text color="gray">{indicator}</Text> : null}
    </Box>
  );
}
