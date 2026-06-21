import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { createE2eEnv, runCli, runGit, pushExternalCommit, type E2eEnv } from './helpers.js';
import { readGiteaState, type GiteaState } from './state.js';

describe('CLI end-to-end against a real Gitea server', () => {
  let gitea: GiteaState;
  let e2e: E2eEnv;
  let repoDir: string;

  beforeAll(() => {
    gitea = readGiteaState();
    e2e = createE2eEnv();
    repoDir = join(e2e.cloneRoot, 'demo');
  });

  afterAll(() => {
    e2e?.cleanup();
  });

  it('clones a remote repo and registers it', async () => {
    await runCli(['clone', gitea.remoteUrl, '--path', repoDir, '--layout', 'workspaces'], {
      cwd: e2e.cloneRoot,
      env: e2e.env,
    });

    expect(existsSync(join(repoDir, 'README.md'))).toBe(true);

    const { stdout } = await runCli(['repo', 'current'], { cwd: repoDir, env: e2e.env });
    expect(stdout).toContain('demo');
  });

  it('creates a worktree, commits, and pushes a new branch upstream', async () => {
    await runCli(['worktree', 'create', 'feature', '--new'], { cwd: repoDir, env: e2e.env });

    const { stdout: wtPath } = await runCli(['worktree', 'path', 'feature'], {
      cwd: repoDir,
      env: e2e.env,
    });
    const worktreePath = wtPath.trim();
    expect(existsSync(worktreePath)).toBe(true);

    await runGit(['config', 'user.name', 'e2e tester'], { cwd: worktreePath });
    await runGit(['config', 'user.email', 'e2e@example.com'], { cwd: worktreePath });
    writeFileSync(join(worktreePath, 'feature.txt'), 'feature work\n');
    await runGit(['add', '.'], { cwd: worktreePath });
    await runGit(['commit', '-m', 'feature work'], { cwd: worktreePath });

    await runCli(['worktree', 'push', 'feature', '--set-upstream'], {
      cwd: repoDir,
      env: e2e.env,
    });

    const { stdout } = await runGit(['ls-remote', '--heads', gitea.remoteUrl], { cwd: repoDir });
    expect(stdout).toContain('refs/heads/feature');
  });

  it('pulls a commit pushed to the remote by someone else', async () => {
    await pushExternalCommit(gitea.remoteUrl, e2e.base, 'remote.txt');

    expect(existsSync(join(repoDir, 'remote.txt'))).toBe(false);

    await runCli(['worktree', 'pull', 'main'], { cwd: repoDir, env: e2e.env });

    expect(existsSync(join(repoDir, 'remote.txt'))).toBe(true);
  });
});
