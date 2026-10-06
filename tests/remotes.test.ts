import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addRemote, changeRemote, listRemotes, removeRemote } from '../src/remotes.js';

describe('git remotes', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('adds, changes, lists, and removes a remote', () => {
    const repoPath = initRepo(roots);
    addRemote(repoPath, 'origin', 'https://example.test/fetch.git', 'https://example.test/push.git');

    expect(listRemotes(repoPath)).toEqual([
      {
        name: 'origin',
        fetchUrl: 'https://example.test/fetch.git',
        pushUrl: 'https://example.test/push.git',
      },
    ]);

    changeRemote(repoPath, 'origin', 'backup', 'https://example.test/backup.git');
    expect(listRemotes(repoPath)).toEqual([
      {
        name: 'backup',
        fetchUrl: 'https://example.test/backup.git',
        pushUrl: 'https://example.test/backup.git',
      },
    ]);

    removeRemote(repoPath, 'backup');
    expect(listRemotes(repoPath)).toEqual([]);
  });

  it('renames a remote back when set-url fails', () => {
    const repoPath = initRepo(roots);
    addRemote(repoPath, 'origin', 'https://example.test/fetch.git');

    expect(() => changeRemote(repoPath, 'origin', 'renamed', '--not-a-url')).toThrow();
    expect(listRemotes(repoPath).map((remote) => remote.name)).toEqual(['origin']);
    expect(listRemotes(repoPath)[0]?.fetchUrl).toBe('https://example.test/fetch.git');
  });

  it('restores the fetch URL when the push URL change fails', () => {
    const repoPath = initRepo(roots);
    addRemote(repoPath, 'origin', 'https://example.test/fetch.git', 'https://example.test/push.git');

    expect(() =>
      changeRemote(
        repoPath,
        'origin',
        'origin',
        'https://example.test/next.git',
        '--not-a-url',
      ),
    ).toThrow();

    expect(listRemotes(repoPath)).toEqual([
      {
        name: 'origin',
        fetchUrl: 'https://example.test/fetch.git',
        pushUrl: 'https://example.test/push.git',
      },
    ]);
  });
});

function initRepo(roots: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'git-worktree-manager-remotes-'));
  roots.push(root);
  const repoPath = join(root, 'repo');
  execFileSync('git', ['init', '-b', 'master', repoPath], { stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@git-worktree-manager.local'], { cwd: repoPath, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'git-worktree-manager test'], { cwd: repoPath, stdio: 'ignore' });
  writeFileSync(join(repoPath, 'README.md'), '# repo\n');
  execFileSync('git', ['add', '.'], { cwd: repoPath, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoPath, stdio: 'ignore' });
  return repoPath;
}
