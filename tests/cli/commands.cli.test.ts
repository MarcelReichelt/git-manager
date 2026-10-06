import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gitWorktreeManagerEnv, makeTempDir, removeTemp, runGitWorktreeManager } from './run.js';

describe('git-worktree-manager commands', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      removeTemp(root);
    }
  });

  it('rejects commands that are not part of v2', () => {
    const root = makeTempDir('git-worktree-manager-commands-');
    roots.push(root);
    const env = gitWorktreeManagerEnv(join(root, 'registry.db'));
    const removed = ['clone', 'push', 'pull', 'doctor', 'setup', 'ui', 'repo'];

    for (const command of removed) {
      const result = runGitWorktreeManager([command, 'example'], env);
      expect(result.status, command).toBe(1);
      expect(result.stderr, command).toContain('unknown command');
    }
  });
});
