import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { runtimeEnv } from '../runtime-env.js';

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
  try {
    const output = execFileSync(tmuxBinary(), ['list-sessions', '-F', '#{session_name}'], {
      encoding: 'utf8',
      env: terminalEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

export function branchSessionPrefix(repoPath: string, branch: string): string {
  return `gm_${repositoryHash(repoPath)}_${branchSegment(branch)}_`;
}

function branchSegment(branch: string): string {
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
  return segment;
}

function legacySessionPrefix(repoPath: string, branch: string): string {
  const safeBranch = branch.replace(/[^A-Za-z0-9-]/g, '-');
  return `gm_${repositoryHash(repoPath)}_${safeBranch}_`;
}

function repositoryHash(repoPath: string): string {
  return createHash('sha256').update(resolve(repoPath)).digest('hex').slice(0, 8);
}

export function sessionName(repoPath: string, branch: string, index: number): string {
  return `${branchSessionPrefix(repoPath, branch)}${index}`;
}

export function sessionsForBranch(repoPath: string, branch: string): string[] {
  const canonical = branchSessionPrefix(repoPath, branch);
  const legacy = legacySessionPrefix(repoPath, branch);
  const repositoryPrefix = `gm_${repositoryHash(repoPath)}_`;
  return listSessionsWithBranch()
    .filter((session) => belongsToBranch(session, branch, repositoryPrefix, canonical, legacy))
    .map((session) => session.name)
    .sort(
      (left, right) =>
        (recognizedIndex(left, canonical, legacy) ?? 0) - (recognizedIndex(right, canonical, legacy) ?? 0),
    );
}

export function nextSessionIndex(repoPath: string, branch: string, known: string[]): number {
  const canonical = branchSessionPrefix(repoPath, branch);
  const legacy = legacySessionPrefix(repoPath, branch);
  const names = new Set<string>([...known, ...sessionsForBranch(repoPath, branch)]);
  let highest = 0;
  for (const name of names) {
    const index = recognizedIndex(name, canonical, legacy);
    if (index !== undefined) {
      highest = Math.max(highest, index);
    }
  }
  return highest + 1;
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

type ListedSession = {
  name: string;
  branch: string;
};

function listSessionsWithBranch(): ListedSession[] {
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

function parseListedSession(line: string): ListedSession {
  const separator = line.indexOf('|');
  if (separator < 0) {
    return { name: line, branch: '' };
  }
  return { name: line.slice(0, separator), branch: line.slice(separator + 1) };
}

function belongsToBranch(
  session: ListedSession,
  branch: string,
  repositoryPrefix: string,
  canonical: string,
  legacy: string,
): boolean {
  if (session.branch.length > 0) {
    return session.branch === branch && session.name.startsWith(repositoryPrefix);
  }
  return recognizedIndex(session.name, canonical, legacy) !== undefined;
}

function recognizedIndex(name: string, canonical: string, legacy: string): number | undefined {
  return sessionIndex(canonical, name) ?? sessionIndex(legacy, name);
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
