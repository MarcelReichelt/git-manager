import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { readAppSettings } from '../src/app-settings';
import { addRepository } from '../src/registry';
import { createRepository as createRepo, renderWorkspace, waitForTerminal as waitFor } from './desktop-terminal-harness';
import {
  killTmuxSession,
  listTmuxSessions,
  sessionDirectory,
  sessionsForBranch,
  tmuxBinary,
} from '../src/desktop/tmux-sessions';
import { WorkspaceComponent } from '../src/desktop/workspace.component';

const emptyGitConfig = join(tmpdir(), 'git-manager-terminal-mode-gitconfig');
writeFileSync(emptyGitConfig, '');
process.env.GIT_CONFIG_GLOBAL = emptyGitConfig;
process.env.GIT_CONFIG_SYSTEM = emptyGitConfig;
process.env.GIT_TERMINAL_PROMPT = '0';

function worktreePath(repo: string): string {
  return join(repo, '.workspaces', 'feature');
}

function writeSettings(root: string, settings: Record<string, string>): void {
  const settingsPath = join(root, 'app-settings.json');
  writeFileSync(settingsPath, `${JSON.stringify(settings)}\n`);
  process.env.GIT_MANAGER_APP_SETTINGS_PATH = settingsPath;
}

function copyLoginShell(root: string, name = 'login-shell'): string {
  const path = join(root, name);
  copyFileSync('/bin/bash', path);
  chmodSync(path, 0o755);
  return path;
}

function clickBranch(fixture: ComponentFixture<WorkspaceComponent>, name: string): void {
  const row = fixture.nativeElement.querySelector(`[data-testid="branch-row"][data-branch="${name}"]`);
  if (!(row instanceof HTMLElement)) {
    throw new Error(`Branch ${name} is not shown`);
  }
  row.click();
  fixture.detectChanges();
}

function tabNames(fixture: ComponentFixture<WorkspaceComponent>): string[] {
  const tabs = fixture.nativeElement.querySelectorAll('[data-testid="terminal-tab"]');
  return Array.from(tabs, (tab) => {
    const label = (tab as HTMLElement).querySelector('[data-testid="terminal-tab-label"]');
    const source = label instanceof HTMLElement ? label : (tab as HTMLElement);
    return (source.textContent ?? '').replace(/\s+/g, ' ').trim();
  });
}

function paneTitles(fixture: ComponentFixture<WorkspaceComponent>): string[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll('[data-testid="terminal-pane"]'),
    (pane) => (pane as HTMLElement).getAttribute('title') ?? '',
  );
}

function paneText(fixture: ComponentFixture<WorkspaceComponent>): string {
  const panes = fixture.nativeElement.querySelectorAll('[data-testid="terminal-pane"]');
  return Array.from(panes, (pane) => (pane as HTMLElement).textContent ?? '').join('\n');
}

function openSettings(fixture: ComponentFixture<WorkspaceComponent>): HTMLElement {
  const button = fixture.nativeElement.querySelector('[data-testid="app-settings"]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('App settings is not shown');
  }
  button.click();
  fixture.detectChanges();
  const dialog = fixture.nativeElement.querySelector('[data-testid="app-settings-dialog"]');
  if (!(dialog instanceof HTMLElement)) {
    throw new Error('App settings is not open');
  }
  return dialog;
}

function closeSettings(fixture: ComponentFixture<WorkspaceComponent>): void {
  const button = fixture.nativeElement.querySelector('[data-testid="close-app-settings"]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Close is not shown');
  }
  button.click();
  fixture.detectChanges();
}

function modeInput(dialog: ParentNode, mode: 'none' | 'terminal' | 'tmux'): HTMLInputElement {
  const input = dialog.querySelector(`[data-testid="terminal-mode-${mode}"]`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`${mode} is not shown`);
  }
  return input;
}

function clickMode(fixture: ComponentFixture<WorkspaceComponent>, mode: 'none' | 'terminal' | 'tmux'): void {
  const dialog = fixture.nativeElement.querySelector('[data-testid="app-settings-dialog"]');
  if (!(dialog instanceof HTMLElement)) {
    throw new Error('App settings is not open');
  }
  modeInput(dialog, mode).click();
  fixture.detectChanges();
}

function setShellCommand(fixture: ComponentFixture<WorkspaceComponent>, command: string): void {
  const dialog = fixture.nativeElement.querySelector('[data-testid="app-settings-dialog"]');
  const edit = dialog?.querySelector('[data-testid="edit-shell-command"]');
  if (!(edit instanceof HTMLButtonElement)) {
    throw new Error('Edit is not shown');
  }
  edit.click();
  fixture.detectChanges();
  const field = dialog.querySelector('[data-testid="terminal-shell-command"]');
  if (!(field instanceof HTMLInputElement)) {
    throw new Error('Shell command is not shown');
  }
  field.value = command;
  field.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function modeDialog(fixture: ComponentFixture<WorkspaceComponent>): HTMLElement | null {
  const dialog = fixture.nativeElement.querySelector('[data-testid="terminal-mode-dialog"]');
  return dialog instanceof HTMLElement ? dialog : null;
}

function clickModeAction(fixture: ComponentFixture<WorkspaceComponent>, action: 'keep' | 'kill' | 'cancel'): void {
  const button = modeDialog(fixture)?.querySelector(`[data-testid="terminal-mode-${action}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${action} is not shown`);
  }
  button.click();
  fixture.detectChanges();
}

function clickControl(fixture: ComponentFixture<WorkspaceComponent>, label: string): void {
  const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
  const button = buttons.find((candidate) => {
    if (candidate.closest('[data-testid="terminal-tab"], [data-testid="terminal-pane-header"]') !== null) {
      return false;
    }
    const text = candidate.textContent?.trim() ?? '';
    return text === label || candidate.getAttribute('aria-label') === label || candidate.getAttribute('title') === label;
  });
  if (!button) {
    throw new Error(`${label} is not shown`);
  }
  button.click();
  fixture.detectChanges();
}

function clickCollapse(fixture: ComponentFixture<WorkspaceComponent>): void {
  const button = fixture.nativeElement.querySelector('[data-testid="terminal-collapse"]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('The terminal chevron is not shown');
  }
  button.click();
  fixture.detectChanges();
}

function collapseLabel(fixture: ComponentFixture<WorkspaceComponent>): string | null {
  return fixture.nativeElement.querySelector('[data-testid="terminal-collapse"]')?.getAttribute('aria-label') ?? null;
}

function workspaceError(fixture: ComponentFixture<WorkspaceComponent>): string | null {
  const error = fixture.nativeElement.querySelector('[data-testid="workspace-error"]');
  if (!error) {
    return null;
  }
  const text = error.textContent?.trim() ?? '';
  return text.length === 0 ? null : text;
}

function chooseRepository(fixture: ComponentFixture<WorkspaceComponent>, name: string): void {
  const overlay = fixture.nativeElement.querySelector('[data-testid="switching-overlay"]');
  const scope = overlay instanceof HTMLElement ? overlay : fixture.nativeElement;
  const button = scope.querySelector(`[data-testid="repository"][data-name="${name}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${name} is not shown`);
  }
  button.click();
  fixture.detectChanges();
}

function switchRepository(fixture: ComponentFixture<WorkspaceComponent>, name: string): void {
  const button = fixture.nativeElement.querySelector('[data-testid="switch-repository"]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Switch repository is not shown');
  }
  button.click();
  fixture.detectChanges();
  chooseRepository(fixture, name);
}

function keyEvent(type: string, key: string, keyCode: number, charCode = 0): KeyboardEvent {
  const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'keyCode', { get: () => keyCode });
  Object.defineProperty(event, 'which', { get: () => charCode || keyCode });
  Object.defineProperty(event, 'charCode', { get: () => charCode });
  return event;
}

function submitCommand(root: HTMLElement, command: string): void {
  const textarea = root.querySelector('.terminal-pane textarea');
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error('The terminal pane is not accepting input');
  }
  textarea.focus();
  for (const char of command) {
    const keyCode = char === ' ' ? 32 : char === '-' ? 189 : char.toUpperCase().charCodeAt(0);
    textarea.dispatchEvent(keyEvent('keydown', char, keyCode));
    if (char === ' ') {
      textarea.dispatchEvent(keyEvent('keypress', char, 32, 32));
    }
  }
  textarea.dispatchEvent(keyEvent('keydown', 'Enter', 13));
}

function shellArguments(cwd: string): string[][] {
  const found: string[][] = [];
  const wanted = realpathSync(cwd);
  let entries: string[] = [];
  try {
    entries = readdirSync('/proc');
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) {
      continue;
    }
    try {
      if (realpathSync(readlinkSync(join('/proc', entry, 'cwd'))) !== wanted) {
        continue;
      }
      const parts = readFileSync(join('/proc', entry, 'cmdline'))
        .toString()
        .split('\0')
        .filter((part) => part.length > 0);
      if (parts.length > 0) {
        found.push(parts);
      }
    } catch {
      // The process exited while it was being read.
    }
  }
  return found;
}

function hasSession(session: string): boolean {
  try {
    execFileSync(tmuxBinary(), ['has-session', '-t', session], {
      stdio: 'ignore',
      env: tmuxEnv(),
    });
    return true;
  } catch {
    return false;
  }
}

function tmuxEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TMUX;
  delete env.TMUX_PANE;
  return env;
}

describe('terminal mode', () => {
  const roots: string[] = [];
  let fixture: ComponentFixture<WorkspaceComponent> | undefined;
  let previousShell: string | undefined;
  let previousHome: string | undefined;
  let previousRegistry: string | undefined;
  let previousSettings: string | undefined;

  beforeEach(() => {
    previousShell = process.env.SHELL;
    previousHome = process.env.HOME;
    previousRegistry = process.env.GIT_MANAGER_REGISTRY_PATH;
    previousSettings = process.env.GIT_MANAGER_APP_SETTINGS_PATH;
    const settingsRoot = mkdtempSync(join(tmpdir(), 'git-manager-mode-settings-'));
    roots.push(settingsRoot);
    process.env.GIT_MANAGER_APP_SETTINGS_PATH = join(settingsRoot, 'app-settings.json');
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    for (const name of listTmuxSessions()) {
      const directory = sessionDirectory(name);
      if (roots.some((root) => directory.startsWith(root)) || name === 'outside-kept') {
        killTmuxSession(name);
      }
    }
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
    if (previousShell === undefined) {
      delete process.env.SHELL;
    } else {
      process.env.SHELL = previousShell;
    }
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousRegistry === undefined) {
      delete process.env.GIT_MANAGER_REGISTRY_PATH;
    } else {
      process.env.GIT_MANAGER_REGISTRY_PATH = previousRegistry;
    }
    if (previousSettings === undefined) {
      delete process.env.GIT_MANAGER_APP_SETTINGS_PATH;
    } else {
      process.env.GIT_MANAGER_APP_SETTINGS_PATH = previousSettings;
    }
  });

  it('offers None, Terminal, and Tmux, and Terminal is the default when tmux is installed', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    fixture = await renderWorkspace(repo.repo);

    const dialog = openSettings(fixture);
    expect(modeInput(dialog, 'none').checked).toBe(false);
    expect(modeInput(dialog, 'terminal').checked).toBe(true);
    expect(modeInput(dialog, 'tmux').disabled).toBe(false);
    expect(modeInput(dialog, 'tmux').getAttribute('title')).toBeNull();
    expect(dialog.textContent).toContain('None');
    expect(dialog.textContent).toContain('Terminal');
    expect(dialog.textContent).toContain('Tmux');
    expect(modeInput(dialog, 'terminal').closest('.terminal-option')?.querySelector('[data-testid="edit-shell-command"]')?.textContent?.trim()).toBe(
      'Edit',
    );
    closeSettings(fixture);

    clickBranch(fixture, 'feature');
    await waitFor(() => paneTitles(fixture!).length === 1);

    expect(paneTitles(fixture)).toEqual(['in-app terminal']);
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([]);
    expect(readAppSettings().terminalMode).toBe('terminal');
  });

  it('edits the shell command from the Terminal option and stores a program path', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    const shell = copyLoginShell(repo.root);
    fixture = await renderWorkspace(repo.repo);

    const dialog = openSettings(fixture);
    expect(dialog.querySelector('[data-testid="terminal-shell-command"]')).toBeNull();
    expect(modeInput(dialog, 'none').closest('label')?.querySelector('[data-testid="edit-shell-command"]')).toBeNull();
    expect(modeInput(dialog, 'tmux').closest('label')?.querySelector('[data-testid="edit-shell-command"]')).toBeNull();
    setShellCommand(fixture, shell);

    expect(readAppSettings().shellCommand).toBe(shell);
    closeSettings(fixture);
    clickBranch(fixture, 'feature');
    await waitFor(() => tabNames(fixture!).some((name) => name.includes('login-shell')));

    expect(tabNames(fixture)).toEqual(['1 login-shell']);
    expect(paneTitles(fixture)).toEqual(['in-app terminal']);
  });

  it('stores a shell path with a space and reports a path that cannot start', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    const shell = copyLoginShell(repo.root, 'my shell');
    fixture = await renderWorkspace(repo.repo);
    openSettings(fixture);

    setShellCommand(fixture, '/bin/bash -l');

    expect(readAppSettings().shellCommand).toBe('/bin/bash -l');
    expect(workspaceError(fixture)).toBeNull();
    closeSettings(fixture);
    clickBranch(fixture, 'feature');
    await waitFor(() => workspaceError(fixture!)?.includes('Could not start /bin/bash -l') === true);
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();

    openSettings(fixture);
    setShellCommand(fixture, shell);
    closeSettings(fixture);
    clickBranch(fixture, 'feature');
    await waitFor(() => tabNames(fixture!).some((name) => name.includes('my shell')));
    expect(workspaceError(fixture)).toBeNull();
    expect(tabNames(fixture)).toEqual(['1 my shell']);
  });

  it('starts an interactive shell so its config loads', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    const home = join(repo.root, 'home');
    mkdirSync(home);
    writeFileSync(join(home, '.bashrc'), 'echo CONFIG-LOADED\n');
    process.env.HOME = home;
    fixture = await renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    await waitFor(() => paneText(fixture!).includes('CONFIG-LOADED'));

    const argv = shellArguments(worktreePath(repo.repo)).filter((args) => args[0] === '/bin/bash');
    expect(argv.length).toBeGreaterThan(0);
    expect(argv.some((args) => args.includes('--noprofile') || args.includes('--norc'))).toBe(false);
    expect(paneTitles(fixture)).toEqual(['in-app terminal']);
  });

  it('starts the login shell when the shell command is blank', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    process.env.SHELL = copyLoginShell(repo.root);
    fixture = await renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    await waitFor(() => tabNames(fixture!).includes('1 login-shell'));

    expect(paneTitles(fixture)).toEqual(['in-app terminal']);
    expect(workspaceError(fixture)).toBeNull();
  });

  it('starts bash when the login shell cannot be started', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    process.env.SHELL = join(repo.root, 'missing-login-shell');
    fixture = await renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    await waitFor(() => tabNames(fixture!).includes('1 bash'));

    expect(workspaceError(fixture)).toBeNull();
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([]);
  });

  it('shows the workspace error when the shell path cannot start', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    const missing = join(repo.root, 'missing-shell');
    fixture = await renderWorkspace(repo.repo);
    openSettings(fixture);
    setShellCommand(fixture, missing);
    closeSettings(fixture);

    clickBranch(fixture, 'feature');
    await waitFor(() => workspaceError(fixture!) !== null);

    expect(workspaceError(fixture)).toContain('missing-shell');
    expect(paneTitles(fixture)).toEqual([]);
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([]);
  });

  it('leaves the current terminal running when the shell command changes', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    const shell = copyLoginShell(repo.root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    await waitFor(() => tabNames(fixture!).includes('1 bash'));

    openSettings(fixture);
    setShellCommand(fixture, shell);
    closeSettings(fixture);

    expect(tabNames(fixture)).toEqual(['1 bash']);
    clickControl(fixture, 'New');
    await waitFor(() => tabNames(fixture!).some((name) => name.includes('login-shell')));

    expect(tabNames(fixture)[0]).toBe('1 bash');
    expect(tabNames(fixture)[1]).toBe('2 login-shell');
    expect(paneTitles(fixture)).toEqual(['in-app terminal']);
  });

  it('creates in-app terminals from New and Split in Terminal mode', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    await waitFor(() => paneTitles(fixture!).length === 1);

    clickControl(fixture, 'New');
    await waitFor(() => tabNames(fixture!).length === 2);
    clickControl(fixture, 'Split');
    await waitFor(() => paneTitles(fixture!).length === 2);

    expect(paneTitles(fixture)).toEqual(['in-app terminal', 'in-app terminal']);
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([]);
  });

  it('creates tmux sessions from New and Split in Tmux mode and ignores the shell command', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    writeSettings(repo.root, {
      terminalMode: 'tmux',
      shellCommand: join(repo.root, 'missing-shell'),
    });
    fixture = await renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 1);
    expect(workspaceError(fixture)).toBeNull();
    expect(paneTitles(fixture)).toEqual(['tmux session']);

    clickControl(fixture, 'New');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 2);
    clickControl(fixture, 'Split');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 3);

    expect(workspaceError(fixture)).toBeNull();
    expect(paneTitles(fixture).every((title) => title === 'tmux session')).toBe(true);
  });

  it('creates a tmux session when the platform is Windows and tmux is installed', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    writeSettings(repo.root, { terminalMode: 'tmux' });
    fixture = await renderWorkspace(repo.repo, { platform: 'win32' });

    const dialog = openSettings(fixture);
    expect(modeInput(dialog, 'tmux').disabled).toBe(false);
    closeSettings(fixture);
    clickBranch(fixture, 'feature');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 1);

    expect(paneTitles(fixture)).toEqual(['tmux session']);
  });

  it('disables Tmux and explains that tmux is not installed', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    fixture = await renderWorkspace(repo.repo, { tmuxInstalled: false });

    const dialog = openSettings(fixture);
    const tmux = modeInput(dialog, 'tmux');
    expect(tmux.disabled).toBe(true);
    expect(tmux.getAttribute('title')).toBe('tmux is not installed');
    expect(tmux.closest('label')?.getAttribute('title')).toBe('tmux is not installed');

    tmux.click();
    fixture.detectChanges();

    expect(modeDialog(fixture)).toBeNull();
    expect(modeInput(dialog, 'terminal').checked).toBe(true);
    expect(readAppSettings().terminalMode).toBe('terminal');
  });

  it('behaves as Terminal mode when Tmux is saved and tmux is missing', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    writeSettings(repo.root, { terminalMode: 'tmux' });
    fixture = await renderWorkspace(repo.repo, { tmuxInstalled: false });

    const dialog = openSettings(fixture);
    expect(modeInput(dialog, 'tmux').checked).toBe(true);
    expect(modeInput(dialog, 'tmux').disabled).toBe(true);
    closeSettings(fixture);
    clickBranch(fixture, 'feature');
    await waitFor(() => paneTitles(fixture!).length === 1);

    expect(paneTitles(fixture)).toEqual(['in-app terminal']);
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([]);
    expect(readAppSettings().terminalMode).toBe('tmux');
  });

  it('shows tmux sessions for the open repository while Terminal is selected', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    writeSettings(repo.root, { terminalMode: 'tmux' });
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 1);
    const session = sessionsForBranch(repo.repo, 'feature')[0] ?? '';
    fixture.destroy();
    fixture = undefined;

    writeSettings(repo.root, { terminalMode: 'terminal' });
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    await waitFor(() => paneTitles(fixture!).length === 1);

    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([session]);
    expect(paneTitles(fixture)).toEqual(['tmux session']);
  });

  it('keeps a running terminal on the strip and splits in the mode being entered', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    await waitFor(() => tabNames(fixture!).includes('1 bash'));
    openSettings(fixture);
    clickMode(fixture, 'tmux');

    const dialog = modeDialog(fixture);
    expect(dialog?.querySelector('[data-testid="terminal-mode-keep"]')?.textContent?.trim()).toBe('Keep');
    expect(dialog?.querySelector('[data-testid="terminal-mode-kill"]')?.textContent?.trim()).toBe('Kill');
    expect(dialog?.querySelector('[data-testid="terminal-mode-cancel"]')?.textContent?.trim()).toBe('Cancel');
    clickModeAction(fixture, 'keep');

    expect(modeDialog(fixture)).toBeNull();
    expect(readAppSettings().terminalMode).toBe('tmux');
    expect(tabNames(fixture)).toEqual(['1 bash']);
    expect(paneTitles(fixture)).toEqual(['in-app terminal']);
    closeSettings(fixture);
    clickControl(fixture, 'Split');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 1);

    expect(paneTitles(fixture)).toEqual(['in-app terminal', 'tmux session']);
    expect(tabNames(fixture)).toHaveLength(1);
  });

  it('removes the terminal section and starts nothing in None mode', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    writeSettings(repo.root, { terminalMode: 'none' });
    fixture = await renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="changes"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-row"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-collapse"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-new"]')).toBeNull();
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([]);
  });

  it('changes mode with no prompt when the mode being left has no running terminal', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    writeSettings(repo.root, { terminalMode: 'none' });
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    openSettings(fixture);
    clickMode(fixture, 'terminal');

    expect(modeDialog(fixture)).toBeNull();
    expect(readAppSettings().terminalMode).toBe('terminal');
    expect(collapseLabel(fixture)).toBe('Expand terminal');
    closeSettings(fixture);
    clickCollapse(fixture);
    await waitFor(() => paneTitles(fixture!).length === 1);

    expect(paneTitles(fixture)).toEqual(['in-app terminal']);
    clickControl(fixture, 'Kill');
    await waitFor(() => fixture!.nativeElement.querySelector('[data-testid="terminal-pane"]') === null);
    openSettings(fixture);
    clickMode(fixture, 'tmux');

    expect(modeDialog(fixture)).toBeNull();
    expect(readAppSettings().terminalMode).toBe('tmux');
  });

  it('leaves the mode and the terminals unchanged when the change is cancelled', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    await waitFor(() => tabNames(fixture!).includes('1 bash'));
    openSettings(fixture);
    clickMode(fixture, 'tmux');
    clickModeAction(fixture, 'cancel');

    expect(modeDialog(fixture)).toBeNull();
    expect(readAppSettings().terminalMode).toBe('terminal');
    expect(modeInput(fixture.nativeElement.querySelector('[data-testid="app-settings-dialog"]')!, 'terminal').checked).toBe(
      true,
    );
    expect(tabNames(fixture)).toEqual(['1 bash']);
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([]);
  });

  it('kills in-app terminals when leaving Terminal and leaves tmux sessions running', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    writeSettings(repo.root, { terminalMode: 'tmux' });
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 1);
    const session = sessionsForBranch(repo.repo, 'feature')[0] ?? '';
    openSettings(fixture);
    clickMode(fixture, 'terminal');
    clickModeAction(fixture, 'keep');
    closeSettings(fixture);
    clickControl(fixture, 'New');
    await waitFor(() => tabNames(fixture!).length === 2 && paneText(fixture!).includes(' $'));
    submitCommand(fixture.nativeElement, 'echo inappmarker');
    await waitFor(() => paneText(fixture!).includes('inappmarker'));
    openSettings(fixture);
    clickMode(fixture, 'none');
    clickModeAction(fixture, 'kill');

    expect(fixture.nativeElement.querySelector('[data-testid="terminal-row"]')).toBeNull();
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([session]);
    clickMode(fixture, 'terminal');

    expect(modeDialog(fixture)).toBeNull();
    await waitFor(() => paneTitles(fixture!).length === 1);
    expect(paneTitles(fixture)).toEqual(['tmux session']);
    expect(paneText(fixture)).not.toContain('inappmarker');
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([session]);
  });

  it('kills the app tmux sessions for a repository that is not open and leaves other sessions', async () => {
    const harbor = createRepo('git-manager-mode-harbor-');
    const atlas = createRepo('git-manager-mode-atlas-');
    roots.push(harbor.root, atlas.root);
    writeSettings(harbor.root, { terminalMode: 'tmux' });
    process.env.GIT_MANAGER_REGISTRY_PATH = join(harbor.root, 'registry.db');
    addRepository(harbor.repo, 'Harbor');
    addRepository(atlas.repo, 'Atlas');
    execFileSync(tmuxBinary(), ['new-session', '-d', '-s', 'outside-kept', '-c', harbor.root], {
      stdio: 'ignore',
      env: tmuxEnv(),
    });
    fixture = await renderWorkspace(null, { liveRegistry: true });
    chooseRepository(fixture, 'Harbor');
    clickBranch(fixture, 'feature');
    await waitFor(() => sessionsForBranch(harbor.repo, 'feature').length === 1);
    const harborSession = sessionsForBranch(harbor.repo, 'feature')[0] ?? '';
    switchRepository(fixture, 'Atlas');
    clickBranch(fixture, 'feature');
    await waitFor(() => sessionsForBranch(atlas.repo, 'feature').length === 1);
    submitCommand(fixture.nativeElement, 'pwd');
    await waitFor(() => paneText(fixture!).includes(worktreePath(atlas.repo)));

    expect(sessionsForBranch(harbor.repo, 'feature')).toEqual([harborSession]);
    expect(paneText(fixture)).not.toContain(worktreePath(harbor.repo));
    openSettings(fixture);
    clickMode(fixture, 'terminal');
    clickModeAction(fixture, 'kill');

    expect(sessionsForBranch(harbor.repo, 'feature')).toEqual([]);
    expect(sessionsForBranch(atlas.repo, 'feature')).toEqual([]);
    expect(hasSession('outside-kept')).toBe(true);
    expect(collapseLabel(fixture)).toBe('Expand terminal');
  });

  it('hides tmux sessions in None and shows them again on the same worktree', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    writeSettings(repo.root, { terminalMode: 'tmux' });
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    await waitFor(() => paneText(fixture!).includes(' $'));
    const session = sessionsForBranch(repo.repo, 'feature')[0] ?? '';
    await waitFor(() => paneText(fixture!).includes(' $'));
    submitCommand(fixture.nativeElement, 'echo keptsession');
    await waitFor(() => paneText(fixture!).includes('keptsession'));
    openSettings(fixture);
    clickMode(fixture, 'none');
    clickModeAction(fixture, 'keep');

    expect(fixture.nativeElement.querySelector('[data-testid="terminal-row"]')).toBeNull();
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([session]);
    clickMode(fixture, 'terminal');

    expect(modeDialog(fixture)).toBeNull();
    await waitFor(() => paneText(fixture!).includes('keptsession'));
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([session]);
    expect(paneTitles(fixture)).toEqual(['tmux session']);
  });

  it('collapses the section when a mode change leaves the worktree with no terminals', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    await waitFor(() => paneTitles(fixture!).length === 1);
    openSettings(fixture);
    clickMode(fixture, 'tmux');
    clickModeAction(fixture, 'kill');
    closeSettings(fixture);

    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(paneTitles(fixture)).toEqual([]);
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([]);
    clickCollapse(fixture);
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 1);

    expect(paneTitles(fixture)).toEqual(['tmux session']);
    expect(collapseLabel(fixture)).toBe('Collapse terminal');
  });

  it('keeps the section expanded or collapsed when terminals remain', async () => {
    const repo = createRepo('git-manager-mode-');
    roots.push(repo.root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    await waitFor(() => tabNames(fixture!).includes('1 bash'));
    openSettings(fixture);
    clickMode(fixture, 'tmux');
    clickModeAction(fixture, 'keep');

    expect(collapseLabel(fixture)).toBe('Collapse terminal');
    expect(paneTitles(fixture)).toEqual(['in-app terminal']);
    closeSettings(fixture);
    clickCollapse(fixture);
    openSettings(fixture);
    clickMode(fixture, 'terminal');

    expect(modeDialog(fixture)).toBeNull();
    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-running-count"]')?.textContent?.trim()).toBe('1');
    expect(paneTitles(fixture)).toEqual([]);
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([]);
    closeSettings(fixture);
    clickCollapse(fixture);
    await waitFor(() => paneTitles(fixture!).length === 1);

    expect(paneTitles(fixture)).toEqual(['in-app terminal']);
    expect(tabNames(fixture)).toEqual(['1 bash']);
  });

  it('ends in-app terminals when the repository changes and leaves tmux sessions running', async () => {
    const harbor = createRepo('git-manager-mode-harbor-');
    const atlas = createRepo('git-manager-mode-atlas-');
    roots.push(harbor.root, atlas.root);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(harbor.root, 'registry.db');
    addRepository(harbor.repo, 'Harbor');
    addRepository(atlas.repo, 'Atlas');
    fixture = await renderWorkspace(null, { liveRegistry: true });
    chooseRepository(fixture, 'Harbor');
    clickBranch(fixture, 'feature');
    await waitFor(() => paneText(fixture!).includes(' $'));
    submitCommand(fixture.nativeElement, 'echo inappmarker');
    await waitFor(() => paneText(fixture!).includes('inappmarker'));
    await waitFor(() => shellArguments(worktreePath(harbor.repo)).some((args) => args[0] === '/bin/bash'));

    switchRepository(fixture, 'Atlas');
    await waitFor(() => !shellArguments(worktreePath(harbor.repo)).some((args) => args[0] === '/bin/bash'));
    clickBranch(fixture, 'feature');
    await waitFor(() => paneText(fixture!).includes(' $'));
    switchRepository(fixture, 'Harbor');
    clickBranch(fixture, 'feature');
    await waitFor(() => paneText(fixture!).includes(' $'));

    expect(paneText(fixture)).not.toContain('inappmarker');
    expect(sessionsForBranch(harbor.repo, 'feature')).toEqual([]);

    fixture.destroy();
    fixture = undefined;
    writeSettings(harbor.root, { terminalMode: 'tmux' });
    fixture = await renderWorkspace(null, { liveRegistry: true });
    chooseRepository(fixture, 'Harbor');
    clickBranch(fixture, 'feature');
    await waitFor(() => sessionsForBranch(harbor.repo, 'feature').length === 1);
    const session = sessionsForBranch(harbor.repo, 'feature')[0] ?? '';
    await waitFor(() => paneText(fixture!).includes(' $'));
    submitCommand(fixture.nativeElement, 'echo keptsession');
    await waitFor(() => paneText(fixture!).includes('keptsession'));
    switchRepository(fixture, 'Atlas');
    clickBranch(fixture, 'feature');
    await waitFor(() => sessionsForBranch(atlas.repo, 'feature').length === 1);

    expect(hasSession(session)).toBe(true);
    expect(sessionsForBranch(harbor.repo, 'feature')).toEqual([session]);
    switchRepository(fixture, 'Harbor');
    clickBranch(fixture, 'feature');
    await waitFor(() => paneText(fixture!).includes('keptsession'));
    expect(sessionsForBranch(harbor.repo, 'feature')).toEqual([session]);
  });
});
