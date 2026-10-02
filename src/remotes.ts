import { execFileSync } from 'node:child_process';

export interface GitRemote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface RepositoryRemote {
  name: string;
  url: string;
}

export function listRemotes(repoPath: string): GitRemote[] {
  const names = gitText(repoPath, ['remote'])
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  return names.map((name) => ({
    name,
    fetchUrl: gitText(repoPath, ['remote', 'get-url', name]).trim(),
    pushUrl: gitText(repoPath, ['remote', 'get-url', '--push', name]).trim(),
  }));
}

export function repositoryRemotes(repoPath: string): RepositoryRemote[] {
  return listRemotes(repoPath).map((remote) => ({ name: remote.name, url: remote.fetchUrl }));
}

export function addRemote(repoPath: string, name: string, fetchUrl: string, pushUrl?: string): void {
  gitText(repoPath, ['remote', 'add', name, fetchUrl]);
  if (!pushUrl || pushUrl === fetchUrl) {
    return;
  }
  try {
    gitText(repoPath, ['remote', 'set-url', '--push', name, pushUrl]);
  } catch (error) {
    try {
      gitText(repoPath, ['remote', 'remove', name]);
    } catch {
      // The remote was added; removing it failed too.
    }
    throw error;
  }
}

export function setRemoteUrl(repoPath: string, name: string, url: string): void {
  gitText(repoPath, ['remote', 'set-url', name, url]);
}

export function changeRemote(
  repoPath: string,
  currentName: string,
  nextName: string,
  fetchUrl: string,
  pushUrl?: string,
): void {
  const before = listRemotes(repoPath).find((remote) => remote.name === currentName);
  if (!before) {
    throw new Error(`Remote not found: ${currentName}`);
  }
  const renamed = nextName !== currentName;
  if (renamed) {
    gitText(repoPath, ['remote', 'rename', currentName, nextName]);
  }
  try {
    gitText(repoPath, ['remote', 'set-url', nextName, fetchUrl]);
    const push = pushUrl && pushUrl !== '' ? pushUrl : fetchUrl;
    gitText(repoPath, ['remote', 'set-url', '--push', nextName, push]);
  } catch (error) {
    const activeName = renamed ? nextName : currentName;
    try {
      gitText(repoPath, ['remote', 'set-url', activeName, before.fetchUrl]);
      gitText(repoPath, ['remote', 'set-url', '--push', activeName, before.pushUrl]);
      if (renamed) {
        gitText(repoPath, ['remote', 'rename', nextName, currentName]);
      }
    } catch {
      // Keep the original failure from set-url.
    }
    throw error;
  }
}

export function removeRemote(repoPath: string, name: string): void {
  gitText(repoPath, ['remote', 'remove', name]);
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
