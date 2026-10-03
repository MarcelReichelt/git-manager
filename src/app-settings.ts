import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import TOML from '@iarna/toml';
import { runtimeEnv } from './runtime-env.js';

export type TerminalMode = 'none' | 'terminal' | 'tmux';

export interface AppSettings {
  defaultLayout: 'workspaces' | 'sibling';
  sidebarColor: string;
  contentColor: string;
  terminalBackground: string;
  terminalForeground: string;
  terminalFont: string;
  ideCommand: string;
  terminalMode: TerminalMode;
  shellCommand: string;
}

const originalSidebarColor = '#1a3c2b';
const originalContentColor = '#f7f7f5';
const originalTerminalBackground = '#1e1e1e';
const originalTerminalForeground = '#d4d4d4';
const originalTerminalFont = 'UbuntuMono Nerd Font Mono';

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

export function formatCreateLayout(repoPath: string | null, env?: NodeJS.ProcessEnv): string {
  const layout =
    repoPath === null
      ? {
          label: readAppSettings(env).defaultLayout === 'sibling' ? 'Sibling' : 'Workspaces',
          source: 'app' as const,
        }
      : createLayoutForRepository(repoPath, env);
  const origin = layout.source === 'repository' ? 'set by this repository' : 'the app default';
  return `${layout.label}, ${origin}`;
}

export function readAppSettings(env?: NodeJS.ProcessEnv): AppSettings {
  const stored = readSettingsObject(resolveAppSettingsPath(env));
  return {
    defaultLayout: stored.defaultLayout === 'sibling' ? 'sibling' : 'workspaces',
    sidebarColor: typeof stored.sidebarColor === 'string' ? stored.sidebarColor : originalSidebarColor,
    contentColor: typeof stored.contentColor === 'string' ? stored.contentColor : originalContentColor,
    terminalBackground:
      typeof stored.terminalBackground === 'string' ? stored.terminalBackground : originalTerminalBackground,
    terminalForeground:
      typeof stored.terminalForeground === 'string' ? stored.terminalForeground : originalTerminalForeground,
    terminalFont: typeof stored.terminalFont === 'string' ? stored.terminalFont : originalTerminalFont,
    ideCommand: typeof stored.ideCommand === 'string' ? stored.ideCommand : '',
    terminalMode: terminalMode(stored.terminalMode),
    shellCommand: typeof stored.shellCommand === 'string' ? stored.shellCommand : '',
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

export function saveRepositoryLayoutMode(
  repoPath: string,
  mode: 'workspaces' | 'sibling',
): void {
  const configPath = join(repoPath, '.git-manager', 'config.toml');
  mkdirSync(dirname(configPath), { recursive: true });
  const current = readRepositoryConfig(configPath);
  const layout = isRecord(current.layout) ? { ...current.layout } : {};
  layout.mode = mode;
  current.layout = layout;
  writeFileSync(configPath, TOML.stringify(current as Parameters<typeof TOML.stringify>[0]));
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

export function saveTerminalBackground(color: string, env?: NodeJS.ProcessEnv): void {
  const settingsPath = resolveAppSettingsPath(env);
  mkdirSync(dirname(settingsPath), { recursive: true });
  const current = readSettingsObject(settingsPath);
  current.terminalBackground = color;
  writeFileSync(settingsPath, `${JSON.stringify(current)}\n`);
}

export function saveTerminalForeground(color: string, env?: NodeJS.ProcessEnv): void {
  const settingsPath = resolveAppSettingsPath(env);
  mkdirSync(dirname(settingsPath), { recursive: true });
  const current = readSettingsObject(settingsPath);
  current.terminalForeground = color;
  writeFileSync(settingsPath, `${JSON.stringify(current)}\n`);
}

export function saveTerminalFont(font: string, env?: NodeJS.ProcessEnv): void {
  const settingsPath = resolveAppSettingsPath(env);
  mkdirSync(dirname(settingsPath), { recursive: true });
  const current = readSettingsObject(settingsPath);
  current.terminalFont = font;
  writeFileSync(settingsPath, `${JSON.stringify(current)}\n`);
}

export function saveTerminalMode(mode: TerminalMode, env?: NodeJS.ProcessEnv): void {
  const settingsPath = resolveAppSettingsPath(env);
  mkdirSync(dirname(settingsPath), { recursive: true });
  const current = readSettingsObject(settingsPath);
  current.terminalMode = mode;
  writeFileSync(settingsPath, `${JSON.stringify(current)}\n`);
}

export function saveShellCommand(command: string, env?: NodeJS.ProcessEnv): void {
  const settingsPath = resolveAppSettingsPath(env);
  mkdirSync(dirname(settingsPath), { recursive: true });
  const current = readSettingsObject(settingsPath);
  current.shellCommand = command;
  writeFileSync(settingsPath, `${JSON.stringify(current)}\n`);
}

export function resetAppColors(env?: NodeJS.ProcessEnv): void {
  const settingsPath = resolveAppSettingsPath(env);
  mkdirSync(dirname(settingsPath), { recursive: true });
  const current = readSettingsObject(settingsPath);
  current.sidebarColor = originalSidebarColor;
  current.contentColor = originalContentColor;
  current.terminalBackground = originalTerminalBackground;
  current.terminalForeground = originalTerminalForeground;
  writeFileSync(settingsPath, `${JSON.stringify(current)}\n`);
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

function readRepositoryConfig(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) {
    return {};
  }
  const parsed: unknown = TOML.parse(readFileSync(configPath, 'utf8'));
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

function terminalMode(value: unknown): TerminalMode {
  if (value === 'none' || value === 'terminal' || value === 'tmux') {
    return value;
  }
  return 'terminal';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
