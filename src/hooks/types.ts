import type { LayoutMode, RepoConfig } from '../config/schema.js';

export type HookResult = void | 'abort';

export interface CloneHookContext {
  layoutRoot: string;
  gitRoot: string;
  remoteUrl: string;
  layoutMode: LayoutMode;
  config: RepoConfig;
}

export interface RegisterHookContext {
  layoutRoot: string;
  gitRoot: string;
  primaryBranch: string;
  layoutMode: LayoutMode;
  config: RepoConfig;
}

export interface WorktreeHookContext {
  layoutRoot: string;
  gitRoot: string;
  worktreePath: string;
  branch: string;
  config: RepoConfig;
}

export interface SyncHookContext extends WorktreeHookContext {
  direction: 'pull' | 'push';
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface MergeHookContext {
  layoutRoot: string;
  gitRoot: string;
  sourcePath: string;
  targetPath: string;
  sourceBranch: string;
  targetBranch: string;
  direction: 'into-primary' | 'from-primary' | 'worktree-to-worktree';
  config: RepoConfig;
}

export interface GitManagerPlugin {
  name: string;
  preClone?(ctx: CloneHookContext): Promise<HookResult> | HookResult;
  postClone?(ctx: CloneHookContext): Promise<void> | void;
  preRegister?(ctx: RegisterHookContext): Promise<HookResult> | HookResult;
  postRegister?(ctx: RegisterHookContext): Promise<void> | void;
  preWorktreeCreate?(ctx: WorktreeHookContext): Promise<HookResult> | HookResult;
  postWorktreeCreate?(ctx: WorktreeHookContext): Promise<void> | void;
  preWorktreeRemove?(ctx: WorktreeHookContext): Promise<HookResult> | HookResult;
  postWorktreeRemove?(ctx: WorktreeHookContext): Promise<void> | void;
  preWorktreePull?(ctx: SyncHookContext): Promise<HookResult> | HookResult;
  postWorktreePull?(ctx: SyncHookContext): Promise<void> | void;
  preWorktreePush?(ctx: SyncHookContext): Promise<HookResult> | HookResult;
  postWorktreePush?(ctx: SyncHookContext): Promise<void> | void;
  preMerge?(ctx: MergeHookContext): Promise<HookResult> | HookResult;
  postMerge?(ctx: MergeHookContext): Promise<void> | void;
}

export class HookAbortError extends Error {
  constructor(message = 'Hook aborted action') {
    super(message);
    this.name = 'HookAbortError';
  }
}
