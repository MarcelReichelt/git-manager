import { z } from 'zod';

export const layoutModeSchema = z.enum(['sibling', 'workspaces']);

export const globalConfigSchema = z.object({
  meta: z
    .object({
      setup_completed: z.boolean().default(false),
      setup_version: z.number().default(1),
    })
    .default({}),
  editor: z
    .object({
      command: z.string().default(''),
      args: z.array(z.string()).default([]),
    })
    .default({}),
  hooks: z
    .object({
      global_modules: z.array(z.string()).default([]),
    })
    .default({}),
  defaults: z
    .object({
      clone_root: z.string().default('~/DEV'),
      layout_mode: layoutModeSchema.default('workspaces'),
    })
    .default({}),
  tui: z
    .object({
      refresh_interval_ms: z.number().int().min(0).default(2000),
    })
    .default({}),
});

export const repoConfigSchema = z.object({
  layout: z
    .object({
      mode: layoutModeSchema.optional(),
      primary_dir: z.string().optional(),
      workspaces_dir: z.string().default('.workspaces'),
    })
    .default({}),
  editor: z
    .object({
      command: z.string().optional(),
      args: z.array(z.string()).default([]),
    })
    .optional(),
  copy: z
    .object({
      files: z.array(z.string()).default([]),
    })
    .default({}),
  hooks: z
    .object({
      modules: z.array(z.string()).default([]),
    })
    .default({}),
});

export type GlobalConfig = z.infer<typeof globalConfigSchema>;
export type RepoConfig = z.infer<typeof repoConfigSchema>;
export type LayoutMode = z.infer<typeof layoutModeSchema>;

export const hookActions = [
  'clone',
  'register',
  'worktree_create',
  'worktree_remove',
  'worktree_pull',
  'worktree_push',
  'merge',
] as const;

export type HookAction = (typeof hookActions)[number];

export type EffectiveConfig = {
  global: GlobalConfig;
  repo?: RepoConfig;
  layoutRoot?: string;
};

export function defaultGlobalConfig(): GlobalConfig {
  return globalConfigSchema.parse({});
}

export function defaultRepoConfig(): RepoConfig {
  return repoConfigSchema.parse({});
}
