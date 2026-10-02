import { execFileSync } from 'node:child_process';

export interface GitRemote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

function git(repoPath: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const failed = error as { stderr?: string | Buffer };
    const stderr = typeof failed.stderr === 'string' ? failed.stderr.trim() : '';
    throw new Error(stderr || 'git failed');
  }
}

export function listRemotes(repoPath: string): GitRemote[] {
  const names = git(repoPath, ['remote'])
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  return names.map((name) => ({
    name,
    fetchUrl: git(repoPath, ['remote', 'get-url', name]).trim(),
    pushUrl: git(repoPath, ['remote', 'get-url', '--push', name]).trim(),
  }));
}

export function addRemote(repoPath: string, name: string, fetchUrl: string, pushUrl?: string): void {
  git(repoPath, ['remote', 'add', name, fetchUrl]);
  if (!pushUrl || pushUrl === fetchUrl) {
    return;
  }
  try {
    git(repoPath, ['remote', 'set-url', '--push', name, pushUrl]);
  } catch (error) {
    try {
      git(repoPath, ['remote', 'remove', name]);
    } catch {
      // The remote was added; removing it failed too.
    }
    throw error;
  }
}

export function changeRemote(
  repoPath: string,
  currentName: string,
  nextName: string,
  fetchUrl: string,
  pushUrl?: string,
): void {
  const renamed = nextName !== currentName;
  if (renamed) {
    git(repoPath, ['remote', 'rename', currentName, nextName]);
  }
  try {
    git(repoPath, ['remote', 'set-url', nextName, fetchUrl]);
    const push = pushUrl && pushUrl !== '' ? pushUrl : fetchUrl;
    git(repoPath, ['remote', 'set-url', '--push', nextName, push]);
  } catch (error) {
    if (renamed) {
      try {
        git(repoPath, ['remote', 'rename', nextName, currentName]);
      } catch {
        // Keep the original failure from set-url.
      }
    }
    throw error;
  }
}

export function removeRemote(repoPath: string, name: string): void {
  git(repoPath, ['remote', 'remove', name]);
}
