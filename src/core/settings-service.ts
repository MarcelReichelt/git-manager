import { confirm, input, number, select } from '@inquirer/prompts';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import {
  loadGlobalConfig,
  saveGlobalConfig,
  loadRepoConfig,
  saveRepoConfig,
  loadEffectiveConfig,
  isSetupComplete,
} from '../config/loader.js';
import { defaultGlobalConfig } from '../config/schema.js';
import { expandHome } from '../config/paths.js';
import type { GlobalConfig, LayoutMode } from '../config/schema.js';
import { getActiveRepository } from './active-session.js';

export async function runSetupWizard(): Promise<GlobalConfig> {
  console.log('\nWelcome to git-manager! Let\'s configure your settings.\n');

  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
  const detectedEditors = ['cursor', 'code', 'nvim', 'vim'].filter((e) => {
    try {
      execSync(`${lookupCommand} ${e}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });

  const defaultEditor =
    process.env.GIT_MANAGER_EDITOR ||
    process.env.VISUAL ||
    process.env.EDITOR ||
    detectedEditors[0] ||
    'code';

  const editorCommand = await input({
    message: 'Editor command',
    default: defaultEditor,
  });

  const cloneRoot = await input({
    message: 'Default clone location',
    default: '~/DEV',
  });

  const expandedCloneRoot = expandHome(cloneRoot);
  if (!existsSync(expandedCloneRoot)) {
    const create = await confirm({
      message: `Create ${expandedCloneRoot}?`,
      default: true,
    });
    if (create) {
      mkdirSync(expandedCloneRoot, { recursive: true });
    }
  }

  const layoutMode = await select<LayoutMode>({
    message: 'Default clone layout',
    choices: [
      { name: 'workspaces — worktrees in .workspaces/', value: 'workspaces' },
      { name: 'sibling — each worktree as sibling folder', value: 'sibling' },
    ],
    default: 'workspaces',
  });

  const refreshInterval = await number({
    message: 'TUI refresh interval (ms, 0 = manual)',
    default: 2000,
  });

  const config = loadGlobalConfig();
  config.meta.setup_completed = true;
  config.meta.setup_version = 1;
  config.editor.command = editorCommand;
  config.editor.args = [];
  config.defaults.clone_root = cloneRoot;
  config.defaults.layout_mode = layoutMode;
  config.tui.refresh_interval_ms = refreshInterval ?? 2000;

  saveGlobalConfig(config);
  console.log('\nSetup complete! Read docs/getting-started.md for more.\n');
  return config;
}

export async function ensureSetup(): Promise<void> {
  if (!isSetupComplete()) {
    await runSetupWizard();
  }
}

export function showSettings(): void {
  const global = loadGlobalConfig();
  const active = getActiveRepository();
  console.log('\nGlobal settings:');
  console.log(JSON.stringify(global, null, 2));
  if (active) {
    const repo = loadRepoConfig(active.path);
    console.log('\nRepository overrides:');
    console.log(JSON.stringify(repo, null, 2));
  }
}

export async function editSettingsInteractive(): Promise<void> {
  const choice = await select({
    message: 'Settings',
    choices: [
      { name: 'Editor command', value: 'editor.command' },
      { name: 'Clone root', value: 'defaults.clone_root' },
      { name: 'Default layout mode', value: 'defaults.layout_mode' },
      { name: 'TUI refresh interval', value: 'tui.refresh_interval_ms' },
      { name: 'Run setup wizard', value: 'wizard' },
    ],
  });

  if (choice === 'wizard') {
    await runSetupWizard();
    return;
  }

  const config = loadGlobalConfig();
  const value = await input({ message: `New value for ${choice}` });

  setNestedValue(config as unknown as Record<string, unknown>, choice, parseValue(value));
  saveGlobalConfig(config);
  console.log('Settings saved.');
}

export function setSetting(key: string, value: string): void {
  const config = loadGlobalConfig();
  setNestedValue(config as unknown as Record<string, unknown>, key, parseValue(value));
  saveGlobalConfig(config);
}

export async function resetSettings(key?: string): Promise<void> {
  if (key) {
    const defaults = defaultGlobalConfig();
    const config = loadGlobalConfig();
    const defaultValue = getNestedValue(defaults as unknown as Record<string, unknown>, key);
    setNestedValue(config as unknown as Record<string, unknown>, key, defaultValue);
    saveGlobalConfig(config);
    return;
  }
  const ok = await confirm({ message: 'Reset all global settings?', default: false });
  if (ok) {
    saveGlobalConfig(defaultGlobalConfig());
  }
}

function parseValue(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== '') return num;
  return value;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function showEffectiveConfig(): void {
  const active = getActiveRepository();
  if (!active) {
    console.error('No active repository');
    return;
  }
  const effective = loadEffectiveConfig(active.path);
  console.log(JSON.stringify(effective, null, 2));
}

export function initRepoConfig(): void {
  const active = getActiveRepository();
  if (!active) {
    console.error('No active repository');
    return;
  }
  const config = loadRepoConfig(active.path);
  saveRepoConfig(active.path, config);
  console.log(`Created config at ${active.path}/.git-manager/config.toml`);
}
