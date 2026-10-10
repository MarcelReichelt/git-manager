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
  error?: string;
}

interface PresetSlot {
  name: string | null;
  preset: CommittedPreset | null;
  error: string | null;
}

export function readCommittedPreset(checkout: string): CommittedPreset[] | null {
  return presetsFromSlots(readPresetFile(checkout, 'terminals.toml').slots);
}

export function readCheckoutPresets(checkout: string): CheckoutPresets {
  const committed = loadCommittedPresets(checkout);
  const overlay = loadOverlayPresets(checkout);
  const committedError = committed.error ?? firstSlotError(committed.slots);
  if (!overlay.value) {
    return { presets: presetsFromSlots(committed.slots), error: committedError ?? overlay.error };
  }
  const base = committed.slots ?? [];
  const names = new Set(base.flatMap((slot) => (slot.name ? [slot.name] : [])));
  const replacements = new Map<string, OverlayPreset>();
  const extras: OverlayPreset[] = [];
  for (const entry of overlay.value) {
    if (names.has(entry.name)) {
      replacements.set(entry.name, entry);
    } else {
      extras.push(entry);
    }
  }
  let error = committed.error ?? remainingCommittedError(base, replacements) ?? overlay.error;
  const merged: CommittedPreset[] = [];
  for (const slot of base) {
    if (!slot.name) {
      continue;
    }
    const replacement = replacements.get(slot.name);
    if (!replacement) {
      if (slot.preset) {
        merged.push(slot.preset);
      }
      continue;
    }
    if (replacement.preset !== null) {
      merged.push(replacement.preset);
    }
  }
  for (const extra of extras) {
    if (extra.preset !== null) {
      merged.push(extra.preset);
    }
  }
  return { presets: merged.length > 0 ? merged : null, error };
}

function loadCommittedPresets(checkout: string): { slots: PresetSlot[] | null; error: string | null } {
  try {
    const read = readPresetFile(checkout, 'terminals.toml');
    return { slots: read.slots, error: read.error };
  } catch (error) {
    return { slots: null, error: errorText(error) };
  }
}

function loadOverlayPresets(checkout: string): { value: OverlayPreset[] | null; error: string | null } {
  try {
    const parsed = readPresetDocument(checkout, 'terminals.override.toml');
    if (parsed === null) {
      return { value: null, error: null };
    }
    const read = overlayPresets(parsed, checkout);
    return { value: read.presets, error: read.error };
  } catch (error) {
    return { value: null, error: errorText(error) };
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function presetKey(name: string): string {
  return name.trim();
}

function duplicatePresetName(presets: unknown[]): string | null {
  const seen = new Set<string>();
  for (const entry of presets) {
    if (!isRecord(entry)) {
      continue;
    }
    const name = entry.name;
    if (typeof name !== 'string') {
      continue;
    }
    const key = presetKey(name);
    if (key.length === 0) {
      continue;
    }
    if (seen.has(key)) {
      return key;
    }
    seen.add(key);
  }
  return null;
}

function readPresetFile(checkout: string, filename: string): { slots: PresetSlot[] | null; error: string | null } {
  const parsed = readPresetDocument(checkout, filename);
  return parsed === null ? { slots: null, error: null } : committedPresets(parsed, checkout);
}

function presetsFromSlots(slots: PresetSlot[] | null): CommittedPreset[] | null {
  if (!slots) {
    return null;
  }
  const presets = slots.flatMap((slot) => (slot.preset ? [slot.preset] : []));
  return presets.length > 0 ? presets : null;
}

function firstSlotError(slots: PresetSlot[] | null): string | null {
  if (!slots) {
    return null;
  }
  for (const slot of slots) {
    if (slot.error) {
      return slot.error;
    }
  }
  return null;
}

function remainingCommittedError(slots: PresetSlot[], replacements: ReadonlyMap<string, OverlayPreset>): string | null {
  for (const slot of slots) {
    if (slot.name && replacements.has(slot.name)) {
      continue;
    }
    if (slot.error) {
      return slot.error;
    }
  }
  return null;
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
    throw new Error(`Invalid ${filename}: ${detail}`);
  }
  return parsed;
}

function overlayPresets(parsed: unknown, checkout: string): { presets: OverlayPreset[] | null; error: string | null } {
  if (!isRecord(parsed) || !Object.prototype.hasOwnProperty.call(parsed, 'preset')) {
    return { presets: null, error: null };
  }
  const presets = parsed.preset;
  if (!Array.isArray(presets) || presets.length === 0) {
    return { presets: null, error: null };
  }
  const duplicate = duplicatePresetName(presets);
  if (duplicate !== null) {
    throw new Error(`Preset name "${duplicate}" is used more than once`);
  }
  const resolved: OverlayPreset[] = [];
  let error: string | null = null;
  for (const entry of presets) {
    const preset = overlayPreset(entry, checkout);
    error ??= preset.error;
    if (preset.preset) {
      resolved.push(preset.preset);
    }
  }
  return { presets: resolved.length > 0 ? resolved : null, error };
}

function overlayPreset(entry: unknown, checkout: string): { preset: OverlayPreset | null; error: string | null } {
  if (!isRecord(entry)) {
    return { preset: null, error: 'Invalid terminals.toml: preset must be a table' };
  }
  const name = entry.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { preset: null, error: 'A preset has no name' };
  }
  const key = name.trim();
  if (hasOverfullTab(entry)) {
    const error = `Preset "${key}" has a tab with more than two terminals`;
    return { preset: { name: key, preset: null, error }, error };
  }
  const tabs = presetTabs(entry, checkout);
  if (tabs.tabs.length === 0) {
    const error = tabs.error ?? `Preset "${key}" has no tabs`;
    return { preset: { name: key, preset: null, error }, error };
  }
  const preset: OverlayPreset = tabs.error
    ? { name: key, preset: { name: key, tabs: tabs.tabs }, error: tabs.error }
    : { name: key, preset: { name: key, tabs: tabs.tabs } };
  return { preset, error: tabs.error };
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

function committedPresets(parsed: unknown, checkout: string): { slots: PresetSlot[] | null; error: string | null } {
  if (!isRecord(parsed) || !Object.prototype.hasOwnProperty.call(parsed, 'preset')) {
    return { slots: null, error: null };
  }
  const presets = parsed.preset;
  if (!Array.isArray(presets) || presets.length === 0) {
    return { slots: null, error: null };
  }
  const duplicate = duplicatePresetName(presets);
  if (duplicate !== null) {
    throw new Error(`Preset name "${duplicate}" is used more than once`);
  }
  const slots: PresetSlot[] = [];
  for (const entry of presets) {
    const preset = onePreset(entry, checkout);
    slots.push({ name: presetName(entry), preset: preset.preset, error: preset.error });
  }
  return { slots: slots.length > 0 ? slots : null, error: null };
}

function presetName(entry: unknown): string | null {
  if (!isRecord(entry)) {
    return null;
  }
  const name = entry.name;
  if (typeof name !== 'string') {
    return null;
  }
  const key = presetKey(name);
  return key.length > 0 ? key : null;
}

function onePreset(entry: unknown, checkout: string): { preset: CommittedPreset | null; error: string | null } {
  if (!isRecord(entry)) {
    return { preset: null, error: 'Invalid terminals.toml: preset must be a table' };
  }
  const name = entry.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { preset: null, error: 'A preset has no name' };
  }
  if (hasOverfullTab(entry)) {
    return { preset: null, error: `Preset "${name.trim()}" has a tab with more than two terminals` };
  }
  const tabs = presetTabs(entry, checkout);
  if (tabs.tabs.length === 0) {
    return { preset: null, error: tabs.error ?? `Preset "${name.trim()}" has no tabs` };
  }
  return { preset: { name, tabs: tabs.tabs }, error: tabs.error };
}

function hasOverfullTab(preset: Record<string, unknown>): boolean {
  if (!Object.prototype.hasOwnProperty.call(preset, 'tab')) {
    return false;
  }
  const tabs = preset.tab;
  if (!Array.isArray(tabs)) {
    return false;
  }
  return tabs.some((tab) => isRecord(tab) && Array.isArray(tab.terminals) && tab.terminals.length > 2);
}

function presetTabs(preset: Record<string, unknown>, checkout: string): { tabs: PresetTab[]; error: string | null } {
  if (!Object.prototype.hasOwnProperty.call(preset, 'tab')) {
    return { tabs: [], error: null };
  }
  const tabs = preset.tab;
  if (!Array.isArray(tabs)) {
    return { tabs: [], error: 'Invalid terminals.toml: tab must be a table' };
  }
  const resolved: PresetTab[] = [];
  let error: string | null = null;
  for (const entry of tabs) {
    const tab = oneTab(entry, checkout);
    error ??= tab.error;
    if (tab.tab) {
      resolved.push(tab.tab);
    }
  }
  return { tabs: resolved, error };
}

function oneTab(entry: unknown, checkout: string): { tab: PresetTab | null; error: string | null } {
  if (!isRecord(entry)) {
    return { tab: null, error: 'Invalid terminals.toml: tab must be a table' };
  }
  if (!Object.prototype.hasOwnProperty.call(entry, 'terminals')) {
    return { tab: null, error: null };
  }
  const terminals = entry.terminals;
  if (!Array.isArray(terminals)) {
    return { tab: null, error: 'Invalid terminals.toml: terminal must be a table' };
  }
  const resolved: PresetTerminal[] = [];
  let error: string | null = null;
  for (const terminal of terminals) {
    const outcome = oneTerminal(terminal, checkout);
    error ??= outcome.error;
    if (outcome.terminal) {
      resolved.push(outcome.terminal);
    }
  }
  return { tab: resolved.length > 0 ? { terminals: resolved } : null, error };
}

function oneTerminal(entry: unknown, checkout: string): { terminal: PresetTerminal | null; error: string | null } {
  if (!isRecord(entry)) {
    return { terminal: null, error: 'Invalid terminals.toml: terminal must be a table' };
  }
  const name = entry.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { terminal: null, error: 'A terminal has no name' };
  }
  const command = entry.command;
  if (command !== undefined && typeof command !== 'string') {
    return { terminal: null, error: 'Invalid terminals.toml: startup command must be a string' };
  }
  if (typeof command === 'string' && command.includes('\n')) {
    return { terminal: null, error: `The startup command for "${name.trim()}" contains a newline` };
  }
  const directory = entry.cwd;
  if (directory !== undefined && typeof directory !== 'string') {
    return { terminal: null, error: 'Invalid terminals.toml: directory must be a string' };
  }
  const written = typeof directory === 'string' && directory.length > 0 ? directory : undefined;
  let resolved: string;
  try {
    resolved = terminalDirectory(checkout, written);
  } catch (error) {
    return { terminal: null, error: errorText(error) };
  }
  if (!existsSync(resolved)) {
    return { terminal: null, error: `The terminal directory does not exist: ${written}` };
  }
  return {
    terminal: {
      name,
      command: typeof command === 'string' ? command : '',
      directory: written,
    },
    error: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
