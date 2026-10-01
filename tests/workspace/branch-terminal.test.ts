// @vitest-environment jsdom

import './setup';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceComponent } from '../../apps/workspace/workspace.component';
import { tmuxBinary } from '../../apps/workspace/tmux-sessions';

const TMUX = '/usr/bin/tmux';

function tmuxEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TMUX;
  delete env.TMUX_PANE;
  return env;
}

function listSessions(): string[] {
  try {
    const output = execFileSync(TMUX, ['list-sessions', '-F', '#{session_name}'], {
      encoding: 'utf8',
      env: tmuxEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function capturePane(session: string): string {
  return execFileSync(TMUX, ['capture-pane', '-t', session, '-p'], {
    encoding: 'utf8',
    env: tmuxEnv(),
  });
}

function createRepo(): { root: string; repo: string } {
  const root = mkdtempSync(join(tmpdir(), 'git-manager-workspace-'));
  const repo = join(root, 'billing');
  mkdirSync(repo);
  execFileSync('git', ['init', '-b', 'main'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@git-manager.local'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'git-manager test'], { cwd: repo, stdio: 'ignore' });
  writeFileSync(join(repo, 'README'), 'hi\n');
  execFileSync('git', ['add', 'README'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['branch', 'feature'], { cwd: repo, stdio: 'ignore' });
  const worktree = join(repo, '.workspaces', 'feature');
  mkdirSync(join(repo, '.workspaces'));
  execFileSync('git', ['worktree', 'add', worktree, 'feature'], { cwd: repo, stdio: 'ignore' });
  return { root, repo };
}

function renderWorkspace(repo: string, platform?: string): ComponentFixture<WorkspaceComponent> {
  TestBed.configureTestingModule({
    imports: [WorkspaceComponent],
  });
  const fixture = TestBed.createComponent(WorkspaceComponent);
  fixture.componentRef.setInput('repoPath', repo);
  if (platform) {
    fixture.componentRef.setInput('platform', platform);
  }
  fixture.detectChanges();
  return fixture;
}

function branchRow(fixture: ComponentFixture<WorkspaceComponent>, name: string): HTMLButtonElement {
  const buttons = Array.from(fixture.nativeElement.querySelectorAll('aside button')) as HTMLButtonElement[];
  const button = buttons.find((candidate) => (candidate.textContent ?? '').includes(name));
  if (!button) {
    throw new Error(`Branch ${name} is not shown`);
  }
  return button;
}

function clickBranch(fixture: ComponentFixture<WorkspaceComponent>, name: string): void {
  branchRow(fixture, name).click();
  fixture.detectChanges();
}

function terminalCount(fixture: ComponentFixture<WorkspaceComponent>, name: string): string | null {
  const text = (branchRow(fixture, name).textContent ?? '').replace(name, '').trim();
  return text.length === 0 ? null : text;
}

function paneText(fixture: ComponentFixture<WorkspaceComponent>): string {
  const pane = fixture.nativeElement.querySelector('.terminal-pane');
  return pane?.textContent ?? '';
}

function tabNames(fixture: ComponentFixture<WorkspaceComponent>): string[] {
  const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
  return Array.from(tabs, (tab: Element) => (tab.textContent ?? '').trim());
}

function visiblePaneCount(fixture: ComponentFixture<WorkspaceComponent>): number {
  return fixture.nativeElement.querySelectorAll('.terminal-pane').length;
}

function controlButton(fixture: ComponentFixture<WorkspaceComponent>, label: string): HTMLButtonElement | null {
  const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
  return buttons.find((candidate) => candidate.textContent?.trim() === label) ?? null;
}

function clickControl(fixture: ComponentFixture<WorkspaceComponent>, label: string): void {
  const button = controlButton(fixture, label);
  if (!button) {
    throw new Error(`${label} is not shown`);
  }
  button.click();
  fixture.detectChanges();
}

function hasSession(session: string): boolean {
  try {
    execFileSync(TMUX, ['has-session', '-t', session], {
      stdio: 'ignore',
      env: tmuxEnv(),
    });
    return true;
  } catch {
    return false;
  }
}

function keyEvent(type: string, key: string, keyCode: number, charCode = 0): KeyboardEvent {
  const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'keyCode', { get: () => keyCode });
  Object.defineProperty(event, 'which', { get: () => (charCode || keyCode) });
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

async function waitFor(check: () => boolean): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out waiting for the terminal');
}

describe('branch terminal', () => {
  let root = '';
  let before: string[] = [];
  let fixture: ComponentFixture<WorkspaceComponent> | undefined;

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    fixture?.destroy();
    for (const name of listSessions()) {
      if (!before.includes(name) && name.startsWith('gm_')) {
        try {
          execFileSync(TMUX, ['kill-session', '-t', name], { stdio: 'ignore', env: tmuxEnv() });
        } catch {
          // The session already exited.
        }
      }
    }
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs a command in the worktree tmux session and that session is visible outside', async () => {
    const repo = createRepo();
    root = repo.root;
    before = listSessions();
    fixture = renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');

    await waitFor(() => /[$#%]/.test(paneText(fixture!)));

    const started = listSessions().filter((name) => !before.includes(name));
    expect(started).toEqual([expect.stringMatching(/^gm_[0-9a-f]{8}_feature_1$/)]);

    submitCommand(fixture.nativeElement, 'echo marker-from-pane');

    await waitFor(() => paneText(fixture!).includes('marker-from-pane'));
    await waitFor(() => capturePane(started[0]).includes('marker-from-pane'));

    const pane = fixture.nativeElement.querySelector('.terminal-pane') as HTMLElement;
    expect(pane.getAttribute('style')).toContain('background-color: #1e1e1e');
  });

  it('switches tabs, splits the view, and kill drops the outside tmux session', async () => {
    const repo = createRepo();
    root = repo.root;
    before = listSessions();
    fixture = renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    await waitFor(() => /[$#%]/.test(paneText(fixture!)));

    const firstTabs = tabNames(fixture!);
    expect(firstTabs).toHaveLength(1);
    expect(visiblePaneCount(fixture!)).toBe(1);
    const first = firstTabs[0];

    clickControl(fixture!, 'New');
    await waitFor(() => tabNames(fixture!).length === 2);
    const second = tabNames(fixture!).find((name) => name !== first);
    expect(second).toMatch(/^gm_[0-9a-f]{8}_feature_2$/);

    clickControl(fixture!, second!);
    await waitFor(() => /[$#%]/.test(paneText(fixture!)));
    submitCommand(fixture!.nativeElement, 'echo marker-second');
    await waitFor(() => capturePane(second!).includes('marker-second'));
    expect(capturePane(first)).not.toContain('marker-second');

    clickControl(fixture!, first);
    await waitFor(() => {
      const text = paneText(fixture!);
      return /[$#%]/.test(text) && !text.includes('marker-second');
    });
    submitCommand(fixture!.nativeElement, 'echo marker-first');
    await waitFor(() => capturePane(first).includes('marker-first'));
    expect(capturePane(second!)).not.toContain('marker-first');

    clickControl(fixture!, 'Split');
    await waitFor(() => visiblePaneCount(fixture!) === 2);

    clickControl(fixture!, 'Kill');
    await waitFor(() => !tabNames(fixture!).includes(first));
    expect(hasSession(first)).toBe(false);
    expect(hasSession(second!)).toBe(true);
    expect(visiblePaneCount(fixture!)).toBe(1);
  });

  it('shows a terminal count only while terminals for that branch are running', async () => {
    const repo = createRepo();
    root = repo.root;
    before = listSessions();
    fixture = renderWorkspace(repo.repo);

    expect(terminalCount(fixture, 'feature')).toBeNull();

    clickBranch(fixture, 'feature');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');

    clickControl(fixture, 'New');
    await waitFor(() => terminalCount(fixture!, 'feature') === '2');

    clickControl(fixture, 'Kill');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');

    clickControl(fixture, 'Kill');
    await waitFor(() => terminalCount(fixture!, 'feature') === null);
    expect(branchRow(fixture, 'feature').textContent ?? '').not.toContain('0');
  });

  it('opens one shell in the worktree on Windows and does not create a tmux session', async () => {
    const repo = createRepo();
    root = repo.root;
    const worktree = join(repo.repo, '.workspaces', 'feature');
    before = listSessions();
    fixture = renderWorkspace(repo.repo, 'win32');

    expect(terminalCount(fixture, 'feature')).toBeNull();
    clickBranch(fixture, 'feature');

    await waitFor(() => /[$#%]/.test(paneText(fixture!)));
    expect(visiblePaneCount(fixture!)).toBe(1);
    expect(tabNames(fixture!)).toEqual([]);
    expect(controlButton(fixture!, 'Split')).toBeNull();
    expect(controlButton(fixture!, 'New')).toBeNull();
    expect(controlButton(fixture!, 'Kill')).toBeNull();
    expect(terminalCount(fixture!, 'feature')).toBe('1');

    submitCommand(fixture!.nativeElement, 'pwd');
    await waitFor(() => paneText(fixture!).includes(worktree));
    expect(listSessions().filter((name) => !before.includes(name))).toEqual([]);
  });

  it('follows the selected worktree when the Windows shell changes branch', async () => {
    const repo = createRepo();
    root = repo.root;
    const feature = join(repo.repo, '.workspaces', 'feature');
    before = listSessions();
    fixture = renderWorkspace(repo.repo, 'win32');

    clickBranch(fixture, 'feature');
    await waitFor(() => /[$#%]/.test(paneText(fixture!)));
    submitCommand(fixture!.nativeElement, 'pwd');
    await waitFor(() => paneText(fixture!).includes(feature));

    clickBranch(fixture, 'main');
    await waitFor(() => /[$#%]/.test(paneText(fixture!)));
    submitCommand(fixture!.nativeElement, 'pwd');
    await waitFor(() => {
      const text = paneText(fixture!);
      return text.includes(repo.repo) && !text.includes(feature);
    });
    expect(terminalCount(fixture!, 'feature')).toBeNull();
    expect(terminalCount(fixture!, 'main')).toBe('1');
  });

  it('drops the count when the tmux session exits outside the window', async () => {
    const repo = createRepo();
    root = repo.root;
    before = listSessions();
    fixture = renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');
    const session = tabNames(fixture!)[0];
    execFileSync(TMUX, ['kill-session', '-t', session], { stdio: 'ignore', env: tmuxEnv() });

    await waitFor(() => {
      fixture!.detectChanges();
      return terminalCount(fixture!, 'feature') === null;
    });
  });

  it('does not count a tmux session that only shares the branch prefix', async () => {
    const repo = createRepo();
    root = repo.root;
    before = listSessions();
    fixture = renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');
    const session = tabNames(fixture!)[0];
    execFileSync(TMUX, ['new-session', '-d', '-s', `${session}extra`], { stdio: 'ignore', env: tmuxEnv() });
    clickBranch(fixture, 'main');
    await waitFor(() => terminalCount(fixture!, 'main') === '1');

    fixture.detectChanges();
    expect(terminalCount(fixture, 'feature')).toBe('1');
  });

  it('finds tmux on PATH and skips the agent wrapper', () => {
    const binary = tmuxBinary();
    expect(binary.startsWith('/exec-daemon')).toBe(false);
    expect(existsSync(binary)).toBe(true);
  });
});
