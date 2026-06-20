import React from 'react';
import { Box, Text } from 'ink';
import { truncatePickerHint } from '../dialog.js';

export type UpdateConfirmStep =
  | { kind: 'pull-primary'; behind: number }
  | { kind: 'stash-primary' }
  | { kind: 'stash-target' };

export type MergeOverlayIntent = 'update-from-primary' | 'merge-into-primary';

export type MergeOverlayState = {
  intent: MergeOverlayIntent;
  phase: 'confirm-merge-into' | 'confirm-update-step';
  primaryBranch: string;
  worktreeLabel: string;
  worktreeBranch: string;
  confirmIndex: number;
  updateSteps: UpdateConfirmStep[];
  updateStepIndex: number;
  error?: string;
};

export function mergeDialogWidth(columns: number): number {
  return Math.min(Math.max(36, columns - 8), 58);
}

const CONFIRM_CONTINUE_OPTIONS = ['Continue', 'Cancel'] as const;
const CONFIRM_MERGE_OPTIONS = ['Yes, merge', 'Cancel'] as const;

export function updateStepMessage(step: UpdateConfirmStep, state: MergeOverlayState): string {
  switch (step.kind) {
    case 'pull-primary':
      return `${state.primaryBranch} is ${step.behind} commit(s) behind remote. Pull before updating?`;
    case 'stash-primary':
      return `Uncommitted changes on ${state.primaryBranch}. Stash temporarily to pull remote updates?`;
    case 'stash-target':
      return `Uncommitted changes in ${state.worktreeLabel}. Stash and reapply after update?`;
  }
}

interface MergeOverlayProps {
  state: MergeOverlayState;
  width: number;
}

export function MergeOverlay({ state, width }: MergeOverlayProps) {
  if (state.phase === 'confirm-update-step') {
    const step = state.updateSteps[state.updateStepIndex];
    if (!step) {
      return null;
    }

    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} width={width}>
        <Text bold color="cyan">
          Update from {state.primaryBranch}
        </Text>
        <Text>{updateStepMessage(step, state)}</Text>
        {state.updateSteps.length > 1 ? (
          <Text color="gray">
            Step {state.updateStepIndex + 1} of {state.updateSteps.length}
          </Text>
        ) : null}
        <Box flexDirection="column" marginTop={1}>
          {CONFIRM_CONTINUE_OPTIONS.map((label, index) => (
            <Text key={label} color={index === state.confirmIndex ? 'cyan' : undefined} inverse={index === state.confirmIndex}>
              {index === state.confirmIndex ? '› ' : '  '}
              {label}
            </Text>
          ))}
        </Box>
        {state.error ? <Text color="red">{state.error}</Text> : null}
        <Text color="gray">{truncatePickerHint(width - 2, '↑/↓ select · Enter confirm · Esc cancel')}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} width={width}>
      <Text bold color="cyan">
        Merge into {state.primaryBranch}
      </Text>
      <Text>
        Merge {state.worktreeLabel} into {state.primaryBranch}?
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {CONFIRM_MERGE_OPTIONS.map((label, index) => (
          <Text key={label} color={index === state.confirmIndex ? 'cyan' : undefined} inverse={index === state.confirmIndex}>
            {index === state.confirmIndex ? '› ' : '  '}
            {label}
          </Text>
        ))}
      </Box>
      {state.error ? <Text color="red">{state.error}</Text> : null}
      <Text color="gray">{truncatePickerHint(width - 2, '↑/↓ select · Enter confirm · Esc cancel')}</Text>
    </Box>
  );
}
