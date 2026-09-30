import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTempDir, initRepo, setupTestEnv } from './helpers.js';

const cliPath = join(process.cwd(), 'dist', 'cli.js');

describe('git-manager registered repositories', () => {
  it('add records an existing git repository and list shows its path and display name', () => {
    const env = setupTestEnv(createTempDir());
    const repoPath = join(env.configDir, '..', 'harbor');
    initRepo(repoPath);

    try {
      const help = runCli(['add', '--help'], repoPath);
      expect(help.stdout).toContain('--path');
      expect(help.stdout).toContain('--display-name');

      const added = runCli(['add', '--path', repoPath, '--display-name', 'Harbor'], repoPath);
      expect(added.status).toBe(0);

      const listed = runCli(['list'], repoPath);
      expect(listed.status).toBe(0);
      expect(listed.stdout).toContain('Harbor');
      expect(listed.stdout).toContain(repoPath);
    } finally {
      env.cleanup();
    }
  });

  it('unregister removes the repository from list', () => {
    const env = setupTestEnv(createTempDir());
    const repoPath = join(env.configDir, '..', 'harbor');
    initRepo(repoPath);

    try {
      const help = runCli(['unregister', '--help'], repoPath);
      expect(help.stdout).toContain('--path');

      expect(runCli(['add', '--path', repoPath, '--display-name', 'Harbor'], repoPath).status).toBe(0);
      expect(runCli(['unregister', '--path', repoPath], repoPath).status).toBe(0);

      const listed = runCli(['list'], repoPath);
      expect(listed.status).toBe(0);
      expect(listed.stdout).not.toContain('Harbor');
      expect(listed.stdout).not.toContain(repoPath);
    } finally {
      env.cleanup();
    }
  });

  it('add rejects a path that is not a git repository', () => {
    const env = setupTestEnv(createTempDir());
    const plainPath = join(env.configDir, '..', 'notes');
    mkdirSync(plainPath);

    try {
      const added = runCli(['add', '--path', plainPath, '--display-name', 'Notes'], plainPath);
      expect(added.status).not.toBe(0);

      const listed = runCli(['list'], plainPath);
      expect(listed.stdout).not.toContain('Notes');
      expect(listed.stdout).not.toContain(plainPath);
    } finally {
      env.cleanup();
    }
  });

  it('persists registered repositories in ~/.config/git-manager/registry.db', () => {
    const home = createTempDir();
    const repoPath = join(home, 'harbor');
    initRepo(repoPath);
    const registryPath = join(home, '.config', 'git-manager', 'registry.db');
    const isolated = {
      HOME: home,
      GIT_MANAGER_REGISTRY_PATH: undefined,
      GIT_MANAGER_CONFIG_DIR: undefined,
    };

    try {
      expect(runCli(['add', '--path', repoPath, '--display-name', 'Harbor'], home, isolated).status).toBe(0);
      expect(existsSync(registryPath)).toBe(true);

      const listed = runCli(['list'], home, isolated);
      expect(listed.stdout).toContain('Harbor');
      expect(listed.stdout).toContain(repoPath);
    } finally {
      setupTestEnv(home).cleanup();
    }
  });

  it('GIT_MANAGER_REGISTRY_PATH overrides the registry location', () => {
    const home = createTempDir();
    const repoPath = join(home, 'harbor');
    initRepo(repoPath);
    const overridePath = join(home, 'custom', 'registry.db');
    const defaultPath = join(home, '.config', 'git-manager', 'registry.db');
    const isolated = {
      HOME: home,
      GIT_MANAGER_CONFIG_DIR: undefined,
      GIT_MANAGER_REGISTRY_PATH: overridePath,
    };

    try {
      expect(runCli(['add', '--path', repoPath, '--display-name', 'Harbor'], home, isolated).status).toBe(0);
      expect(existsSync(overridePath)).toBe(true);
      expect(existsSync(defaultPath)).toBe(false);

      const listed = runCli(['list'], home, isolated);
      expect(listed.stdout).toContain('Harbor');
      expect(listed.stdout).toContain(repoPath);

      const elsewhere = runCli(['list'], home, { ...isolated, GIT_MANAGER_REGISTRY_PATH: join(home, 'other.db') });
      expect(elsewhere.stdout).not.toContain('Harbor');
    } finally {
      setupTestEnv(home).cleanup();
    }
  });
});

function runCli(
  args: string[],
  cwd: string,
  overrides: Record<string, string | undefined> = {},
): { status: number | null; stdout: string; stderr: string } {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}
