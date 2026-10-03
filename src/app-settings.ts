import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import TOML from '@iarna/toml';

export interface AppSettings {
  defaultLayout: 'workspaces' | 'sibling';
  sidebarColor: string;
  contentColor: string;
  ideCommand: string;
}

const originalSidebarColor = '#1a3c2b';
const originalContentColor = '#f7f7f5';

export interface CreateLayout {
  label: string;
  source: 'repository' | 'app';
  supported: boolean;
}

export function resolveAppSettingsPath(env?: NodeJS.ProcessEnv): string {
  const settingsEnv = runtimeEnv(env);
  return settingsEnv.GIT_MANAGER_APP_SETTINGS_PATH ?? join(homedir(), '.config', 'git-manager', 'app-settings.json');
}

export function createLayoutForRepository(
  repoPath: string,
  env?: NodeJS.ProcessEnv,
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

export function readAppSettings(env?: NodeJS.ProcessEnv): AppSettings {
  const stored = readSettingsObject(resolveAppSettingsPath(env));
  return {
    defaultLayout: stored.defaultLayout === 'sibling' ? 'sibling' : 'workspaces',
    sidebarColor: typeof stored.sidebarColor === 'string' ? stored.sidebarColor : originalSidebarColor,
    contentColor: typeof stored.contentColor === 'string' ? stored.contentColor : originalContentColor,
    ideCommand: typeof stored.ideCommand === 'string' ? stored.ideCommand : '',
  };
}

export function saveDefaultLayout(
  layout: AppSettings['defaultLayout'],
  env?: NodeJS.ProcessEnv,
): void {
  const settingsPath = resolveAppSettingsPath(env);
  mkdirSync(dirname(settingsPath), { recursive: true });
  const current = readSettingsObject(settingsPath);
  current.defaultLayout = layout;
  writeFileSync(settingsPath, `${JSON.stringify(current)}\n`);
}

export function saveSidebarColor(color: string, env?: NodeJS.ProcessEnv): void {
  const settingsPath = resolveAppSettingsPath(env);
  mkdirSync(dirname(settingsPath), { recursive: true });
  const current = readSettingsObject(settingsPath);
  current.sidebarColor = color;
  writeFileSync(settingsPath, `${JSON.stringify(current)}\n`);
}

export function saveIdeCommand(command: string, env?: NodeJS.ProcessEnv): void {
  const settingsPath = resolveAppSettingsPath(env);
  mkdirSync(dirname(settingsPath), { recursive: true });
  const current = readSettingsObject(settingsPath);
  current.ideCommand = command;
  writeFileSync(settingsPath, `${JSON.stringify(current)}\n`);
}

export function saveContentColor(color: string, env?: NodeJS.ProcessEnv): void {
  const settingsPath = resolveAppSettingsPath(env);
  mkdirSync(dirname(settingsPath), { recursive: true });
  const current = readSettingsObject(settingsPath);
  current.contentColor = color;
  writeFileSync(settingsPath, `${JSON.stringify(current)}\n`);
}

export function resetAppColors(env?: NodeJS.ProcessEnv): void {
  const settingsPath = resolveAppSettingsPath(env);
  mkdirSync(dirname(settingsPath), { recursive: true });
  const current = readSettingsObject(settingsPath);
  current.sidebarColor = originalSidebarColor;
  current.contentColor = originalContentColor;
  writeFileSync(settingsPath, `${JSON.stringify(current)}\n`);
}

function runtimeEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (env) {
    return env;
  }
  // The desktop bundle inlines any direct `process.env` reference. Building the
  // name keeps the running environment, including GIT_MANAGER_APP_SETTINGS_PATH.
  const processRef = (globalThis as { process?: { env?: NodeJS.ProcessEnv } })['pro' + 'cess'];
  return processRef?.env ?? {};
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
  if (typeof mode === 'string') {
    return mode;
  }
  if (mode === undefined || mode === null) {
    return undefined;
  }
  return String(mode);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
