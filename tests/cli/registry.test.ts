import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initRepo, runCli } from './run-cli.js';

describe('registered repositories', () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('adds a repository and lists its path and display name', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);

    const added = await runCli(['add', '--path', repo, '--name', 'Billing'], {
      env: { GIT_MANAGER_REGISTRY_PATH: registry },
    });
    expect(added.exitCode).toBe(0);

    const listed = await runCli(['list'], {
      env: { GIT_MANAGER_REGISTRY_PATH: registry },
    });
    expect(listed.exitCode).toBe(0);
    expect(listed.stdout).toBe(`Billing\t${repo}\n`);
  });

  it('unregisters a repository so list no longer shows it', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);
    const env = { GIT_MANAGER_REGISTRY_PATH: registry };

    await runCli(['add', '--path', repo, '--name', 'Billing'], { env });
    const removed = await runCli(['unregister', '--path', repo], { env });
    expect(removed.exitCode).toBe(0);

    const listed = await runCli(['list'], { env });
    expect(listed.exitCode).toBe(0);
    expect(listed.stdout).toBe('');
  });

  it('uses GIT_MANAGER_REGISTRY_PATH and otherwise ~/.config/git-manager/registry.db', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const home = join(root, 'home');
    mkdirSync(home);
    const billing = join(root, 'billing');
    const other = join(root, 'other');
    initRepo(billing);
    initRepo(other);
    const override = join(root, 'custom', 'registry.db');

    const addedDefault = await runCli(['add', '--path', billing, '--name', 'Billing'], {
      env: { HOME: home },
    });
    expect(addedDefault.exitCode).toBe(0);
    expect(existsSync(join(home, '.config', 'git-manager', 'registry.db'))).toBe(true);

    const listedDefault = await runCli(['list'], { env: { HOME: home } });
    expect(listedDefault.stdout).toBe(`Billing\t${billing}\n`);

    const addedOverride = await runCli(['add', '--path', other, '--name', 'Other'], {
      env: { HOME: home, GIT_MANAGER_REGISTRY_PATH: override },
    });
    expect(addedOverride.exitCode).toBe(0);
    expect(existsSync(override)).toBe(true);

    const listedOverride = await runCli(['list'], {
      env: { HOME: home, GIT_MANAGER_REGISTRY_PATH: override },
    });
    expect(listedOverride.stdout).toBe(`Other\t${other}\n`);

    const stillDefault = await runCli(['list'], { env: { HOME: home } });
    expect(stillDefault.stdout).toBe(`Billing\t${billing}\n`);
  });

  it('records only a path and a display name in the registry file', async () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-cli-'));
    const repo = join(root, 'billing');
    const registry = join(root, 'registry.db');
    initRepo(repo);

    await runCli(['add', '--path', repo, '--name', 'Billing'], {
      env: { GIT_MANAGER_REGISTRY_PATH: registry },
    });

    const db = new Database(registry, { readonly: true });
    try {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all();
      expect(tables).toEqual([{ name: 'repositories' }]);

      const columns = db.prepare('PRAGMA table_info(repositories)').all() as { name: string }[];
      expect(columns.map((column) => column.name)).toEqual(['path', 'display_name']);

      expect(db.prepare('SELECT path, display_name FROM repositories').get()).toEqual({
        path: repo,
        display_name: 'Billing',
      });
    } finally {
      db.close();
    }
  });
});
