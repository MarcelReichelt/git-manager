import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initRepo, runCli } from './run-cli.js';

describe('worktree remove', () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('removes the checkout so git no longer lists it', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);
    execSync('git branch feature', { cwd: repo, stdio: 'ignore' });
    mkdirSync(join(repo, '.git-manager'), { recursive: true });
    writeFileSync(join(repo, '.git-manager', 'config.toml'), 'layout = "workspaces"\n');
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };
    const checkout = join(repo, '.workspaces', 'feature');

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    const created = await runCli(['worktree', 'create', 'feature', '--repo', repo], { env });
    expect(created.exitCode).toBe(0);
    expect(existsSync(checkout)).toBe(true);

    const removed = await runCli(['worktree', 'remove', 'feature', '--repo', repo], { env });
    expect(removed.exitCode).toBe(0);
    expect(existsSync(checkout)).toBe(false);

    const listed = execSync('git worktree list --porcelain', { cwd: repo, encoding: 'utf8' });
    expect(listed).not.toContain(checkout);
    expect(listed).toContain(`worktree ${repo}`);
  });
});
