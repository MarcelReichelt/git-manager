import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createLayoutForRepository,
  readAppSettings,
  resetAppColors,
  resolveAppSettingsPath,
  saveContentColor,
  saveDefaultLayout,
  saveSidebarColor,
} from '../src/app-settings.js';
import { addRepository, listRepositories } from '../src/registry.js';

describe('app settings', () => {
  const roots: string[] = [];
  const previousRegistryPath = process.env.GIT_MANAGER_REGISTRY_PATH;

  afterEach(() => {
    if (previousRegistryPath === undefined) {
      delete process.env.GIT_MANAGER_REGISTRY_PATH;
    } else {
      process.env.GIT_MANAGER_REGISTRY_PATH = previousRegistryPath;
    }
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses Workspaces when the app settings file is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: join(root, 'app-settings.json') };

    expect(readAppSettings(env)).toEqual({
      defaultLayout: 'workspaces',
      sidebarColor: '#1a3c2b',
      contentColor: '#f7f7f5',
    });
  });

  it('uses Workspaces when the app settings file is empty', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const settingsPath = join(root, 'app-settings.json');
    writeFileSync(settingsPath, '');
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: settingsPath };

    expect(readAppSettings(env)).toEqual({
      defaultLayout: 'workspaces',
      sidebarColor: '#1a3c2b',
      contentColor: '#f7f7f5',
    });
  });

  it('stores app settings at ~/.config/git-manager/app-settings.json unless the path is overridden', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const settingsPath = join(root, 'custom', 'app-settings.json');

    expect(resolveAppSettingsPath({})).toBe(
      join(homedir(), '.config', 'git-manager', 'app-settings.json'),
    );
    expect(resolveAppSettingsPath({ GIT_MANAGER_APP_SETTINGS_PATH: settingsPath })).toBe(settingsPath);
  });

  it('reads a stored sidebar color and keeps the original content color when that key is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const settingsPath = join(root, 'app-settings.json');
    writeFileSync(settingsPath, '{"defaultLayout":"sibling","sidebarColor":"#112233"}\n');
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: settingsPath };

    expect(readAppSettings(env)).toEqual({
      defaultLayout: 'sibling',
      sidebarColor: '#112233',
      contentColor: '#f7f7f5',
    });
  });

  it('saves the default layout immediately', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: join(root, 'nested', 'app-settings.json') };

    saveDefaultLayout('sibling', env);

    expect(readAppSettings(env)).toEqual({
      defaultLayout: 'sibling',
      sidebarColor: '#1a3c2b',
      contentColor: '#f7f7f5',
    });
  });

  it('keeps unknown app settings when the default layout is saved', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const settingsPath = join(root, 'app-settings.json');
    writeFileSync(settingsPath, '{"theme":"mint","defaultLayout":"workspaces"}\n');
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: settingsPath };

    saveDefaultLayout('sibling', env);

    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual({
      theme: 'mint',
      defaultLayout: 'sibling',
    });
    expect(readAppSettings(env)).toEqual({
      defaultLayout: 'sibling',
      sidebarColor: '#1a3c2b',
      contentColor: '#f7f7f5',
    });
  });

  it('saves the sidebar color without dropping the layout or other settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const settingsPath = join(root, 'app-settings.json');
    writeFileSync(
      settingsPath,
      '{"theme":"mint","defaultLayout":"sibling","ideCommand":"cursor","contentColor":"#abcdef"}\n',
    );
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: settingsPath };

    saveSidebarColor('#112233', env);

    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual({
      theme: 'mint',
      defaultLayout: 'sibling',
      ideCommand: 'cursor',
      contentColor: '#abcdef',
      sidebarColor: '#112233',
    });
    expect(readAppSettings(env).sidebarColor).toBe('#112233');
  });

  it('saves the content color without dropping the layout or other settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const settingsPath = join(root, 'app-settings.json');
    writeFileSync(
      settingsPath,
      '{"theme":"mint","defaultLayout":"workspaces","ideCommand":"cursor","sidebarColor":"#112233"}\n',
    );
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: settingsPath };

    saveContentColor('#abcdef', env);

    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual({
      theme: 'mint',
      defaultLayout: 'workspaces',
      ideCommand: 'cursor',
      sidebarColor: '#112233',
      contentColor: '#abcdef',
    });
    expect(readAppSettings(env).contentColor).toBe('#abcdef');
  });

  it('restores the original colors and leaves the layout and other settings in place', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const settingsPath = join(root, 'app-settings.json');
    writeFileSync(
      settingsPath,
      '{"defaultLayout":"sibling","ideCommand":"cursor","sidebarColor":"#112233","contentColor":"#abcdef"}\n',
    );
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: settingsPath };

    resetAppColors(env);

    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual({
      defaultLayout: 'sibling',
      ideCommand: 'cursor',
      sidebarColor: '#1a3c2b',
      contentColor: '#f7f7f5',
    });
    expect(readAppSettings(env)).toEqual({
      defaultLayout: 'sibling',
      sidebarColor: '#1a3c2b',
      contentColor: '#f7f7f5',
    });
  });

  it('leaves the registered repository list unchanged when the default layout is saved', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const repoPath = join(root, 'harbor');
    const registryPath = join(root, 'registry.db');
    mkdirSync(repoPath);
    execFileSync('git', ['init', '-b', 'master'], { cwd: repoPath, stdio: 'ignore' });
    process.env.GIT_MANAGER_REGISTRY_PATH = registryPath;
    addRepository(repoPath, 'Harbor');
    const before = listRepositories();

    saveDefaultLayout('sibling', {
      GIT_MANAGER_APP_SETTINGS_PATH: join(root, 'app-settings.json'),
    });

    expect(listRepositories()).toEqual(before);
    expect(before).toEqual([{ path: resolve(repoPath), displayName: 'Harbor' }]);
    const listed = new Database(registryPath, { readonly: true });
    const columns = listed.prepare('PRAGMA table_info(repositories)').all() as Array<{ name: string }>;
    listed.close();
    expect(columns.map((column) => column.name)).toEqual(['path', 'display_name']);
  });

  it('uses the app default Workspaces when the repository has no layout mode', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const repoPath = join(root, 'harbor');
    mkdirSync(repoPath);

    expect(
      createLayoutForRepository(repoPath, {
        GIT_MANAGER_APP_SETTINGS_PATH: join(root, 'missing-app-settings.json'),
      }),
    ).toEqual({
      label: 'Workspaces',
      source: 'app',
      supported: true,
    });
  });

  it('uses the app default Sibling when the repository has no layout mode', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const repoPath = join(root, 'harbor');
    mkdirSync(repoPath);
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: join(root, 'app-settings.json') };
    saveDefaultLayout('sibling', env);

    expect(createLayoutForRepository(repoPath, env)).toEqual({
      label: 'Sibling',
      source: 'app',
      supported: true,
    });
  });

  it('keeps a repository Workspaces layout when the app default is Sibling', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const repoPath = join(root, 'harbor');
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(join(repoPath, '.git-manager', 'config.toml'), '[layout]\nmode = "workspaces"\n');
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: join(root, 'app-settings.json') };
    saveDefaultLayout('sibling', env);

    expect(createLayoutForRepository(repoPath, env)).toEqual({
      label: 'Workspaces',
      source: 'repository',
      supported: true,
    });
  });

  it('keeps a repository Sibling layout when the app default is Workspaces', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const repoPath = join(root, 'harbor');
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(join(repoPath, '.git-manager', 'config.toml'), '[layout]\nmode = "sibling"\n');
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: join(root, 'missing-app-settings.json') };

    expect(createLayoutForRepository(repoPath, env)).toEqual({
      label: 'Sibling',
      source: 'repository',
      supported: true,
    });
  });

  it('reports an unsupported repository layout mode without using the app default', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const repoPath = join(root, 'harbor');
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(join(repoPath, '.git-manager', 'config.toml'), '[layout]\nmode = "custom"\n');
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: join(root, 'app-settings.json') };
    saveDefaultLayout('sibling', env);

    expect(createLayoutForRepository(repoPath, env)).toEqual({
      label: 'custom',
      source: 'repository',
      supported: false,
    });
  });
});
