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

export function sessionName(repoPath: string, branch: string, index: number): string {
  const hash = createHash('sha256').update(resolve(repoPath)).digest('hex').slice(0, 8);
  const safeBranch = branch.replace(/[^A-Za-z0-9-]/g, '-');
  return `gm_${hash}_${safeBranch}_${index}`;
}

export function ensureBranchSession(repoPath: string, branch: string, cwd: string): string {
  const name = sessionName(repoPath, branch, 1);
  if (listTmuxSessions().includes(name)) {
    return name;
  }
  execFileSync(TMUX, ['new-session', '-d', '-s', name, '-c', cwd], {
    env: tmuxEnvironment(),
    stdio: 'ignore',
  });
  return name;
}
