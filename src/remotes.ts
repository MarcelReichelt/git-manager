import { execFileSync } from 'node:child_process';

export interface RepositoryRemote {
  name: string;
  url: string;
}

export function addRemote(repoPath: string, name: string, url: string): void {
  gitText(repoPath, ['remote', 'add', name, url]);
}

export function setRemoteUrl(repoPath: string, name: string, url: string): void {
  gitText(repoPath, ['remote', 'set-url', name, url]);
}

export function removeRemote(repoPath: string, name: string): void {
  gitText(repoPath, ['remote', 'remove', name]);
}

export function listRemotes(repoPath: string): RepositoryRemote[] {
  const output = gitText(repoPath, ['remote', '-v']);
  const remotes: RepositoryRemote[] = [];
  for (const line of output.split('\n')) {
    if (line === '') {
      continue;
    }
    const tab = line.indexOf('\t');
    if (tab === -1) {
      continue;
    }
    const name = line.slice(0, tab);
    const rest = line.slice(tab + 1);
    const marker = rest.lastIndexOf(' (');
    if (marker === -1 || !rest.endsWith(')')) {
      continue;
    }
    if (rest.slice(marker + 2, -1) !== 'fetch') {
      continue;
    }
    remotes.push({ name, url: rest.slice(0, marker) });
  }
  return remotes;
}

function gitText(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const failed = error as { stderr?: string | Buffer };
    const stderr = typeof failed.stderr === 'string' ? failed.stderr.trim() : '';
    throw new Error(stderr || 'git failed');
  }
}
