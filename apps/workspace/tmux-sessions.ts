import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export const TMUX = '/usr/bin/tmux';

export function tmuxEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TMUX;
  delete env.TMUX_PANE;
  return env;
}

export function listTmuxSessions(): string[] {
  try {
    const output = execFileSync(TMUX, ['list-sessions', '-F', '#{session_name}'], {
      encoding: 'utf8',
      env: tmuxEnvironment(),
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
    .filter((name) => name.startsWith(prefix))
    .sort((left, right) => sessionIndex(prefix, left) - sessionIndex(prefix, right));
}

export function nextSessionIndex(repoPath: string, branch: string, known: string[]): number {
  const prefix = branchSessionPrefix(repoPath, branch);
  const highest = known
    .filter((name) => name.startsWith(prefix))
    .reduce((max, name) => Math.max(max, sessionIndex(prefix, name)), 0);
  return highest + 1;
}

export function createBranchSession(repoPath: string, branch: string, cwd: string, index: number): string {
  const name = sessionName(repoPath, branch, index);
  if (!listTmuxSessions().includes(name)) {
    execFileSync(TMUX, ['new-session', '-d', '-s', name, '-c', cwd], {
      env: tmuxEnvironment(),
      stdio: 'ignore',
    });
  }
  return name;
}

export function killTmuxSession(name: string): void {
  try {
    execFileSync(TMUX, ['kill-session', '-t', name], {
      env: tmuxEnvironment(),
      stdio: 'ignore',
    });
  } catch {
    // The session is already gone.
  }
}

function sessionIndex(prefix: string, name: string): number {
  const index = Number(name.slice(prefix.length));
  return Number.isFinite(index) ? index : 0;
}
