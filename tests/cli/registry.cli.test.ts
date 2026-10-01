import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  gitManagerEnv,
  initGitRepo,
  makeTempDir,
  removeTemp,
  runGitManager,
} from './run.js';

describe('git-manager registry', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      removeTemp(root);
    }
  });

  it('adds, lists, and unregisters a git repository at GIT_MANAGER_REGISTRY_PATH', () => {
    const root = makeTempDir('git-manager-registry-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    initGitRepo(repoPath);
    const env = gitManagerEnv(registryPath);

    const added = runGitManager(
      ['add', '--path', repoPath, '--name', 'Harbor'],
      env,
    );
    expect(added.status).toBe(0);

    const listed = runGitManager(['list'], env);
    expect(listed.status).toBe(0);
    expect(listed.stdout).toBe(`Harbor\t${resolve(repoPath)}\tworkspaces\n`);

    const removed = runGitManager(['unregister', '--path', repoPath], env);
    expect(removed.status).toBe(0);

    const after = runGitManager(['list'], env);
    expect(after.status).toBe(0);
    expect(after.stdout).toBe('');
  });
});
