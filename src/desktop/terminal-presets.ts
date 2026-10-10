import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, sep } from 'node:path';
import TOML from '@iarna/toml';

export interface PresetTerminal {
  name: string;
  command: string;
  directory: string | undefined;
}

export interface CommittedPreset {
  name: string;
  terminal: PresetTerminal;
}

export function readCommittedPreset(checkout: string): CommittedPreset | null {
  const file = join(checkout, '.git-worktree-manager', 'terminals.toml');
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
  return committedPreset(parsed);
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

function committedPreset(parsed: unknown): CommittedPreset | null {
  if (!isRecord(parsed) || !Object.prototype.hasOwnProperty.call(parsed, 'preset')) {
    return null;
  }
  const presets = parsed.preset;
  if (!Array.isArray(presets) || presets.length === 0) {
    return null;
  }
  const preset = presets[0];
  if (!isRecord(preset)) {
    throw new Error('Invalid terminals.toml: preset must be a table');
  }
  const name = preset.name;
  if (typeof name !== 'string' || name.length === 0) {
    return null;
  }
  const terminal = firstTerminal(preset);
  if (!terminal) {
    return null;
  }
  return { name, terminal };
}

function firstTerminal(preset: Record<string, unknown>): PresetTerminal | null {
  const tabs = preset.tab;
  if (!Array.isArray(tabs) || tabs.length === 0) {
    return null;
  }
  const tab = tabs[0];
  if (!isRecord(tab)) {
    throw new Error('Invalid terminals.toml: tab must be a table');
  }
  const terminals = tab.terminals;
  if (!Array.isArray(terminals) || terminals.length === 0) {
    return null;
  }
  const terminal = terminals[0];
  if (!isRecord(terminal)) {
    throw new Error('Invalid terminals.toml: terminal must be a table');
  }
  const name = terminal.name;
  if (typeof name !== 'string') {
    throw new Error('Invalid terminals.toml: terminal name must be a string');
  }
  const command = terminal.command;
  if (command !== undefined && typeof command !== 'string') {
    throw new Error('Invalid terminals.toml: startup command must be a string');
  }
  const directory = terminal.cwd;
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
