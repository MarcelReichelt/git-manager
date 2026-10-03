import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';

export function tmuxOnPath(pathValue = process.env.PATH): string | null {
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
  const env = { ...process.env };
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

const appSessionName = /^gm_[0-9a-f]{8}_[A-Za-z0-9-]+_[1-9][0-9]*$/;

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
  const hash = createHash('sha256').update(resolve(repoPath)).digest('hex').slice(0, 8);
  const safeBranch = branch.replace(/[^A-Za-z0-9-]/g, '-');
  return `gm_${hash}_${safeBranch}_`;
}

export function sessionName(repoPath: string, branch: string, index: number): string {
  return `${branchSessionPrefix(repoPath, branch)}${index}`;
}

export function sessionsForBranch(repoPath: string, branch: string): string[] {
  const prefix = branchSessionPrefix(repoPath, branch);
  return listTmuxSessions()
    .filter((name) => sessionIndex(prefix, name) !== undefined)
    .sort((left, right) => (sessionIndex(prefix, left) ?? 0) - (sessionIndex(prefix, right) ?? 0));
}

export function nextSessionIndex(repoPath: string, branch: string, known: string[]): number {
  const prefix = branchSessionPrefix(repoPath, branch);
  const highest = known
    .filter((name) => sessionIndex(prefix, name) !== undefined)
    .reduce((max, name) => Math.max(max, sessionIndex(prefix, name) ?? 0), 0);
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
    execFileSync(tmuxBinary(), ['new-session', '-d', '-s', name, '-c', cwd], {
      env: terminalEnvironment(),
      stdio: 'ignore',
    });
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
