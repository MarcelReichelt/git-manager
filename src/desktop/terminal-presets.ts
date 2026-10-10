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

export interface CheckoutPresets {
  presets: CommittedPreset[] | null;
  error: string | null;
}

interface OverlayPreset {
  name: string;
  preset: CommittedPreset | null;
}

export function readCommittedPreset(checkout: string): CommittedPreset[] | null {
  return readPresetFile(checkout, 'terminals.toml');
}

export function readCheckoutPresets(checkout: string): CheckoutPresets {
  const committed = readCommittedPreset(checkout);
  const overlay = readOverlayPresets(checkout);
  if (!overlay) {
    return { presets: committed, error: null };
  }
  const base = committed ?? [];
  const names = new Set(base.map((preset) => presetKey(preset.name)));
  const replacements = new Map<string, OverlayPreset>();
  const extras: OverlayPreset[] = [];
  for (const entry of overlay) {
    if (names.has(entry.name)) {
      replacements.set(entry.name, entry);
    } else {
      extras.push(entry);
    }
  }
  const merged: CommittedPreset[] = [];
  let error: string | null = null;
  for (const preset of base) {
    const replacement = replacements.get(presetKey(preset.name));
    if (!replacement) {
      merged.push(preset);
      continue;
    }
    if (replacement.preset === null) {
      error ??= `Preset "${replacement.name}" has no tabs`;
      continue;
    }
    merged.push(replacement.preset);
  }
  for (const extra of extras) {
    if (extra.preset === null) {
      error ??= `Preset "${extra.name}" has no tabs`;
      continue;
    }
    merged.push(extra.preset);
  }
  return { presets: merged.length > 0 ? merged : null, error };
}

function presetKey(name: string): string {
  return name.trim();
}

function readPresetFile(checkout: string, filename: string): CommittedPreset[] | null {
  const parsed = readPresetDocument(checkout, filename);
  return parsed === null ? null : committedPresets(parsed);
}

function readOverlayPresets(checkout: string): OverlayPreset[] | null {
  const parsed = readPresetDocument(checkout, 'terminals.override.toml');
  return parsed === null ? null : overlayPresets(parsed);
}

function readPresetDocument(checkout: string, filename: string): unknown | null {
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
  return parsed;
}

function overlayPresets(parsed: unknown): OverlayPreset[] | null {
  if (!isRecord(parsed) || !Object.prototype.hasOwnProperty.call(parsed, 'preset')) {
    return null;
  }
  const presets = parsed.preset;
  if (!Array.isArray(presets) || presets.length === 0) {
    return null;
  }
  const resolved: OverlayPreset[] = [];
  for (const entry of presets) {
    const preset = overlayPreset(entry);
    if (preset) {
      resolved.push(preset);
    }
  }
  return resolved.length > 0 ? resolved : null;
}

function overlayPreset(entry: unknown): OverlayPreset | null {
  if (!isRecord(entry)) {
    throw new Error('Invalid terminals.toml: preset must be a table');
  }
  const name = entry.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return null;
  }
  const key = name.trim();
  const tabs = presetTabs(entry);
  if (tabs.length === 0) {
    return { name: key, preset: null };
  }
  return { name: key, preset: { name: key, tabs } };
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
