import { execSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTempDir, initRepo, setupTestEnv } from './helpers.js';

const cliPath = join(process.cwd(), 'dist', 'cli.js');

describe('git-manager worktree remove', () => {
  it('removes that branch worktree and leaves the branch', () => {
    const env = setupTestEnv(createTempDir());
    const repoPath = join(env.configDir, '..', 'harbor');
    const checkout = join(env.configDir, '..', 'notes-checkout');
    initRepo(repoPath, { initialBranch: 'master' });
    execSync('git checkout -b notes', { cwd: repoPath, stdio: 'ignore' });
    execSync('git checkout master', { cwd: repoPath, stdio: 'ignore' });
    execSync(`git worktree add "${checkout}" notes`, { cwd: repoPath, stdio: 'ignore' });

    try {
      const help = runCli(['worktree', 'remove', '--help'], repoPath);
      expect(help.stdout).toContain('--path <path>');
      expect(help.stdout).toContain('--branch <name>');

      const removed = runCli(['worktree', 'remove', '--path', repoPath, '--branch', 'notes'], repoPath);
      expect(removed.status).toBe(0);
      const listed = execSync('git worktree list', { cwd: repoPath, encoding: 'utf8' });
      expect(listed).not.toContain(checkout);
      expect(listed).toContain(repoPath);
      expect(execSync('git branch --list notes', { cwd: repoPath, encoding: 'utf8' })).toContain('notes');
    } finally {
      env.cleanup();
    }
  });
});

function runCli(
  args: string[],
  cwd: string,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    env: process.env,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}
