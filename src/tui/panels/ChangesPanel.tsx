import React from 'react';
import { Box, Text } from 'ink';
import type { WorktreeChanges } from '../../core/changes-service.js';
import { sliceScrollLines, scrollIndicator } from '../scroll.js';

export type ChangeDisplayLine = {
  key: string;
  text: string;
  color?: string;
  dim?: boolean;
};

export function flattenChanges(changes: WorktreeChanges | undefined): ChangeDisplayLine[] {
  if (!changes) {
    return [{ key: 'none', text: 'No worktree selected', dim: true }];
  }
  if (changes.isClean) {
    return [{ key: 'clean', text: 'Clean', color: 'green' }];
  }

  const lines: ChangeDisplayLine[] = [];
  const sections: Array<
    [
      string,
      Array<{ path: string; kind: string; originalPath?: string }>,
      (f: { path: string; kind: string; originalPath?: string }) => string,
    ]
  > = [
    ['Staged', changes.staged, (f) => `S  ${f.path}`],
    ['Modified', changes.unstaged.filter((f) => f.kind === 'modified'), (f) => `M  ${f.path}`],
    [
      'Added',
      changes.unstaged.filter((f) => f.kind === 'added' || f.kind === 'deleted'),
      (f) => `${f.kind === 'deleted' ? 'D' : 'A'}  ${f.path}`,
    ],
    [
      'Renamed',
      changes.unstaged.filter((f) => f.kind === 'renamed'),
      (f) => `R  ${f.originalPath ?? '?'} -> ${f.path}`,
    ],
    ['Untracked', changes.untracked, (f) => `?  ${f.path}`],
    ['Conflicted', changes.conflicted, (f) => `!  ${f.path}`],
  ];

  for (const [title, files, format] of sections) {
    if (files.length === 0) {
      continue;
    }
    lines.push({ key: `header-${title}`, text: `${title} (${files.length})`, dim: true });
    for (const file of files) {
      lines.push({
        key: `${title}-${file.path}`,
        text: format(file),
        color: title === 'Conflicted' ? 'red' : undefined,
      });
    }
  }

  return lines;
}

interface ChangesPanelProps {
  changes: WorktreeChanges | undefined;
  label: string;
  height: number;
  scrollOffset: number;
  focused: boolean;
}

export function ChangesPanel({
  changes,
  label,
  height,
  scrollOffset,
  focused,
}: ChangesPanelProps) {
  const lines = flattenChanges(changes);
  const innerHeight = Math.max(1, height - 2);
  const { visible, hiddenAbove, hiddenBelow } = sliceScrollLines(lines, innerHeight, scrollOffset);
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
      <Text bold color={focused ? 'cyan' : undefined}>
        Changes — {label}
      </Text>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visible.map((line) => (
          <Text key={line.key} color={line.color} dimColor={line.dim}>
            {line.text}
          </Text>
        ))}
      </Box>
      {indicator ? <Text color="gray">{indicator}</Text> : null}
    </Box>
  );
}

export { sliceScrollLines };
