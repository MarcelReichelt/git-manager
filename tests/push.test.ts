import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pushBranch } from '../src/push.js';
import { addRepository } from '../src/registry.js';
import { git, initGitRepo, makeTempDir, removeTemp } from './cli/run.js';

describe('pushBranch', () => {
  const roots: string[] = [];
  const previousRegistryPath = process.env.GIT_MANAGER_REGISTRY_PATH;

  afterEach(() => {
    if (previousRegistryPath === undefined) {
      delete process.env.GIT_MANAGER_REGISTRY_PATH;
    } else {
      process.env.GIT_MANAGER_REGISTRY_PATH = previousRegistryPath;
    }
    for (const root of roots.splice(0)) {
      removeTemp(root);
    }
  });

  it('pushes a local-only branch to the first remote when origin is absent', () => {
    const root = makeTempDir('git-manager-push-upstream-');
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const remotePath = join(root, 'upstream.git');
    initGitRepo(repoPath);
    mkdirSync(remotePath, { recursive: true });
    execFileSync('git', ['init', '--bare', '-b', 'master'], { cwd: remotePath, stdio: 'ignore' });
    git(repoPath, ['remote', 'add', 'upstream', remotePath]);
    git(repoPath, ['branch', 'test']);
    mkdirSync(join(repoPath, '.workspaces'), { recursive: true });
    git(repoPath, ['worktree', 'add', join(repoPath, '.workspaces', 'test'), 'test']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(root, 'registry.db');
    addRepository(repoPath, 'Harbor');

    pushBranch('Harbor', 'test');

    const checkout = join(repoPath, '.workspaces', 'test');
    expect(git(checkout, ['rev-parse', '--abbrev-ref', '@{upstream}'])).toBe('upstream/test');
    expect(git(remotePath, ['rev-parse', '--verify', 'refs/heads/test'])).toMatch(/^[0-9a-f]{40}$/);
  });
});
