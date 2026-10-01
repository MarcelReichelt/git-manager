import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initRepo, runCli } from './run-cli.js';

describe('registry and worktrees', () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('lists the registered repository and not the worktree it created', async () => {
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

    const listed = await runCli(['list'], { env });
    expect(listed.stdout).toBe(`Billing\t${repo}\n`);

    const db = new Database(registry, { readonly: true });
    try {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all();
      expect(tables).toEqual([{ name: 'repositories' }]);
      expect(db.prepare('SELECT path, display_name FROM repositories').all()).toEqual([
        { path: repo, display_name: 'Billing' },
      ]);
    } finally {
      db.close();
    }
    expect(readFileSync(registry).includes(checkout)).toBe(false);
  });

  it('leaves a raw git worktree in place without writing it to the registry', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };
    const checkout = join(root, 'extra');

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    const before = readFileSync(registry);

    execSync(`git worktree add -b extra "${checkout}"`, { cwd: repo, stdio: 'ignore' });

    expect(readFileSync(registry).equals(before)).toBe(true);
    expect(execSync('git worktree list --porcelain', { cwd: repo, encoding: 'utf8' })).toContain(
      `worktree ${checkout}`,
    );

    const listed = await runCli(['list'], { env });
    expect(listed.stdout).toBe(`Billing\t${repo}\n`);
  });
});
