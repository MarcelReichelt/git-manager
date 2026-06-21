export type Stage = 0 | 1 | 2;

export const STAGE_REPOS: Stage = 0;
export const STAGE_WORKTREES: Stage = 1;
export const STAGE_CHANGES: Stage = 2;

export const STAGES: readonly Stage[] = [STAGE_REPOS, STAGE_WORKTREES, STAGE_CHANGES];

export const STAGE_TITLES: Record<Stage, { left: string; right: string }> = {
  [STAGE_REPOS]: { left: 'Repositories', right: 'Worktrees' },
  [STAGE_WORKTREES]: { left: 'Worktrees', right: 'Changes' },
  [STAGE_CHANGES]: { left: 'Changes', right: 'Diff' },
};

export function nextStage(stage: Stage): Stage {
  return Math.min(stage + 1, STAGE_CHANGES) as Stage;
}

export function prevStage(stage: Stage): Stage {
  return Math.max(stage - 1, STAGE_REPOS) as Stage;
}

export function clampIndex(index: number, length: number, delta = 0): number {
  if (length <= 0) {
    return 0;
  }
  return Math.min(Math.max(0, index + delta), length - 1);
}

export function worktreeOpsAllowed(stage: Stage): boolean {
  return stage !== STAGE_REPOS;
}
