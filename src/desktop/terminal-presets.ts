import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, sep } from 'node:path';
import TOML from '@iarna/toml';

export interface PresetTerminal {
  name: string;
  command: string;
  directory: string | undefined;
}

export interface PresetTab {
  terminals: PresetTerminal[];
}

export interface CommittedPreset {
  name: string;
  tabs: PresetTab[];
}

export function readCommittedPreset(checkout: string): CommittedPreset[] | null {
  return readPresetFile(checkout, 'terminals.toml');
}

export function readCheckoutPresets(checkout: string): CommittedPreset[] | null {
  const committed = readCommittedPreset(checkout);
  const overlay = readPresetFile(checkout, 'terminals.override.toml');
  if (!committed || !overlay) {
    return committed;
  }
  const replacements = new Map(overlay.map((preset) => [presetKey(preset.name), preset]));
  const names = new Set(committed.map((preset) => presetKey(preset.name)));
  return [
    ...committed.map((preset) => replacements.get(presetKey(preset.name)) ?? preset),
    ...overlay.filter((preset) => !names.has(presetKey(preset.name))),
  ];
}

function presetKey(name: string): string {
  return name.trim();
}

function readPresetFile(checkout: string, filename: string): CommittedPreset[] | null {
  const file = join(checkout, '.git-worktree-manager', filename);
  if (!existsSync(file)) {
    return null;
  }
  const text = readFileSync(file, 'utf8');
  if (text.trim() === '') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = TOML.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid terminals.toml: ${detail}`);
  }
  return committedPresets(parsed);
}

export function terminalDirectory(checkout: string, directory: string | undefined): string {
  if (directory === undefined || directory === '') {
    return checkout;
  }
  if (isAbsolute(directory)) {
    return directory;
  }
  const resolved = normalize(join(checkout, directory));
  const base = normalize(checkout);
  const fromBase = relative(base, resolved);
  if (fromBase === '' || (fromBase !== '..' && !fromBase.startsWith(`..${sep}`) && !isAbsolute(fromBase))) {
    return resolved;
  }
  throw new Error(`The terminal directory leaves the checkout: ${directory}`);
}

function committedPresets(parsed: unknown): CommittedPreset[] | null {
  if (!isRecord(parsed) || !Object.prototype.hasOwnProperty.call(parsed, 'preset')) {
    return null;
  }
  const presets = parsed.preset;
  if (!Array.isArray(presets) || presets.length === 0) {
    return null;
  }
  const resolved: CommittedPreset[] = [];
  for (const entry of presets) {
    const preset = onePreset(entry);
    if (preset) {
      resolved.push(preset);
    }
  }
  return resolved.length > 0 ? resolved : null;
}

function onePreset(entry: unknown): CommittedPreset | null {
  if (!isRecord(entry)) {
    throw new Error('Invalid terminals.toml: preset must be a table');
  }
  const name = entry.name;
  if (typeof name !== 'string' || name.length === 0) {
    return null;
  }
  const tabs = presetTabs(entry);
  if (tabs.length === 0) {
    return null;
  }
  return { name, tabs };
}

function presetTabs(preset: Record<string, unknown>): PresetTab[] {
  if (!Object.prototype.hasOwnProperty.call(preset, 'tab')) {
    return [];
  }
  const tabs = preset.tab;
  if (!Array.isArray(tabs)) {
    throw new Error('Invalid terminals.toml: tab must be a table');
  }
  const resolved: PresetTab[] = [];
  for (const entry of tabs) {
    const tab = oneTab(entry);
    if (tab) {
      resolved.push(tab);
    }
  }
  return resolved;
}

function oneTab(entry: unknown): PresetTab | null {
  if (!isRecord(entry)) {
    throw new Error('Invalid terminals.toml: tab must be a table');
  }
  if (!Object.prototype.hasOwnProperty.call(entry, 'terminals')) {
    return null;
  }
  const terminals = entry.terminals;
  if (!Array.isArray(terminals)) {
    throw new Error('Invalid terminals.toml: terminal must be a table');
  }
  const resolved: PresetTerminal[] = [];
  for (const terminal of terminals) {
    if (resolved.length === 2) {
      break;
    }
    resolved.push(oneTerminal(terminal));
  }
  return resolved.length > 0 ? { terminals: resolved } : null;
}

function oneTerminal(entry: unknown): PresetTerminal {
  if (!isRecord(entry)) {
    throw new Error('Invalid terminals.toml: terminal must be a table');
  }
  const name = entry.name;
  if (typeof name !== 'string') {
    throw new Error('Invalid terminals.toml: terminal name must be a string');
  }
  const command = entry.command;
  if (command !== undefined && typeof command !== 'string') {
    throw new Error('Invalid terminals.toml: startup command must be a string');
  }
  const directory = entry.cwd;
  if (directory !== undefined && typeof directory !== 'string') {
    throw new Error('Invalid terminals.toml: directory must be a string');
  }
  return {
    name,
    command: typeof command === 'string' ? command : '',
    directory: typeof directory === 'string' && directory.length > 0 ? directory : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
