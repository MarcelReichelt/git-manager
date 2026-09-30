import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTempDir, initRepo, setupTestEnv } from './helpers.js';

const cliPath = join(process.cwd(), 'dist', 'cli.js');

describe('git-manager worktree create', () => {
  it('creates a worktree under .workspaces when that repository layout is workspaces', () => {
    const env = setupTestEnv(createTempDir());
    const repoPath = join(env.configDir, '..', 'main');
    initRepo(repoPath, { initialBranch: 'main' });
    writeFileSync(join(repoPath, '.git-manager.toml'), 'layout = "workspaces"\n');
    execSync('git checkout -b topic', { cwd: repoPath, stdio: 'ignore' });
    execSync('git checkout main', { cwd: repoPath, stdio: 'ignore' });

    try {
      const help = runCli(['worktree', 'create', '--help'], repoPath);
      expect(help.stdout).toContain('--path');
      expect(help.stdout).toContain('--branch');

      const created = runCli(['worktree', 'create', '--path', repoPath, '--branch', 'topic'], repoPath);
      expect(created.status).toBe(0);
      expect(execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: join(repoPath, '.workspaces', 'topic'),
        encoding: 'utf8',
      }).trim()).toBe('topic');
    } finally {
      env.cleanup();
    }
  });

  it('creates a worktree in the folder next to the repository when that layout is sibling', () => {
    const env = setupTestEnv(createTempDir());
    const repoPath = join(env.configDir, '..', 'harbor');
    initRepo(repoPath, { initialBranch: 'main' });
    writeFileSync(join(repoPath, '.git-manager.toml'), 'layout = "sibling"\n');
    execSync('git checkout -b topic', { cwd: repoPath, stdio: 'ignore' });
    execSync('git checkout main', { cwd: repoPath, stdio: 'ignore' });

    try {
      const created = runCli(['worktree', 'create', '--path', repoPath, '--branch', 'topic'], repoPath);
      expect(created.status).toBe(0);
      expect(execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: join(env.configDir, '..', 'topic'),
        encoding: 'utf8',
      }).trim()).toBe('topic');
      expect(existsSync(join(repoPath, '.workspaces', 'topic'))).toBe(false);
    } finally {
      env.cleanup();
    }
  });

  it('sanitizes path separators and other illegal directory characters without renaming the git branch', () => {
    const env = setupTestEnv(createTempDir());
    const repoPath = join(env.configDir, '..', 'harbor');
    initRepo(repoPath, { initialBranch: 'main' });
    writeFileSync(join(repoPath, '.git-manager.toml'), 'layout = "workspaces"\n');
    execSync('git checkout -b feature/foo', { cwd: repoPath, stdio: 'ignore' });
    execSync('git checkout -b \'quote"name\'', { cwd: repoPath, stdio: 'ignore' });
    execSync('git checkout main', { cwd: repoPath, stdio: 'ignore' });

    try {
      const slash = runCli(['worktree', 'create', '--path', repoPath, '--branch', 'feature/foo'], repoPath);
      expect(slash.status).toBe(0);
      expect(execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: join(repoPath, '.workspaces', 'feature-foo'),
        encoding: 'utf8',
      }).trim()).toBe('feature/foo');
      expect(existsSync(join(repoPath, '.workspaces', 'feature', 'foo'))).toBe(false);

      const quote = runCli(['worktree', 'create', '--path', repoPath, '--branch', 'quote"name'], repoPath);
      expect(quote.status).toBe(0);
      expect(execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: join(repoPath, '.workspaces', 'quote-name'),
        encoding: 'utf8',
      }).trim()).toBe('quote"name');
    } finally {
      env.cleanup();
    }
  });

  it('stops when the sanitized worktree folder already exists', () => {
    const env = setupTestEnv(createTempDir());
    const repoPath = join(env.configDir, '..', 'harbor');
    initRepo(repoPath, { initialBranch: 'main' });
    writeFileSync(join(repoPath, '.git-manager.toml'), 'layout = "workspaces"\n');
    execSync('git checkout -b feature/foo', { cwd: repoPath, stdio: 'ignore' });
    execSync('git checkout main', { cwd: repoPath, stdio: 'ignore' });
    mkdirSync(join(repoPath, '.workspaces', 'feature-foo'), { recursive: true });

    try {
      const created = runCli(['worktree', 'create', '--path', repoPath, '--branch', 'feature/foo'], repoPath);
      expect(created.status).not.toBe(0);
      expect(created.stderr).toContain('already exists');
      const listed = execSync('git worktree list --porcelain', { cwd: repoPath, encoding: 'utf8' });
      expect(listed).not.toContain('feature-foo');
      expect(existsSync(join(repoPath, '.workspaces', 'feature-foo', '.git'))).toBe(false);
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
