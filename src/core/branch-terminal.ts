import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { repositoryWorktreeDirectory } from './repository-worktrees.js';

/**
 * tmux session names for one worktree.
 * `{worktreeKey}` is the first 8 hex characters of the sha256 of that worktree path.
 * `{n}` starts at 1.
 */
export const BRANCH_TERMINAL_SESSION_NAME_PATTERN = 'gm-{worktreeKey}-{n}';

/** Overrides the tmux socket. Tests set a private socket so they do not touch the default server. */
export const GIT_MANAGER_TMUX_SOCKET = 'GIT_MANAGER_TMUX_SOCKET';

/** Socket used when `GIT_MANAGER_TMUX_SOCKET` is unset. Attach with `tmux -L git-manager attach -t <session>`. */
export const DEFAULT_GIT_MANAGER_TMUX_SOCKET_NAME = 'git-manager';

const WORKTREE_KEY_LENGTH = 8;

/** One in-app shell. It is not a tmux session and cannot be attached from outside the app. */
export interface BranchTerminalShell {
  readonly processes: readonly [{ readonly cwd: string }];
  readonly usesTmux: false;
}

export function gitManagerTmuxSocket(): string {
  const configured = process.env[GIT_MANAGER_TMUX_SOCKET];
  if (typeof configured === 'string' && configured.length > 0) {
    return configured;
  }
  return DEFAULT_GIT_MANAGER_TMUX_SOCKET_NAME;
}

export function branchTerminalSessionName(worktreePath: string, n: number): string {
  return BRANCH_TERMINAL_SESSION_NAME_PATTERN.replace('{worktreeKey}', worktreeTerminalKey(worktreePath)).replace(
    '{n}',
    String(n),
  );
}

export function liveBranchTerminalCounts(worktreePaths: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const path of worktreePaths) {
    counts.set(path, 0);
  }
  if (process.platform === 'win32' || worktreePaths.length === 0) {
    return counts;
  }
  const sessions = listTmuxSessions();
  for (const path of worktreePaths) {
    const prefix = sessionPrefix(path);
    let count = 0;
    for (const name of sessions) {
      if (sessionBelongsToPrefix(name, prefix)) {
        count += 1;
      }
    }
    counts.set(path, count);
  }
  return counts;
}

export function listBranchTerminalSessions(repositoryPath: string, branch: string): readonly string[] {
  if (process.platform === 'win32') {
    return [];
  }
  const directory = repositoryWorktreeDirectory(repositoryPath, branch);
  if (!directory) {
    return [];
  }
  return listLiveBranchTerminals(directory);
}

export function createBranchTerminalSession(repositoryPath: string, branch: string): string {
  return openBranchTerminal(requireWorktree(repositoryPath, branch));
}

export function killBranchTerminalSession(repositoryPath: string, branch: string, session: string): void {
  closeBranchTerminal(requireWorktree(repositoryPath, branch), session);
}

export function splitBranchTerminalSession(repositoryPath: string, branch: string, session: string): void {
  splitBranchTerminal(requireWorktree(repositoryPath, branch), session);
}

export function branchTerminalShell(repositoryPath: string, branch: string): BranchTerminalShell | null {
  const directory = repositoryWorktreeDirectory(repositoryPath, branch);
  if (!directory) {
    return null;
  }
  return {
    processes: [{ cwd: directory }],
    usesTmux: false,
  };
}

function openBranchTerminal(worktreePath: string): string {
  assertTmuxPlatform();
  const prefix = sessionPrefix(worktreePath);
  const next = nextSessionNumber(listLiveBranchTerminals(worktreePath), prefix);
  const name = branchTerminalSessionName(worktreePath, next);
  tmux(['new-session', '-d', '-s', name, '-c', worktreePath]);
  return name;
}

function closeBranchTerminal(worktreePath: string, session: string): void {
  assertTmuxPlatform();
  assertOwned(worktreePath, session);
  tmux(['kill-session', '-t', session]);
}

function splitBranchTerminal(worktreePath: string, session: string): void {
  assertTmuxPlatform();
  assertOwned(worktreePath, session);
  tmux(['split-window', '-t', session, '-c', worktreePath]);
}

function listLiveBranchTerminals(worktreePath: string): readonly string[] {
  const prefix = sessionPrefix(worktreePath);
  return listTmuxSessions()
    .filter((name) => sessionBelongsToPrefix(name, prefix))
    .sort((left, right) => sessionNumber(left, prefix) - sessionNumber(right, prefix));
}

function requireWorktree(repositoryPath: string, branch: string): string {
  const directory = repositoryWorktreeDirectory(repositoryPath, branch);
  if (!directory) {
    throw new Error('This branch has no worktree');
  }
  return directory;
}

function assertTmuxPlatform(): void {
  if (process.platform === 'win32') {
    throw new Error('Windows terminals stay inside the app');
  }
}

function assertOwned(worktreePath: string, session: string): void {
  if (!sessionBelongsToPrefix(session, sessionPrefix(worktreePath))) {
    throw new Error(`Terminal session is not for this branch: ${session}`);
  }
}

function sessionPrefix(worktreePath: string): string {
  return BRANCH_TERMINAL_SESSION_NAME_PATTERN.replace('{worktreeKey}', worktreeTerminalKey(worktreePath)).replace(
    '{n}',
    '',
  );
}

function sessionBelongsToPrefix(name: string, prefix: string): boolean {
  return name.startsWith(prefix) && /^[1-9]\d*$/.test(name.slice(prefix.length));
}

function sessionNumber(name: string, prefix: string): number {
  return Number.parseInt(name.slice(prefix.length), 10);
}

function nextSessionNumber(sessions: readonly string[], prefix: string): number {
  let max = 0;
  for (const name of sessions) {
    const n = sessionNumber(name, prefix);
    if (n > max) {
      max = n;
    }
  }
  return max + 1;
}

function worktreeTerminalKey(worktreePath: string): string {
  return createHash('sha256').update(worktreePath).digest('hex').slice(0, WORKTREE_KEY_LENGTH);
}

function listTmuxSessions(): readonly string[] {
  try {
    const output = execFileSync(
      'tmux',
      ['-L', gitManagerTmuxSocket(), 'list-sessions', '-F', '#{session_name}'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    return output.split('\n').filter((name) => name.length > 0);
  } catch {
    return [];
  }
}

function tmux(args: readonly string[]): string {
  return execFileSync('tmux', ['-L', gitManagerTmuxSocket(), ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
