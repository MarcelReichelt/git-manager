import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import TOML from '@iarna/toml';

export interface AppSettings {
  defaultLayout: 'workspaces' | 'sibling';
}

export interface CreateLayout {
  label: string;
  source: 'repository' | 'app';
  supported: boolean;
}

export function resolveAppSettingsPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.GIT_MANAGER_APP_SETTINGS_PATH ?? join(homedir(), '.config', 'git-manager', 'app-settings.json');
}

export function createLayoutForRepository(
  repoPath: string,
  env: NodeJS.ProcessEnv = process.env,
): CreateLayout {
  const mode = readRepositoryLayoutMode(repoPath);
  if (mode === 'workspaces' || mode === 'sibling') {
    return {
      label: mode === 'sibling' ? 'Sibling' : 'Workspaces',
      source: 'repository',
      supported: true,
    };
  }
  if (mode !== undefined) {
    return { label: mode, source: 'repository', supported: false };
  }
  const layout = readAppSettings(env).defaultLayout;
  return {
    label: layout === 'sibling' ? 'Sibling' : 'Workspaces',
    source: 'app',
    supported: true,
  };
}

export function readAppSettings(env: NodeJS.ProcessEnv = process.env): AppSettings {
  return { defaultLayout: storedDefaultLayout(resolveAppSettingsPath(env)) };
}

export function saveDefaultLayout(
  layout: AppSettings['defaultLayout'],
  env: NodeJS.ProcessEnv = process.env,
): void {
  const settingsPath = resolveAppSettingsPath(env);
  mkdirSync(dirname(settingsPath), { recursive: true });
  const current = readSettingsObject(settingsPath);
  current.defaultLayout = layout;
  writeFileSync(settingsPath, `${JSON.stringify(current)}\n`);
}

function storedDefaultLayout(settingsPath: string): AppSettings['defaultLayout'] {
  const stored = readSettingsObject(settingsPath).defaultLayout;
  return stored === 'sibling' ? 'sibling' : 'workspaces';
}

function readSettingsObject(settingsPath: string): Record<string, unknown> {
  if (!existsSync(settingsPath)) {
    return {};
  }
  const text = readFileSync(settingsPath, 'utf8');
  if (text.trim() === '') {
    return {};
  }
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) {
    return {};
  }
  return parsed;
}

function readRepositoryLayoutMode(repoPath: string): string | undefined {
  const configPath = join(repoPath, '.git-manager', 'config.toml');
  if (!existsSync(configPath)) {
    return undefined;
  }
  const parsed: unknown = TOML.parse(readFileSync(configPath, 'utf8'));
  if (!isRecord(parsed) || !isRecord(parsed.layout)) {
    return undefined;
  }
  const mode = parsed.layout.mode;
  return typeof mode === 'string' ? mode : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
