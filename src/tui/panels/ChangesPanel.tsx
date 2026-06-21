import React from 'react';
import { Box, Text } from 'ink';
import type { WorktreeChanges } from '../../core/changes-service.js';
import { sliceScrollLines, scrollIndicator } from '../scroll.js';

export type ChangeDisplayLine = {
  key: string;
  text: string;
  color?: string;
  dim?: boolean;
  fileIndex?: number;
};

export type ChangeFileEntry = {
  path: string;
  staged: boolean;
  untracked: boolean;
  originalPath?: string;
};

type ChangeSectionFile = { path: string; kind: string; originalPath?: string };

type ChangeSection = {
  title: string;
  files: ChangeSectionFile[];
  format: (file: ChangeSectionFile) => string;
  staged: boolean;
  untracked: boolean;
};

function buildSections(changes: WorktreeChanges): ChangeSection[] {
  return [
    {
      title: 'Staged',
      files: changes.staged,
      format: (f) => `S  ${f.path}`,
      staged: true,
      untracked: false,
    },
    {
      title: 'Modified',
      files: changes.unstaged.filter((f) => f.kind === 'modified'),
      format: (f) => `M  ${f.path}`,
      staged: false,
      untracked: false,
    },
    {
      title: 'Added',
      files: changes.unstaged.filter((f) => f.kind === 'added' || f.kind === 'deleted'),
      format: (f) => `${f.kind === 'deleted' ? 'D' : 'A'}  ${f.path}`,
      staged: false,
      untracked: false,
    },
    {
      title: 'Renamed',
      files: changes.unstaged.filter((f) => f.kind === 'renamed'),
      format: (f) => `R  ${f.originalPath ?? '?'} -> ${f.path}`,
      staged: false,
      untracked: false,
    },
    {
      title: 'Untracked',
      files: changes.untracked,
      format: (f) => `?  ${f.path}`,
      staged: false,
      untracked: true,
    },
    {
      title: 'Conflicted',
      files: changes.conflicted,
      format: (f) => `!  ${f.path}`,
      staged: false,
      untracked: false,
    },
  ];
}

export function flattenChanges(changes: WorktreeChanges | undefined): ChangeDisplayLine[] {
  if (!changes) {
    return [{ key: 'none', text: 'No worktree selected', dim: true }];
  }
  if (changes.isClean) {
    return [{ key: 'clean', text: 'Clean', color: 'green' }];
  }

  const lines: ChangeDisplayLine[] = [];
  let fileIndex = 0;

  for (const section of buildSections(changes)) {
    if (section.files.length === 0) {
      continue;
    }
    lines.push({
      key: `header-${section.title}`,
      text: `${section.title} (${section.files.length})`,
      dim: true,
    });
    for (const file of section.files) {
      lines.push({
        key: `${section.title}-${file.path}`,
        text: section.format(file),
        color: section.title === 'Conflicted' ? 'red' : undefined,
        fileIndex: fileIndex++,
      });
    }
  }

  return lines;
}

export function collectChangeFiles(changes: WorktreeChanges | undefined): ChangeFileEntry[] {
  if (!changes || changes.isClean) {
    return [];
  }
  const files: ChangeFileEntry[] = [];
  for (const section of buildSections(changes)) {
    for (const file of section.files) {
      files.push({
        path: file.path,
        staged: section.staged,
        untracked: section.untracked,
        originalPath: file.originalPath,
      });
    }
  }
  return files;
}

interface ChangesPanelProps {
  changes: WorktreeChanges | undefined;
  label: string;
  height: number;
  scrollOffset: number;
  focused: boolean;
  selectable?: boolean;
  selectedFileIndex?: number;
  side?: 'left' | 'right';
}

export function ChangesPanel({
  changes,
  label,
  height,
  scrollOffset,
  focused,
  selectable = false,
  selectedFileIndex,
  side = 'right',
}: ChangesPanelProps) {
  const lines = flattenChanges(changes);
  const innerHeight = Math.max(1, height - 2);
  const { visible, hiddenAbove, hiddenBelow } = sliceScrollLines(lines, innerHeight, scrollOffset);
  const indicator = scrollIndicator(hiddenAbove, hiddenBelow);
  const isRight = side === 'right';

  return (
    <Box
      width={isRight ? undefined : '35%'}
      flexGrow={isRight ? 1 : undefined}
      marginLeft={isRight ? 1 : undefined}
      flexDirection="column"
      borderStyle="single"
      borderColor={focused ? 'cyan' : undefined}
      paddingX={1}
      height={height}
      overflow="hidden"
    >
      <Text bold color={focused ? 'cyan' : undefined}>
        Changes — {label}
      </Text>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visible.map((line) => {
          const isSelected =
            selectable &&
            line.fileIndex !== undefined &&
            line.fileIndex === selectedFileIndex;
          return (
            <Text
              key={line.key}
              color={isSelected ? 'cyan' : line.color}
              dimColor={line.dim}
              inverse={isSelected}
            >
              {line.text}
            </Text>
          );
        })}
      </Box>
      {indicator ? <Text color="gray">{indicator}</Text> : null}
    </Box>
  );
}

export { sliceScrollLines };
