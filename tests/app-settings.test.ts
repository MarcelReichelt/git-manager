import TOML from '@iarna/toml';
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
  saveIdeCommand,
  saveRepositoryLayoutMode,
  saveSidebarColor,
  saveTerminalBackground,
  saveTerminalFont,
  saveTerminalForeground,
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
      terminalBackground: '#1e1e1e',
      terminalForeground: '#d4d4d4',
      terminalFont: 'UbuntuMono Nerd Font Mono',
      ideCommand: '',
    });
  });

  it('uses the original terminal colors and UbuntuMono Nerd Font Mono when those settings are not text', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const settingsPath = join(root, 'app-settings.json');
    writeFileSync(
      settingsPath,
      '{"terminalBackground":1,"terminalForeground":false,"terminalFont":["UbuntuMono Nerd Font Mono"]}\n',
    );
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: settingsPath };

    expect(readAppSettings(env).terminalBackground).toBe('#1e1e1e');
    expect(readAppSettings(env).terminalForeground).toBe('#d4d4d4');
    expect(readAppSettings(env).terminalFont).toBe('UbuntuMono Nerd Font Mono');
  });

  it('uses the original terminal colors and UbuntuMono Nerd Font Mono when app settings are missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: join(root, 'app-settings.json') };

    expect(readAppSettings(env).terminalBackground).toBe('#1e1e1e');
    expect(readAppSettings(env).terminalForeground).toBe('#d4d4d4');
    expect(readAppSettings(env).terminalFont).toBe('UbuntuMono Nerd Font Mono');
  });

  it('starts the IDE command empty when that key is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const settingsPath = join(root, 'app-settings.json');
    writeFileSync(settingsPath, '{"defaultLayout":"sibling","sidebarColor":"#112233"}\n');
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: settingsPath };

    expect(readAppSettings(env).ideCommand).toBe('');
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
      terminalBackground: '#1e1e1e',
      terminalForeground: '#d4d4d4',
      terminalFont: 'UbuntuMono Nerd Font Mono',
      ideCommand: '',
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
      terminalBackground: '#1e1e1e',
      terminalForeground: '#d4d4d4',
      terminalFont: 'UbuntuMono Nerd Font Mono',
      ideCommand: '',
    });
  });

  it('reads the process environment when no env argument is passed', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const settingsPath = join(root, 'app-settings.json');
    const previous = process.env.GIT_MANAGER_APP_SETTINGS_PATH;
    process.env.GIT_MANAGER_APP_SETTINGS_PATH = settingsPath;
    try {
      saveDefaultLayout('sibling');
      expect(readAppSettings().defaultLayout).toBe('sibling');
    } finally {
      if (previous === undefined) {
        delete process.env.GIT_MANAGER_APP_SETTINGS_PATH;
      } else {
        process.env.GIT_MANAGER_APP_SETTINGS_PATH = previous;
      }
    }
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
      terminalBackground: '#1e1e1e',
      terminalForeground: '#d4d4d4',
      terminalFont: 'UbuntuMono Nerd Font Mono',
      ideCommand: '',
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
      terminalBackground: '#1e1e1e',
      terminalForeground: '#d4d4d4',
      terminalFont: 'UbuntuMono Nerd Font Mono',
      ideCommand: '',
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

  it('saves the IDE command without dropping the layout, colors, or other settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const settingsPath = join(root, 'app-settings.json');
    writeFileSync(
      settingsPath,
      '{"theme":"mint","defaultLayout":"sibling","sidebarColor":"#112233","contentColor":"#abcdef"}\n',
    );
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: settingsPath };

    saveIdeCommand('code -n {folder}', env);

    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual({
      theme: 'mint',
      defaultLayout: 'sibling',
      sidebarColor: '#112233',
      contentColor: '#abcdef',
      ideCommand: 'code -n {folder}',
    });
    expect(readAppSettings(env).ideCommand).toBe('code -n {folder}');
  });

  it('saves the terminal background without dropping the layout or other settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const settingsPath = join(root, 'app-settings.json');
    writeFileSync(
      settingsPath,
      '{"theme":"mint","defaultLayout":"sibling","ideCommand":"cursor","sidebarColor":"#112233","contentColor":"#abcdef","terminalForeground":"#ffffff","terminalFont":"JetBrains Mono"}\n',
    );
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: settingsPath };

    saveTerminalBackground('#065f46', env);

    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual({
      theme: 'mint',
      defaultLayout: 'sibling',
      ideCommand: 'cursor',
      sidebarColor: '#112233',
      contentColor: '#abcdef',
      terminalForeground: '#ffffff',
      terminalFont: 'JetBrains Mono',
      terminalBackground: '#065f46',
    });
    expect(readAppSettings(env).terminalBackground).toBe('#065f46');
    expect(readAppSettings(env).terminalFont).toBe('JetBrains Mono');
    expect(readAppSettings(env).terminalForeground).toBe('#ffffff');
  });

  it('saves the terminal foreground without dropping the layout or other settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const settingsPath = join(root, 'app-settings.json');
    writeFileSync(
      settingsPath,
      '{"theme":"mint","defaultLayout":"workspaces","ideCommand":"cursor","sidebarColor":"#112233","contentColor":"#abcdef","terminalBackground":"#065f46","terminalFont":"JetBrains Mono"}\n',
    );
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: settingsPath };

    saveTerminalForeground('#ffffff', env);

    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual({
      theme: 'mint',
      defaultLayout: 'workspaces',
      ideCommand: 'cursor',
      sidebarColor: '#112233',
      contentColor: '#abcdef',
      terminalBackground: '#065f46',
      terminalFont: 'JetBrains Mono',
      terminalForeground: '#ffffff',
    });
    expect(readAppSettings(env).terminalForeground).toBe('#ffffff');
    expect(readAppSettings(env).terminalBackground).toBe('#065f46');
  });

  it('saves the terminal font family without dropping the layout, colors, or other settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const settingsPath = join(root, 'app-settings.json');
    writeFileSync(
      settingsPath,
      '{"theme":"mint","defaultLayout":"sibling","ideCommand":"cursor","sidebarColor":"#112233","contentColor":"#abcdef","terminalBackground":"#065f46","terminalForeground":"#ffffff"}\n',
    );
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: settingsPath };

    saveTerminalFont('JetBrains Mono', env);

    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual({
      theme: 'mint',
      defaultLayout: 'sibling',
      ideCommand: 'cursor',
      sidebarColor: '#112233',
      contentColor: '#abcdef',
      terminalBackground: '#065f46',
      terminalForeground: '#ffffff',
      terminalFont: 'JetBrains Mono',
    });
    expect(readAppSettings(env).terminalFont).toBe('JetBrains Mono');
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
      terminalBackground: '#1e1e1e',
      terminalForeground: '#d4d4d4',
    });
    expect(readAppSettings(env)).toEqual({
      defaultLayout: 'sibling',
      sidebarColor: '#1a3c2b',
      contentColor: '#f7f7f5',
      terminalBackground: '#1e1e1e',
      terminalForeground: '#d4d4d4',
      terminalFont: 'UbuntuMono Nerd Font Mono',
      ideCommand: 'cursor',
    });
  });

  it('restores the terminal background and foreground and leaves the font and layout in place', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const settingsPath = join(root, 'app-settings.json');
    writeFileSync(
      settingsPath,
      '{"theme":"mint","defaultLayout":"sibling","ideCommand":"cursor","sidebarColor":"#112233","contentColor":"#abcdef","terminalBackground":"#065f46","terminalForeground":"#ffffff","terminalFont":"JetBrains Mono"}\n',
    );
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: settingsPath };

    resetAppColors(env);

    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual({
      theme: 'mint',
      defaultLayout: 'sibling',
      ideCommand: 'cursor',
      sidebarColor: '#1a3c2b',
      contentColor: '#f7f7f5',
      terminalBackground: '#1e1e1e',
      terminalForeground: '#d4d4d4',
      terminalFont: 'JetBrains Mono',
    });
    expect(readAppSettings(env)).toEqual({
      defaultLayout: 'sibling',
      sidebarColor: '#1a3c2b',
      contentColor: '#f7f7f5',
      terminalBackground: '#1e1e1e',
      terminalForeground: '#d4d4d4',
      terminalFont: 'JetBrains Mono',
      ideCommand: 'cursor',
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

  it('reports a non-string repository layout mode as set by the repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const repoPath = join(root, 'harbor');
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(join(repoPath, '.git-manager', 'config.toml'), '[layout]\nmode = 1\n');
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: join(root, 'app-settings.json') };
    saveDefaultLayout('sibling', env);

    expect(createLayoutForRepository(repoPath, env)).toEqual({
      label: '1',
      source: 'repository',
      supported: false,
    });
  });

  it('saves Sibling onto a repository that has no layout config', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const repoPath = join(root, 'harbor');
    mkdirSync(repoPath);
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: join(root, 'missing-app-settings.json') };

    saveRepositoryLayoutMode(repoPath, 'sibling');

    expect(createLayoutForRepository(repoPath, env)).toEqual({
      label: 'Sibling',
      source: 'repository',
      supported: true,
    });
  });

  it('saves Workspaces without dropping copy files, hooks, or other layout keys', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const repoPath = join(root, 'harbor');
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(
      join(repoPath, '.git-manager', 'config.toml'),
      [
        '[layout]',
        'workspaces_dir = ".workspaces"',
        'mode = "sibling"',
        '',
        '[copy]',
        'files = [".env.local"]',
        '',
        '[hooks]',
        'modules = ["./plugins/mark.ts"]',
        '',
        '[hooks.pre_worktree_create]',
        'commands = ["node hooks/mark.mjs"]',
        '',
        '[hooks.post_worktree_create]',
        'commands = ["yarn"]',
        '',
        '[editor]',
        'command = "vim"',
        '',
      ].join('\n'),
    );

    saveRepositoryLayoutMode(repoPath, 'workspaces');

    const parsed = TOML.parse(readFileSync(join(repoPath, '.git-manager', 'config.toml'), 'utf8'));
    expect(parsed).toEqual({
      layout: { workspaces_dir: '.workspaces', mode: 'workspaces' },
      copy: { files: ['.env.local'] },
      hooks: {
        modules: ['./plugins/mark.ts'],
        pre_worktree_create: { commands: ['node hooks/mark.mjs'] },
        post_worktree_create: { commands: ['yarn'] },
      },
      editor: { command: 'vim' },
    });
    expect(createLayoutForRepository(repoPath)).toEqual({
      label: 'Workspaces',
      source: 'repository',
      supported: true,
    });
  });

  it('replaces an unsupported or non-text repository layout mode', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-app-settings-'));
    roots.push(root);
    const customPath = join(root, 'custom');
    const numericPath = join(root, 'numeric');
    mkdirSync(join(customPath, '.git-manager'), { recursive: true });
    mkdirSync(join(numericPath, '.git-manager'), { recursive: true });
    writeFileSync(join(customPath, '.git-manager', 'config.toml'), '[layout]\nmode = "custom"\n');
    writeFileSync(join(numericPath, '.git-manager', 'config.toml'), '[layout]\nmode = 1\n');
    const env = { GIT_MANAGER_APP_SETTINGS_PATH: join(root, 'app-settings.json') };
    saveDefaultLayout('sibling', env);

    saveRepositoryLayoutMode(customPath, 'workspaces');
    saveRepositoryLayoutMode(numericPath, 'sibling');

    expect(createLayoutForRepository(customPath, env)).toEqual({
      label: 'Workspaces',
      source: 'repository',
      supported: true,
    });
    expect(createLayoutForRepository(numericPath, env)).toEqual({
      label: 'Sibling',
      source: 'repository',
      supported: true,
    });
  });
});
