import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import TOML from '@iarna/toml';
import {
  defaultGlobalConfig,
  defaultRepoConfig,
  globalConfigSchema,
  repoConfigSchema,
  type EffectiveConfig,
  type GlobalConfig,
  type RepoConfig,
} from './schema.js';
import {
  getGlobalConfigPath,
  getGlobalConfigDir,
  repoConfigPath,
} from './paths.js';

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function loadGlobalConfig(): GlobalConfig {
  const configPath = getGlobalConfigPath();
  if (!existsSync(configPath)) {
    return defaultGlobalConfig();
  }
  const raw = TOML.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  return globalConfigSchema.parse(raw);
}

export function saveGlobalConfig(config: GlobalConfig): void {
  const configDir = getGlobalConfigDir();
  ensureDir(configDir);
  writeFileSync(getGlobalConfigPath(), TOML.stringify(config as TOML.JsonMap));
}

export function loadRepoConfig(layoutRoot: string): RepoConfig {
  const path = repoConfigPath(layoutRoot);
  if (!existsSync(path)) {
    return defaultRepoConfig();
  }
  const raw = TOML.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  return repoConfigSchema.parse(raw);
}

export function saveRepoConfig(layoutRoot: string, config: RepoConfig): void {
  const path = repoConfigPath(layoutRoot);
  ensureDir(dirname(path));
  writeFileSync(path, TOML.stringify(config as TOML.JsonMap));
}

export function loadEffectiveConfig(layoutRoot?: string): EffectiveConfig {
  const global = loadGlobalConfig();
  const repo = layoutRoot ? loadRepoConfig(layoutRoot) : undefined;
  return { global, repo, layoutRoot };
}

export function isSetupComplete(config: GlobalConfig = loadGlobalConfig()): boolean {
  if (!config.meta.setup_completed) {
    return false;
  }
  if (config.editor.command) {
    return true;
  }
  return Boolean(process.env.VISUAL || process.env.EDITOR);
}

export function getEditorCommand(effective: EffectiveConfig): string {
  return (
    effective.repo?.editor?.command ||
    effective.global.editor.command ||
    process.env.GIT_MANAGER_EDITOR ||
    process.env.VISUAL ||
    process.env.EDITOR ||
    'code'
  );
}

export function getEditorArgs(effective: EffectiveConfig): string[] {
  return effective.repo?.editor?.args ?? effective.global.editor.args ?? [];
}

export function getHookCommands(
  effective: EffectiveConfig,
  phase: 'pre' | 'post',
  action: string,
): string[] {
  const key = `${phase}_${action}`;
  const repoRaw = layoutRootHookSection(effective.layoutRoot, key);
  if (repoRaw?.commands && Array.isArray(repoRaw.commands)) {
    return repoRaw.commands as string[];
  }
  return [];
}

function layoutRootHookSection(
  layoutRoot: string | undefined,
  section: string,
): Record<string, unknown> | undefined {
  if (!layoutRoot) {
    return undefined;
  }
  const path = repoConfigPath(layoutRoot);
  if (!existsSync(path)) {
    return undefined;
  }
  const raw = TOML.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const hooks = raw.hooks as Record<string, unknown> | undefined;
  return hooks?.[section] as Record<string, unknown> | undefined;
}

export function getHookConfig(
  effective: EffectiveConfig,
  section: string,
): Record<string, unknown> {
  return layoutRootHookSection(effective.layoutRoot, section) ?? {};
}
