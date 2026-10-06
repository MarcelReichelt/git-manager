import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  killTmuxSession,
  listTmuxSessions,
  sessionDirectory,
  createBranchSession,
  sessionsForBranch,
  tmuxBinary,
  tmuxOnPath,
} from '../src/desktop/tmux-sessions';
import { WorkspaceComponent } from '../src/desktop/workspace.component';

const emptyGitConfig = join(tmpdir(), 'git-worktree-manager-desktop-gitconfig');
writeFileSync(emptyGitConfig, '');
process.env.GIT_CONFIG_GLOBAL = emptyGitConfig;
process.env.GIT_CONFIG_SYSTEM = emptyGitConfig;
process.env.GIT_TERMINAL_PROMPT = '0';

function createRepo(): { root: string; repo: string } {
  const root = mkdtempSync(join(tmpdir(), 'git-worktree-manager-terminal-'));
  const repo = join(root, 'billing');
  mkdirSync(repo);
  execFileSync('git', ['init', '-b', 'master'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@git-worktree-manager.local'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'git-worktree-manager test'], { cwd: repo, stdio: 'ignore' });
  writeFileSync(join(repo, 'README'), 'hi\n');
  execFileSync('git', ['add', 'README'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['branch', 'feature'], { cwd: repo, stdio: 'ignore' });
  const worktree = join(repo, '.workspaces', 'feature');
  mkdirSync(join(repo, '.workspaces'));
  execFileSync('git', ['worktree', 'add', worktree, 'feature'], { cwd: repo, stdio: 'ignore' });
  return { root, repo };
}

async function renderWorkspace(
  repo: string,
  platform?: string,
  tmuxInstalled?: boolean,
): Promise<ComponentFixture<WorkspaceComponent>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [WorkspaceComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(WorkspaceComponent);
  fixture.componentRef.setInput('repositoryPath', repo);
  if (platform) {
    fixture.componentRef.setInput('platform', platform);
  }
  if (tmuxInstalled !== undefined) {
    fixture.componentRef.setInput('tmuxInstalled', tmuxInstalled);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function branchRow(fixture: ComponentFixture<WorkspaceComponent>, name: string): HTMLElement {
  const row = fixture.nativeElement.querySelector(`[data-testid="branch-row"][data-branch="${name}"]`);
  if (!(row instanceof HTMLElement)) {
    throw new Error(`Branch ${name} is not shown`);
  }
  return row;
}

function clickBranch(fixture: ComponentFixture<WorkspaceComponent>, name: string): void {
  branchRow(fixture, name).click();
  fixture.detectChanges();
}

function terminalCount(fixture: ComponentFixture<WorkspaceComponent>, name: string): string | null {
  const count = branchRow(fixture, name).querySelector('[data-testid="terminal-count"]');
  if (!count) {
    return null;
  }
  const text = count.textContent?.trim() ?? '';
  return text.length === 0 ? null : text;
}

function paneText(fixture: ComponentFixture<WorkspaceComponent>): string {
  const panes = fixture.nativeElement.querySelectorAll('.terminal-pane');
  return Array.from(panes, (pane) => (pane as HTMLElement).textContent ?? '').join('\n');
}

function tabNames(fixture: ComponentFixture<WorkspaceComponent>): string[] {
  const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
  return Array.from(tabs, (tab) => tabLabel(tab as HTMLElement));
}

function tabLabel(tab: HTMLElement): string {
  const label = tab.querySelector('[data-testid="terminal-tab-label"]');
  const source = label instanceof HTMLElement ? label : tab;
  return (source.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function visiblePaneCount(fixture: ComponentFixture<WorkspaceComponent>): number {
  return fixture.nativeElement.querySelectorAll('.terminal-pane').length;
}

function controlButton(fixture: ComponentFixture<WorkspaceComponent>, label: string): HTMLButtonElement | null {
  const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
  return (
    buttons.find((candidate) => {
      if (candidate.closest('[data-testid="terminal-tab"], [data-testid="terminal-pane-header"]') !== null) {
        return false;
      }
      const text = candidate.textContent?.trim() ?? '';
      return text === label || candidate.getAttribute('aria-label') === label || candidate.getAttribute('title') === label;
    }) ?? null
  );
}

function clickTab(fixture: ComponentFixture<WorkspaceComponent>, index: number): void {
  const tabs = fixture.nativeElement.querySelectorAll('[data-testid="terminal-tab"]');
  const tab = tabs[index];
  if (!(tab instanceof HTMLElement)) {
    throw new Error(`Tab ${index + 1} is not shown`);
  }
  tab.click();
  fixture.detectChanges();
}

function clickControl(fixture: ComponentFixture<WorkspaceComponent>, label: string): void {
  const button = controlButton(fixture, label);
  if (!button) {
    throw new Error(`${label} is not shown`);
  }
  button.click();
  fixture.detectChanges();
}

function capturePane(session: string): string {
  return execFileSync(tmuxBinary(), ['capture-pane', '-t', session, '-p'], {
    encoding: 'utf8',
    env: tmuxEnv(),
  });
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

function helperTextareaRule(): CSSStyleDeclaration | null {
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList | undefined;
    try {
      rules = sheet.cssRules;
    } catch {
      rules = undefined;
    }
    if (!rules) {
      continue;
    }
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule && rule.selectorText.includes('xterm-helper-textarea')) {
        return rule.style;
      }
    }
  }
  return null;
}

function useTmuxMode(root: string): void {
  const settingsPath = join(root, 'app-settings.json');
  writeFileSync(settingsPath, '{"terminalMode":"tmux"}\n');
  process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH = settingsPath;
}

describe('branch terminal', () => {
  let root = '';
  let settingsRoot = '';
  let before: string[] = [];
  let fixture: ComponentFixture<WorkspaceComponent> | undefined;
  const previousSettingsPath = process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH;

  beforeEach(() => {
    TestBed.resetTestingModule();
    settingsRoot = mkdtempSync(join(tmpdir(), 'git-worktree-manager-terminal-settings-'));
    process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH = join(settingsRoot, 'app-settings.json');
  });

  it('hides the terminal keyboard input', () => {
    const rule = helperTextareaRule();
    expect(rule?.getPropertyValue('opacity').trim()).toBe('0');
    expect(rule?.getPropertyValue('left').trim()).toBe('-9999em');
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    if (previousSettingsPath === undefined) {
      delete process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH;
    } else {
      process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH = previousSettingsPath;
    }
    if (root) {
      for (const name of listTmuxSessions()) {
        if (sessionDirectory(name).startsWith(root)) {
          killTmuxSession(name);
        }
      }
      rmSync(root, { recursive: true, force: true });
      root = '';
    }
    if (settingsRoot) {
      rmSync(settingsRoot, { recursive: true, force: true });
      settingsRoot = '';
    }
  });

  it('runs a command in the worktree tmux session and that session is visible outside', async () => {
    const repo = createRepo();
    root = repo.root;
    before = listTmuxSessions();
    useTmuxMode(root);
    fixture = await renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');

    await waitFor(() => /[$#%]/.test(paneText(fixture!)));

    const started = listTmuxSessions().filter(
      (name) => !before.includes(name) && sessionDirectory(name).startsWith(root),
    );
    expect(started).toEqual([expect.stringMatching(/^gm_[0-9a-f]{8}_feature_1$/)]);

    submitCommand(fixture.nativeElement, 'echo marker-from-pane');

    await waitFor(() => paneText(fixture!).includes('marker-from-pane'));
    await waitFor(() => capturePane(started[0]!).includes('marker-from-pane'));

    const pane = fixture.nativeElement.querySelector('.terminal-pane') as HTMLElement;
    expect(pane.getAttribute('style') ?? '').toMatch(/background-color:\s*(#1e1e1e|rgb\(30,\s*30,\s*30\))/);
  });

  it('switches tabs, splits the view, and kill drops the outside tmux session', async () => {
    const repo = createRepo();
    root = repo.root;
    before = listTmuxSessions();
    useTmuxMode(root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => /[$#%]/.test(paneText(fixture!)));

    expect(tabNames(fixture)).toHaveLength(1);
    expect(visiblePaneCount(fixture)).toBe(1);
    const first = sessionsForBranch(repo.repo, 'feature');
    expect(first).toEqual([expect.stringMatching(/^gm_[0-9a-f]{8}_feature_1$/)]);

    clickControl(fixture, 'New');
    await waitFor(() => tabNames(fixture!).length === 2);
    const second = sessionsForBranch(repo.repo, 'feature');
    expect(second).toHaveLength(2);
    const secondSession = second.find((name) => name !== first[0]);
    expect(secondSession).toMatch(/^gm_[0-9a-f]{8}_feature_2$/);

    clickTab(fixture, 1);
    await waitFor(() => /[$#%]/.test(paneText(fixture!)));
    submitCommand(fixture.nativeElement, 'echo marker-second');
    await waitFor(() => capturePane(secondSession!).includes('marker-second'));
    expect(capturePane(first[0]!)).not.toContain('marker-second');

    clickTab(fixture, 0);
    await waitFor(() => {
      const text = paneText(fixture!);
      return /[$#%]/.test(text) && !text.includes('marker-second');
    });
    submitCommand(fixture.nativeElement, 'echo marker-first');
    await waitFor(() => capturePane(first[0]!).includes('marker-first'));
    expect(capturePane(secondSession!)).not.toContain('marker-first');

    clickControl(fixture, 'Split');
    await waitFor(() => visiblePaneCount(fixture!) === 2);
    const splitSessions = sessionsForBranch(repo.repo, 'feature');
    expect(splitSessions).toHaveLength(3);

    clickControl(fixture, 'Kill');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 2);
    expect(hasSession(first[0]!)).toBe(true);
    expect(hasSession(secondSession!)).toBe(true);
    const killed = splitSessions.find((name) => !sessionsForBranch(repo.repo, 'feature').includes(name));
    expect(hasSession(killed ?? '')).toBe(false);
    expect(visiblePaneCount(fixture)).toBe(1);
  });

  it('shows a terminal count only while terminals for that branch are running', async () => {
    const repo = createRepo();
    root = repo.root;
    before = listTmuxSessions();
    fixture = await renderWorkspace(repo.repo);

    expect(terminalCount(fixture, 'feature')).toBeNull();

    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');

    clickControl(fixture, 'New');
    await waitFor(() => terminalCount(fixture!, 'feature') === '2');

    clickControl(fixture, 'Kill');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');

    clickControl(fixture, 'Kill');
    await waitFor(() => terminalCount(fixture!, 'feature') === null);
    expect(branchRow(fixture, 'feature').querySelector('[data-testid="terminal-count"]')).toBeNull();
    expect(branchRow(fixture, 'feature').textContent ?? '').not.toMatch(/0 terminals/);
  });

  it('opens one shell in the worktree on Windows and does not create a tmux session', async () => {
    const repo = createRepo();
    root = repo.root;
    const worktree = join(repo.repo, '.workspaces', 'feature');
    before = listTmuxSessions();
    fixture = await renderWorkspace(repo.repo, 'win32');

    expect(terminalCount(fixture, 'feature')).toBeNull();
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');

    await waitFor(() => /[$#%]/.test(paneText(fixture!)));
    expect(visiblePaneCount(fixture)).toBe(1);
    expect(tabNames(fixture)).toHaveLength(1);
    expect(controlButton(fixture, 'New')?.getAttribute('aria-label')).toBe('New');
    expect(controlButton(fixture, 'Split')?.getAttribute('aria-label')).toBe('Split');
    expect(controlButton(fixture, 'Kill')?.getAttribute('aria-label')).toBe('Kill');
    expect(terminalCount(fixture, 'feature')).toBe('1');

    submitCommand(fixture.nativeElement, 'pwd');
    await waitFor(() => paneText(fixture!).includes(worktree));
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([]);
    expect(sessionsForBranch(repo.repo, 'master')).toEqual([]);
  });

  it('keeps each worktree shell when the selection changes', async () => {
    const repo = createRepo();
    root = repo.root;
    const feature = join(repo.repo, '.workspaces', 'feature');
    before = listTmuxSessions();
    fixture = await renderWorkspace(repo.repo, 'win32');

    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => /[$#%]/.test(paneText(fixture!)));
    submitCommand(fixture.nativeElement, 'pwd');
    await waitFor(() => paneText(fixture!).includes(feature));

    clickBranch(fixture, 'master');
    clickControl(fixture, 'New');
    await waitFor(() => /[$#%]/.test(paneText(fixture!)));
    submitCommand(fixture.nativeElement, 'pwd');
    await waitFor(() => {
      const text = paneText(fixture!);
      return text.includes(repo.repo) && !text.includes(feature);
    });
    expect(terminalCount(fixture, 'feature')).toBe('1');
    expect(terminalCount(fixture, 'master')).toBe('1');
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([]);
    expect(sessionsForBranch(repo.repo, 'master')).toEqual([]);

    clickBranch(fixture, 'feature');
    await waitFor(() => paneText(fixture!).includes(feature));
  });

  it('drops the count when the tmux session exits outside the window', async () => {
    const repo = createRepo();
    root = repo.root;
    before = listTmuxSessions();
    useTmuxMode(root);
    fixture = await renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');
    const session = sessionsForBranch(repo.repo, 'feature')[0] ?? '';
    execFileSync(tmuxBinary(), ['kill-session', '-t', session], { stdio: 'ignore', env: tmuxEnv() });

    await waitFor(() => {
      fixture!.detectChanges();
      return terminalCount(fixture!, 'feature') === null;
    });
  });

  it('does not count a tmux session that only shares the branch prefix', async () => {
    const repo = createRepo();
    root = repo.root;
    before = listTmuxSessions();
    useTmuxMode(root);
    fixture = await renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');
    const session = sessionsForBranch(repo.repo, 'feature')[0] ?? '';
    execFileSync(tmuxBinary(), ['new-session', '-d', '-s', `${session}extra`, '-c', root], {
      stdio: 'ignore',
      env: tmuxEnv(),
    });
    clickBranch(fixture, 'master');
    clickControl(fixture, 'New');
    await waitFor(() => terminalCount(fixture!, 'master') === '1');

    fixture.detectChanges();
    expect(terminalCount(fixture, 'feature')).toBe('1');
  });

  it('finds tmux on PATH and skips the agent wrapper', () => {
    const binary = tmuxBinary();
    expect(binary.startsWith('/exec-daemon')).toBe(false);
    expect(existsSync(binary)).toBe(true);
  });

  it('treats tmux as missing when it is not on PATH', () => {
    expect(tmuxOnPath('/tmp/git-worktree-manager-no-tmux')).toBeNull();
  });

  it('counts a tmux session for a worktree before that worktree is selected', async () => {
    const repo = createRepo();
    root = repo.root;
    before = listTmuxSessions();
    useTmuxMode(root);
    const worktree = join(repo.repo, '.workspaces', 'feature');
    createBranchSession(repo.repo, 'feature', worktree, 1);
    fixture = await renderWorkspace(repo.repo);

    expect(terminalCount(fixture, 'feature')).toBe('1');
    expect(terminalCount(fixture, 'master')).toBeNull();

    clickBranch(fixture, 'feature');
    await waitFor(() => tabNames(fixture!).length === 1);
    expect(sessionsForBranch(repo.repo, 'feature')).toHaveLength(1);
    expect(terminalCount(fixture, 'feature')).toBe('1');
  });

  it('places the terminal in a bottom row under the changes, the commits, and the diff', async () => {
    const repo = createRepo();
    root = repo.root;
    writeFileSync(join(repo.repo, '.workspaces', 'feature', 'notes.txt'), 'changed\n');
    fixture = await renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => visiblePaneCount(fixture!) === 1);
    fixture.nativeElement.querySelector('[data-testid="changed-file"]').click();
    fixture.detectChanges();

    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]') as HTMLElement;
    const columns = sheet.querySelector('.sheet-columns') as HTMLElement;
    const split = sheet.querySelector('[data-testid="terminal-split"]') as HTMLElement;
    const row = sheet.querySelector('[data-testid="terminal-row"]') as HTMLElement;
    const diff = sheet.querySelector('[data-testid="diff"]') as HTMLElement;

    expect(split.getAttribute('role')).toBe('separator');
    expect(split.getAttribute('aria-orientation')).toBe('horizontal');
    expect(columns.contains(sheet.querySelector('[data-testid="changes"]'))).toBe(true);
    expect(columns.contains(sheet.querySelector('[data-testid="commits"]'))).toBe(true);
    expect(columns.contains(diff)).toBe(true);
    expect(columns.compareDocumentPosition(split) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(split.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.contains(sheet.querySelector('[data-testid="terminal-pane"]'))).toBe(true);
    expect(row.querySelector('[data-testid="terminal-collapse"]')?.getAttribute('aria-label')).toBe(
      'Collapse terminal',
    );
    expect(row.parentElement?.style.gridTemplateRows).toMatch(/minmax\(0, 1fr\) 8px \d+px/);
  });

  it('fills the content width so no background shows to the right of an open terminal', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    await waitFor(() => visiblePaneCount(fixture!) === 1);

    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]') as HTMLElement;
    const chrome = sheet.querySelector('[data-testid="terminal-header"]') as HTMLElement;
    const pane = sheet.querySelector('[data-testid="terminal-pane"]') as HTMLElement;
    const split = sheet.querySelector('[data-testid="terminal-split"]') as HTMLElement;

    expect(contentRightGap(chrome, sheet)).toBe(0);
    expect(contentRightGap(pane, sheet)).toBe(0);
    expect(contentRightGap(split, sheet)).toBe(0);
  });

  it('fills the content width when a tab has two terminals side by side', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    await waitFor(() => visiblePaneCount(fixture!) === 1);
    clickControl(fixture, 'Split');
    await waitFor(() => visiblePaneCount(fixture!) === 2);

    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]') as HTMLElement;
    const panes = [...sheet.querySelectorAll('[data-testid="terminal-pane"]')] as HTMLElement[];
    const rightPane = panes[1];

    expect(panes).toHaveLength(2);
    expect(contentRightGap(rightPane!, sheet)).toBe(0);
    expect(contentRightGap(sheet.querySelector('[data-testid="terminal-header"]') as HTMLElement, sheet)).toBe(0);
  });

  it('fills the content width while the terminal section is maximized', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    await waitFor(() => visiblePaneCount(fixture!) === 1);
    clickControl(fixture, 'Maximize terminal');

    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]') as HTMLElement;
    expect(sheet.querySelector('[data-testid="terminal-maximize"]')?.getAttribute('aria-label')).toBe('Restore terminal');
    expect(contentRightGap(sheet.querySelector('[data-testid="terminal-header"]') as HTMLElement, sheet)).toBe(0);
    expect(contentRightGap(sheet.querySelector('[data-testid="terminal-pane"]') as HTMLElement, sheet)).toBe(0);
  });

  it('resizes the terminal row from the horizontal splitter and keeps that height across worktrees', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => visiblePaneCount(fixture!) === 1);

    const split = fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement;
    const before = terminalRowHeight(split.parentElement as HTMLElement);

    dragDivider(split, { x: 400, y: 200 }, { x: 400, y: 120 });
    fixture.detectChanges();

    const after = terminalRowHeight(split.parentElement as HTMLElement);
    expect(after).toBe(before + 80);

    clickBranch(fixture, 'master');
    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();
    clickCollapse(fixture);
    const again = fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement;
    expect(terminalRowHeight(again.parentElement as HTMLElement)).toBe(after);
    expect(visiblePaneCount(fixture)).toBe(0);
  });

  it('collapses the terminal row to its header', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => visiblePaneCount(fixture!) === 1);

    clickCollapse(fixture);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('[data-testid="terminal-row"]') as HTMLElement;
    expect(row.querySelector('[data-testid="terminal-header"]')).not.toBeNull();
    expect(row.querySelector('[data-testid="terminal-pane"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-split"]')).toBeNull();
    expect(row.querySelector('[data-testid="terminal-collapse"]')?.getAttribute('aria-label')).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="changes"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="commits"]')).not.toBeNull();
  });

  it('places Maximize terminal immediately to the left of Kill and keeps it while collapsed', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => visiblePaneCount(fixture!) === 1);

    const header = fixture.nativeElement.querySelector('[data-testid="terminal-header"]') as HTMLElement;
    const maximize = header.querySelector('[data-testid="terminal-maximize"]') as HTMLButtonElement;
    const kill = header.querySelector('[data-testid="terminal-kill"]');
    const icon = maximize.querySelector('svg');

    expect(maximize.classList.contains('terminal-icon')).toBe(true);
    expect(maximize.getAttribute('aria-label')).toBe('Maximize terminal');
    expect(maximize.nextElementSibling).toBe(kill);
    expect(icon?.getAttribute('width')).toBe('16');
    expect(icon?.getAttribute('height')).toBe('16');

    clickCollapse(fixture);

    const collapsed = fixture.nativeElement.querySelector(
      '[data-testid="terminal-maximize"]',
    ) as HTMLButtonElement;
    expect(collapsed.getAttribute('aria-label')).toBe('Maximize terminal');
    expect(collapsed.nextElementSibling).toBe(
      fixture.nativeElement.querySelector('[data-testid="terminal-kill"]'),
    );
  });

  it('covers the sheet with the terminal and restores the docked height', async () => {
    const repo = createRepo();
    root = repo.root;
    writeFileSync(join(repo.repo, '.workspaces', 'feature', 'notes.txt'), 'changed\n');
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => visiblePaneCount(fixture!) === 1);
    fixture.nativeElement.querySelector('[data-testid="changed-file"]').click();
    fixture.detectChanges();

    const split = fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement;
    dragDivider(split, { x: 400, y: 200 }, { x: 400, y: 120 });
    fixture.detectChanges();
    const docked = terminalRowHeight(split.parentElement as HTMLElement);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, shiftKey: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '`', ctrlKey: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-maximize"]')?.getAttribute('aria-label')).toBe(
      'Maximize terminal',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="changes"]')).not.toBeNull();

    clickControl(fixture, 'Maximize terminal');

    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]') as HTMLElement;
    expect(sheet.querySelector('.branch-heading')).toBeNull();
    expect(sheet.querySelector('[data-testid="changes"]')).toBeNull();
    expect(sheet.querySelector('[data-testid="commits"]')).toBeNull();
    expect(sheet.querySelector('[data-testid="diff"]')).toBeNull();
    expect(sheet.querySelector('[data-testid="terminal-split"]')).toBeNull();
    expect(sheet.querySelector('[data-testid="terminal-row"]')).not.toBeNull();
    expect(sheet.querySelector('[data-testid="terminal-pane"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="branch-list"]')).not.toBeNull();
    expect((sheet.querySelector('.sheet-body') as HTMLElement).style.gridTemplateRows).toBe('minmax(0, 1fr)');
    expect(sheet.querySelector('[data-testid="terminal-maximize"]')?.getAttribute('aria-label')).toBe('Restore terminal');

    clickControl(fixture, 'Restore terminal');

    const again = fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement;
    expect(terminalRowHeight(again.parentElement as HTMLElement)).toBe(docked);
    expect(collapseLabel(fixture)).toBe('Collapse terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-maximize"]')?.getAttribute('aria-label')).toBe(
      'Maximize terminal',
    );
    expect(fixture.nativeElement.querySelector('.branch-heading')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="changes"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="commits"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="diff"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="branch-list"]')).not.toBeNull();
  });

  it('collapses from the maximized terminal and expands back to the docked height', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => visiblePaneCount(fixture!) === 1);

    const split = fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement;
    dragDivider(split, { x: 400, y: 200 }, { x: 400, y: 80 });
    fixture.detectChanges();
    const docked = terminalRowHeight(split.parentElement as HTMLElement);

    clickControl(fixture, 'Maximize terminal');
    clickCollapse(fixture);

    expect(fixture.nativeElement.querySelector('[data-testid="changes"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="commits"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.branch-heading')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-split"]')).toBeNull();
    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-maximize"]')?.getAttribute('aria-label')).toBe(
      'Maximize terminal',
    );

    clickCollapse(fixture);

    const again = fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement;
    expect(terminalRowHeight(again.parentElement as HTMLElement)).toBe(docked);
    expect(collapseLabel(fixture)).toBe('Collapse terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-maximize"]')?.getAttribute('aria-label')).toBe(
      'Maximize terminal',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="changes"]')).not.toBeNull();
    expect(visiblePaneCount(fixture)).toBe(1);
  });

  it('maximizes a collapsed terminal over the content and restores the docked height', async () => {
    const repo = createRepo();
    root = repo.root;
    writeFileSync(join(repo.repo, '.workspaces', 'feature', 'notes.txt'), 'changed\n');
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => visiblePaneCount(fixture!) === 1);
    fixture.nativeElement.querySelector('[data-testid="changed-file"]').click();
    fixture.detectChanges();

    const split = fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement;
    dragDivider(split, { x: 400, y: 200 }, { x: 400, y: 40 });
    fixture.detectChanges();
    const docked = terminalRowHeight(split.parentElement as HTMLElement);

    clickCollapse(fixture);
    clickControl(fixture, 'Maximize terminal');

    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]') as HTMLElement;
    const body = sheet.querySelector('.sheet-body') as HTMLElement;
    expect(sheet.querySelector('.branch-heading')).toBeNull();
    expect(sheet.querySelector('[data-testid="changes"]')).toBeNull();
    expect(sheet.querySelector('[data-testid="commits"]')).toBeNull();
    expect(sheet.querySelector('[data-testid="diff"]')).toBeNull();
    expect(sheet.querySelector('[data-testid="terminal-split"]')).toBeNull();
    expect(sheet.querySelector('[data-testid="terminal-pane"]')).not.toBeNull();
    expect(body.style.gridTemplateRows).toBe('minmax(0, 1fr)');
    expect(body.style.gridTemplateRows.includes(`${docked}px`)).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="branch-list"]')).not.toBeNull();
    expect(sheet.querySelector('[data-testid="terminal-maximize"]')?.getAttribute('aria-label')).toBe('Restore terminal');

    clickControl(fixture, 'Restore terminal');

    const again = fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement;
    expect(terminalRowHeight(again.parentElement as HTMLElement)).toBe(docked);
    expect(collapseLabel(fixture)).toBe('Collapse terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="changes"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="diff"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-maximize"]')?.getAttribute('aria-label')).toBe(
      'Maximize terminal',
    );
  });

  it('fills the maximized terminal to the content sheet and keeps the docked height', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => visiblePaneCount(fixture!) === 1);

    const split = fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement;
    dragDivider(split, { x: 400, y: 200 }, { x: 400, y: 120 });
    fixture.detectChanges();
    const docked = terminalRowHeight(split.parentElement as HTMLElement);
    const dockedPane = (fixture.nativeElement.querySelector('[data-testid="terminal-pane"]') as HTMLElement).style.height;

    const body = fixture.nativeElement.querySelector('.sheet-body') as HTMLElement;
    Object.defineProperty(body, 'clientHeight', { configurable: true, value: 800 });
    clickControl(fixture, 'Maximize terminal');

    expect((fixture.nativeElement.querySelector('[data-testid="terminal-pane"]') as HTMLElement).style.height).toBe(
      '764px',
    );

    Object.defineProperty(body, 'clientHeight', { configurable: true, value: 500 });
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('[data-testid="terminal-pane"]') as HTMLElement).style.height).toBe(
      '464px',
    );

    clickControl(fixture, 'Restore terminal');
    const again = fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement;
    expect(terminalRowHeight(again.parentElement as HTMLElement)).toBe(docked);
    expect((fixture.nativeElement.querySelector('[data-testid="terminal-pane"]') as HTMLElement).style.height).toBe(
      dockedPane,
    );
  });

  it('shows the sheet again when the last terminal is killed while maximized', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');

    clickControl(fixture, 'Maximize terminal');
    clickControl(fixture, 'Kill');
    await waitFor(() => terminalCount(fixture!, 'feature') === null);

    expect(fixture.nativeElement.querySelector('[data-testid="changes"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="commits"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.branch-heading')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-split"]')).toBeNull();
    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-maximize"]')?.getAttribute('aria-label')).toBe(
      'Maximize terminal',
    );
  });

  it('drops maximize when the workspace is opened again', async () => {
    const repo = createRepo();
    root = repo.root;
    const settingsPath = join(root, 'app-settings.json');
    process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH = settingsPath;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => visiblePaneCount(fixture!) === 1);

    clickControl(fixture, 'Maximize terminal');
    expect(existsSync(settingsPath)).toBe(false);

    fixture.destroy();
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    fixture.detectChanges();

    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-maximize"]')?.getAttribute('aria-label')).toBe(
      'Maximize terminal',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="changes"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-split"]')).toBeNull();
    expect(terminalCount(fixture, 'feature')).toBeNull();
  });

  it('restores the last terminal row height when the row expands', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => visiblePaneCount(fixture!) === 1);

    const split = fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement;
    dragDivider(split, { x: 400, y: 200 }, { x: 400, y: 80 });
    fixture.detectChanges();
    const height = terminalRowHeight(split.parentElement as HTMLElement);

    clickCollapse(fixture);
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-split"]')).toBeNull();

    clickCollapse(fixture);

    const again = fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement;
    expect(terminalRowHeight(again.parentElement as HTMLElement)).toBe(height);
    expect(visiblePaneCount(fixture)).toBe(1);
  });

  it('leaves the terminal row open or collapsed when New, Split, or Kill is clicked', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => tabNames(fixture!).length === 1);

    clickControl(fixture, 'New');
    await waitFor(() => tabNames(fixture!).length === 2);
    expect(collapseLabel(fixture)).toBe('Collapse terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-split"]')).not.toBeNull();

    clickControl(fixture, 'Split');
    await waitFor(() => visiblePaneCount(fixture!) === 2);
    expect(collapseLabel(fixture)).toBe('Collapse terminal');

    clickCollapse(fixture);
    expect(collapseLabel(fixture)).toBe('Expand terminal');

    clickControl(fixture, 'Kill');
    await waitFor(() => terminalCount(fixture!, 'feature') === '2');
    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-split"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();

    clickControl(fixture, 'Kill');
    await waitFor(() => tabNames(fixture!).length === 1);
    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();
  });

  it('shows the running terminal count on the collapsed header when it is greater than zero', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');

    expect(runningCount(fixture)).toBeNull();

    clickCollapse(fixture);
    expect(runningCount(fixture)).toBe('1');
    expect(terminalCount(fixture, 'feature')).toBe('1');

    clickCollapse(fixture);
    clickControl(fixture, 'New');
    await waitFor(() => terminalCount(fixture!, 'feature') === '2');
    clickCollapse(fixture);
    expect(runningCount(fixture)).toBe('2');
    expect(terminalCount(fixture, 'feature')).toBe('2');
  });

  it('hides the running terminal count when the selected worktree has no terminal', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');

    clickCollapse(fixture);
    clickControl(fixture, 'Kill');
    await waitFor(() => terminalCount(fixture!, 'feature') === null);

    expect(fixture.nativeElement.querySelector('[data-testid="terminal-header"]')).not.toBeNull();
    expect(runningCount(fixture)).toBeNull();
    expect(branchRow(fixture, 'feature').querySelector('[data-testid="terminal-count"]')).toBeNull();
  });

  it('keeps the terminal row collapsed when another worktree is selected', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');
    clickCollapse(fixture);

    clickBranch(fixture, 'master');
    fixture.detectChanges();

    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-header"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-split"]')).toBeNull();
    expect(runningCount(fixture)).toBeNull();
    expect(terminalCount(fixture, 'feature')).toBe('1');
    expect(terminalCount(fixture, 'master')).toBeNull();
    expect(sessionsForBranch(repo.repo, 'master')).toEqual([]);

    clickControl(fixture, 'Maximize terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="changes"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();

    clickBranch(fixture, 'feature');
    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="changes"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();
    expect(runningCount(fixture)).toBe('1');
    expect(terminalCount(fixture, 'feature')).toBe('1');

    clickCollapse(fixture);
    expect(collapseLabel(fixture)).toBe('Collapse terminal');
    expect(visiblePaneCount(fixture)).toBe(1);
    expect(terminalCount(fixture, 'feature')).toBe('1');

    clickControl(fixture, 'Maximize terminal');
    clickControl(fixture, 'Kill');
    await waitFor(() => terminalCount(fixture!, 'feature') === null);
    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="changes"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();

    clickBranch(fixture, 'master');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-maximize"]')?.getAttribute('aria-label')).toBe(
      'Restore terminal',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="changes"]')).toBeNull();
    expect(terminalCount(fixture, 'master')).toBeNull();
  });

  it('shows a running tmux session when a collapsed row selects that worktree', async () => {
    const repo = createRepo();
    root = repo.root;
    before = listTmuxSessions();
    useTmuxMode(root);
    const worktree = join(repo.repo, '.workspaces', 'feature');
    createBranchSession(repo.repo, 'feature', worktree, 1);
    writeFileSync(join(root, 'app-settings.json'), '{"terminalMode":"tmux","terminalExpanded":false}\n');
    fixture = await renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    fixture.detectChanges();

    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-header"]')).not.toBeNull();
    expect(runningCount(fixture)).toBe('1');
    expect(terminalCount(fixture, 'feature')).toBe('1');
    expect(sessionsForBranch(repo.repo, 'feature')).toHaveLength(1);
  });

  it('expands an empty terminal section without starting a shell', async () => {
    const repo = createRepo();
    root = repo.root;
    const settingsPath = join(root, 'app-settings.json');
    writeFileSync(settingsPath, '{"terminalRowHeight":300}\n');
    process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH = settingsPath;
    fixture = await renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');
    fixture.detectChanges();

    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-header"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();
    expect(terminalCount(fixture, 'feature')).toBeNull();
    expect(JSON.parse(readFileSync(settingsPath, 'utf8')).terminalRowHeight).toBe(300);

    clickCollapse(fixture);
    expect(terminalCount(fixture, 'feature')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();
    expect(collapseLabel(fixture)).toBe('Collapse terminal');
    expect(terminalRowHeight(
      (fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement).parentElement as HTMLElement,
    )).toBe(300);

    clickControl(fixture, 'New');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');
    expect(visiblePaneCount(fixture)).toBe(1);
  });

  it('leaves the saved arrangement in place when the terminal section is maximized', async () => {
    const repo = createRepo();
    root = repo.root;
    const settingsPath = join(root, 'app-settings.json');
    process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH = settingsPath;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => visiblePaneCount(fixture!) === 1);

    clickCollapse(fixture);
    const collapsed = readFileSync(settingsPath, 'utf8');
    expect(JSON.parse(collapsed).terminalExpanded).toBeUndefined();

    clickControl(fixture, 'Maximize terminal');
    expect(readFileSync(settingsPath, 'utf8')).toBe(collapsed);
    expect(JSON.parse(readFileSync(settingsPath, 'utf8')).terminalMaximized).toBeUndefined();

    fixture.destroy();
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    fixture.detectChanges();

    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="changes"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-maximize"]')?.getAttribute('aria-label')).toBe(
      'Maximize terminal',
    );
    expect(terminalCount(fixture, 'feature')).toBeNull();
  });

  it('restores the docked section for this worktree without saving it', async () => {
    const repo = createRepo();
    root = repo.root;
    const settingsPath = join(root, 'app-settings.json');
    process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH = settingsPath;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => visiblePaneCount(fixture!) === 1);

    clickCollapse(fixture);
    const collapsed = readFileSync(settingsPath, 'utf8');
    clickControl(fixture, 'Maximize terminal');
    expect(JSON.parse(readFileSync(settingsPath, 'utf8')).terminalExpanded).toBeUndefined();

    clickControl(fixture, 'Restore terminal');

    expect(readFileSync(settingsPath, 'utf8')).toBe(collapsed);
    expect(JSON.parse(readFileSync(settingsPath, 'utf8')).terminalMaximized).toBeUndefined();
    expect(collapseLabel(fixture)).toBe('Collapse terminal');
    expect(visiblePaneCount(fixture)).toBe(1);
  });

  it('collapses the terminal row when the last terminal is killed', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');
    expect(collapseLabel(fixture)).toBe('Collapse terminal');

    clickControl(fixture, 'Kill');
    await waitFor(() => terminalCount(fixture!, 'feature') === null);

    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-split"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-header"]')).not.toBeNull();
    expect(runningCount(fixture)).toBeNull();
  });

  it('starts one terminal from New on a collapsed empty section', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');

    const split = fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement;
    const height = terminalRowHeight(split.parentElement as HTMLElement);

    clickControl(fixture, 'Kill');
    await waitFor(() => terminalCount(fixture!, 'feature') === null);
    expect(collapseLabel(fixture)).toBe('Expand terminal');

    clickCollapse(fixture);
    expect(terminalCount(fixture, 'feature')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();
    expect(collapseLabel(fixture)).toBe('Collapse terminal');

    clickCollapse(fixture);
    clickControl(fixture, 'New');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');

    expect(collapseLabel(fixture)).toBe('Collapse terminal');
    expect(visiblePaneCount(fixture)).toBe(1);
    expect(tabNames(fixture)).toHaveLength(1);
    expect(terminalRowHeight(
      (fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement).parentElement as HTMLElement,
    )).toBe(height);
  });

  it('shows the running terminals when the row expands and does not start another', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => tabNames(fixture!).length === 1 && /^\d+ \S+/.test(tabNames(fixture!)[0] ?? ''));
    clickControl(fixture, 'New');
    await waitFor(
      () => tabNames(fixture!).length === 2 && tabNames(fixture!).every((name) => /^\d+ \S+/.test(name)),
    );
    const tabs = tabNames(fixture);

    clickCollapse(fixture);
    clickCollapse(fixture);
    await waitFor(() => visiblePaneCount(fixture!) === 1);

    expect(tabNames(fixture)).toEqual(tabs);
    expect(terminalCount(fixture, 'feature')).toBe('2');
  });

  it('refits the terminal grid when the row is resized', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');
    await waitFor(() => /[$#%]/.test(paneText(fixture!)));

    const pane = fixture.nativeElement.querySelector('[data-testid="terminal-pane"]') as HTMLElement;
    pane.style.width = '1000px';
    const split = fixture.nativeElement.querySelector('[data-testid="terminal-split"]') as HTMLElement;
    dragDivider(split, { x: 400, y: 3000 }, { x: 400, y: 0 });
    fixture.detectChanges();
    await waitFor(() => gridRows(fixture!.nativeElement) > 1);
    const mid = gridRows(fixture.nativeElement);

    dragDivider(split, { x: 400, y: 2000 }, { x: 400, y: 0 });
    fixture.detectChanges();
    await waitFor(() => gridRows(fixture!.nativeElement) > mid);
    const tall = gridRows(fixture.nativeElement);

    dragDivider(split, { x: 400, y: 0 }, { x: 400, y: 2000 });
    fixture.detectChanges();
    await waitFor(() => gridRows(fixture!.nativeElement) < tall);
  });

  it('runs an in-app shell in the worktree when tmux is not installed', async () => {
    const repo = createRepo();
    root = repo.root;
    const worktree = join(repo.repo, '.workspaces', 'feature');
    before = listTmuxSessions();
    fixture = await renderWorkspace(repo.repo, 'linux', false);

    expect(fixture.nativeElement.querySelector('[data-testid="terminal-row"]')).toBeNull();
    clickBranch(fixture, 'feature');
    clickControl(fixture, 'New');

    await waitFor(() => /[$#%]/.test(paneText(fixture!)));
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-row"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-header"]')).not.toBeNull();
    expect(visiblePaneCount(fixture)).toBe(1);
    expect(tabNames(fixture)).toHaveLength(1);
    expect(controlButton(fixture, 'New')?.getAttribute('aria-label')).toBe('New');
    expect(controlButton(fixture, 'Split')?.getAttribute('aria-label')).toBe('Split');
    expect(controlButton(fixture, 'Kill')?.getAttribute('aria-label')).toBe('Kill');
    expect(terminalCount(fixture, 'feature')).toBe('1');

    submitCommand(fixture.nativeElement, 'pwd');
    await waitFor(() => paneText(fixture!).includes(worktree));
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([]);
    expect(sessionsForBranch(repo.repo, 'master')).toEqual([]);
  });
});

function gridRows(root: HTMLElement): number {
  return root.querySelectorAll('[data-testid="terminal-pane"] .xterm-rows > div').length;
}

function runningCount(fixture: ComponentFixture<WorkspaceComponent>): string | null {
  const count = fixture.nativeElement.querySelector('[data-testid="terminal-running-count"]');
  if (!count) {
    return null;
  }
  const text = count.textContent?.trim() ?? '';
  return text.length === 0 ? null : text;
}

function collapseLabel(fixture: ComponentFixture<WorkspaceComponent>): string | null {
  return fixture.nativeElement.querySelector('[data-testid="terminal-collapse"]')?.getAttribute('aria-label') ?? null;
}

function clickCollapse(fixture: ComponentFixture<WorkspaceComponent>): void {
  const button = fixture.nativeElement.querySelector('[data-testid="terminal-collapse"]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Collapse terminal is not shown');
  }
  button.click();
  fixture.detectChanges();
}

function contentRightGap(element: HTMLElement, sheet: HTMLElement): number {
  const elementBox = element.getBoundingClientRect();
  const sheetBox = sheet.getBoundingClientRect();
  if (sheetBox.width > 0 && elementBox.width > 0) {
    return sheetBox.right - elementBox.right;
  }

  let gap = 0;
  let current: HTMLElement | null = element;
  while (current && current !== sheet) {
    gap += cssPx(getComputedStyle(current).marginRight);
    const parent = current.parentElement;
    if (!(parent instanceof HTMLElement)) {
      break;
    }
    const parentStyle = getComputedStyle(parent);
    gap += cssPx(parentStyle.paddingRight);
    gap += cssPx(parentStyle.borderRightWidth);
    current = parent;
  }
  return gap;
}

function cssPx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function terminalRowHeight(element: HTMLElement): number {
  const match = /(\d+)px\s*$/.exec(element.style.gridTemplateRows);
  if (!match?.[1]) {
    throw new Error(`Terminal row height is missing from ${element.style.gridTemplateRows}`);
  }
  return Number(match[1]);
}

function dragDivider(split: HTMLElement, start: { x: number; y: number }, end: { x: number; y: number }): void {
  split.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: start.x, clientY: start.y }));
  split.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: end.x, clientY: end.y }));
  split.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: end.x, clientY: end.y }));
}
