import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { runtimeEnv } from '../runtime-env.js';
import { shellCanTakeInput } from './shell-prompt';

export function tmuxOnPath(pathValue = runtimeEnv().PATH): string | null {
  const directories = (pathValue ?? '').split(delimiter);
  for (const directory of directories) {
    if (directory.length === 0 || directory.startsWith('/exec-daemon')) {
      continue;
    }
    const candidate = join(directory, process.platform === 'win32' ? 'tmux.exe' : 'tmux');
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function tmuxBinary(): string {
  return tmuxOnPath() ?? '/usr/bin/tmux';
}

export function terminalEnvironment(): NodeJS.ProcessEnv {
  const env = { ...runtimeEnv() };
  delete env.TMUX;
  delete env.TMUX_PANE;
  return env;
}

export function sessionDirectory(name: string): string {
  try {
    return execFileSync(tmuxBinary(), ['display-message', '-p', '-t', name, '#{pane_current_path}'], {
      encoding: 'utf8',
      env: terminalEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

const appSessionName = /^gm_[0-9a-f]{8}_[A-Za-z0-9/-]+_[1-9][0-9]*$/;

export function appTmuxSessions(): string[] {
  return listTmuxSessions().filter((name) => appSessionName.test(name));
}

export function listTmuxSessions(): string[] {
  return listedTmuxSessions().map((session) => session.name);
}

export function branchSessionPrefix(repoPath: string, branch: string): string {
  return `gm_${repositoryHash(repoPath)}_${tmuxNameSegmentForBranch(branch)}_`;
}

function tmuxNameSegmentForBranch(branch: string): string {
  if (/^[A-Za-z0-9-]+$/.test(branch)) {
    return branch;
  }
  let segment = '';
  for (const char of branch) {
    if (/^[A-Za-z0-9/-]$/.test(char)) {
      segment += char;
      continue;
    }
    const bytes = new TextEncoder().encode(char);
    for (const byte of bytes) {
      segment += `-${byte.toString(16).padStart(2, '0')}`;
    }
  }
  // A slash already separates this branch from every tmux-safe name.
  // An encoding made only of letters, digits, and hyphens would be that safe name.
  if (/^[A-Za-z0-9-]+$/.test(segment)) {
    return `${segment}/${branchHash(branch)}`;
  }
  return segment;
}

function branchHash(branch: string): string {
  return createHash('sha256').update(branch).digest('hex').slice(0, 8);
}

function sanitizedBranch(branch: string): string {
  return branch.replace(/[^A-Za-z0-9-]/g, '-');
}

function legacySessionPrefix(repoPath: string, branch: string): string {
  return `gm_${repositoryHash(repoPath)}_${sanitizedBranch(branch)}_`;
}

export type OldSessionChoice = {
  name: string;
  branches: string[];
};

export function claimUniqueLegacySessions(repoPath: string, branches: readonly string[]): void {
  for (const session of untaggedOldSessions(repoPath)) {
    const matched = branchesMatchingOldName(branches, session.segment);
    if (matched.length === 1) {
      rememberSessionBranch(session.name, matched[0]);
    }
  }
}

export function ambiguousLegacySessions(repoPath: string, branches: readonly string[]): OldSessionChoice[] {
  const choices: OldSessionChoice[] = [];
  for (const session of untaggedOldSessions(repoPath)) {
    const matched = branchesMatchingOldName(branches, session.segment);
    if (matched.length > 1) {
      choices.push({ name: session.name, branches: matched });
    }
  }
  return choices.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

function branchesMatchingOldName(branches: readonly string[], segment: string): string[] {
  return branches.filter((branch) => sanitizedBranch(branch) === segment);
}

type OldSession = {
  name: string;
  segment: string;
};

function untaggedOldSessions(repoPath: string): OldSession[] {
  const prefix = `gm_${repositoryHash(repoPath)}_`;
  const sessions: OldSession[] = [];
    for (const session of listedTmuxSessions()) {
    if (session.branch.length > 0 || !session.name.startsWith(prefix)) {
      continue;
    }
    const segment = oldNameSegment(session.name.slice(prefix.length));
    if (segment === undefined) {
      continue;
    }
    sessions.push({ name: session.name, segment });
  }
  return sessions;
}

function oldNameSegment(rest: string): string | undefined {
  const match = /^([A-Za-z0-9-]+)_([1-9][0-9]*)$/.exec(rest);
  if (!match) {
    return undefined;
  }
  return match[1];
}

function repositoryHash(repoPath: string): string {
  return createHash('sha256').update(resolve(repoPath)).digest('hex').slice(0, 8);
}

export function sessionName(repoPath: string, branch: string, index: number): string {
  return `${branchSessionPrefix(repoPath, branch)}${index}`;
}

export function sessionsForBranch(
  repoPath: string,
  branch: string,
  sessions: readonly TmuxSessionRecord[] = listedTmuxSessions(),
): string[] {
  const prefixes = sessionPrefixes(repoPath, branch);
  return sessions
    .filter((session) => belongsToBranch(session, branch, prefixes))
    .map((session) => session.name)
    .sort(
      (left, right) =>
        (sessionIndexRecognizedForBranch(left, prefixes) ?? 0) -
        (sessionIndexRecognizedForBranch(right, prefixes) ?? 0),
    );
}

export function nextSessionIndex(repoPath: string, branch: string, known: string[]): number {
  const prefixes = sessionPrefixes(repoPath, branch);
  const names = new Set<string>([...known, ...sessionsForBranch(repoPath, branch)]);
  let highest = 0;
  for (const name of names) {
    const index = sessionIndexRecognizedForBranch(name, prefixes);
    if (index !== undefined) {
      highest = Math.max(highest, index);
    }
  }
  return highest + 1;
}

interface SessionPrefixes {
  canonical: string;
  legacy: string;
  repository: string;
}

function sessionPrefixes(repoPath: string, branch: string): SessionPrefixes {
  return {
    canonical: branchSessionPrefix(repoPath, branch),
    legacy: legacySessionPrefix(repoPath, branch),
    repository: `gm_${repositoryHash(repoPath)}_`,
  };
}

export function createBranchSession(
  repoPath: string,
  branch: string,
  cwd: string,
  index: number,
): string {
  const name = sessionName(repoPath, branch, index);
  if (!listTmuxSessions().includes(name)) {
    execFileSync(
      tmuxBinary(),
      ['new-session', '-d', '-s', name, '-c', cwd, ';', 'set-option', '-t', name, '@gm_branch', branch],
      {
        env: terminalEnvironment(),
        stdio: 'ignore',
      },
    );
  }
  return name;
}

export function rememberSessionBranch(name: string, branch: string): void {
  execFileSync(tmuxBinary(), ['set-option', '-t', name, '@gm_branch', branch], {
    env: terminalEnvironment(),
    stdio: 'ignore',
  });
}

export function killTmuxSession(name: string): void {
  try {
    execFileSync(tmuxBinary(), ['kill-session', '-t', name], {
      env: terminalEnvironment(),
      stdio: 'ignore',
    });
  } catch {
    // The session is already gone.
  }
}

export function tmuxSessionAlive(name: string): boolean {
  try {
    execFileSync(tmuxBinary(), ['has-session', '-t', name], {
      env: terminalEnvironment(),
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

export function typeTmuxStartupCommand(session: string, command: string): void {
  if (command.length === 0 || session.length === 0) {
    return;
  }
  const attempt = (): void => {
    if (!tmuxSessionAlive(session)) {
      return;
    }
    let text = '';
    try {
      text = execFileSync(tmuxBinary(), ['capture-pane', '-p', '-t', session], {
        encoding: 'utf8',
        env: terminalEnvironment(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      setTimeout(attempt, 40);
      return;
    }
    if (!shellCanTakeInput(text)) {
      setTimeout(attempt, 40);
      return;
    }
    try {
      execFileSync(tmuxBinary(), ['send-keys', '-l', '-t', session, command], {
        env: terminalEnvironment(),
        stdio: 'ignore',
      });
      execFileSync(tmuxBinary(), ['send-keys', '-t', session, 'Enter'], {
        env: terminalEnvironment(),
        stdio: 'ignore',
      });
    } catch {
      // The session closed before the line was delivered.
    }
  };
  attempt();
}

export function paneCommand(name: string): string {
  try {
    return execFileSync(tmuxBinary(), ['display-message', '-p', '-t', name, '#{pane_current_command}'], {
      encoding: 'utf8',
      env: terminalEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

export type TmuxSessionRecord = {
  name: string;
  branch: string;
};

function listedTmuxSessions(): TmuxSessionRecord[] {
  try {
    const output = execFileSync(tmuxBinary(), ['list-sessions', '-F', '#{session_name}|#{@gm_branch}'], {
      encoding: 'utf8',
      env: terminalEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map(parseListedSession);
  } catch {
    return [];
  }
}

export function listTmuxSessionRecords(): TmuxSessionRecord[] {
  return listedTmuxSessions();
}

export interface TmuxSessionSnapshot extends TmuxSessionRecord {
  command: string;
}

export function listTmuxSessionSnapshots(): TmuxSessionSnapshot[] | null {
  try {
    const output = execFileSync(
      tmuxBinary(),
      ['list-sessions', '-F', '#{session_name}\t#{@gm_branch}\t#{pane_current_command}'],
      {
        encoding: 'utf8',
        env: terminalEnvironment(),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map(parseSessionSnapshot);
  } catch (error) {
    const stderr = typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr) : '';
    if (/no server running|no sessions|failed to connect|error connecting/i.test(stderr)) {
      return [];
    }
    return null;
  }
}

function parseSessionSnapshot(line: string): TmuxSessionSnapshot {
  const nameEnd = line.indexOf('\t');
  if (nameEnd < 0) {
    return { name: line, branch: '', command: '' };
  }
  const branchEnd = line.indexOf('\t', nameEnd + 1);
  if (branchEnd < 0) {
    return { name: line.slice(0, nameEnd), branch: line.slice(nameEnd + 1), command: '' };
  }
  return {
    name: line.slice(0, nameEnd),
    branch: line.slice(nameEnd + 1, branchEnd),
    command: line.slice(branchEnd + 1),
  };
}

function parseListedSession(line: string): TmuxSessionRecord {
  const separator = line.indexOf('|');
  if (separator < 0) {
    return { name: line, branch: '' };
  }
  return { name: line.slice(0, separator), branch: line.slice(separator + 1) };
}

function belongsToBranch(session: TmuxSessionRecord, branch: string, prefixes: SessionPrefixes): boolean {
  if (session.branch.length > 0) {
    return session.branch === branch && session.name.startsWith(prefixes.repository);
  }
  return sessionIndexRecognizedForBranch(session.name, prefixes) !== undefined;
}

function sessionIndexRecognizedForBranch(name: string, prefixes: SessionPrefixes): number | undefined {
  return sessionIndex(prefixes.canonical, name) ?? sessionIndex(prefixes.legacy, name);
}

function sessionIndex(prefix: string, name: string): number | undefined {
  if (!name.startsWith(prefix)) {
    return undefined;
  }
  const suffix = name.slice(prefix.length);
  if (!/^[1-9][0-9]*$/.test(suffix)) {
    return undefined;
  }
  return Number(suffix);
}
