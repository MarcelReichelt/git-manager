import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  killTmuxSession,
  listTmuxSessions,
  sessionDirectory,
  sessionsForBranch,
  tmuxBinary,
} from '../src/desktop/tmux-sessions';
import { WorkspaceComponent } from '../src/desktop/workspace.component';

const emptyGitConfig = join(tmpdir(), 'git-worktree-manager-desktop-tabs-gitconfig');
writeFileSync(emptyGitConfig, '');
process.env.GIT_CONFIG_GLOBAL = emptyGitConfig;
process.env.GIT_CONFIG_SYSTEM = emptyGitConfig;
process.env.GIT_TERMINAL_PROMPT = '0';

function createRepo(): { root: string; repo: string } {
  const root = mkdtempSync(join(tmpdir(), 'git-worktree-manager-tabs-'));
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
  return Array.from(tabs, (tab) => tabLabel(tab as HTMLElement));
}

function tabLabel(tab: HTMLElement): string {
  const label = tab.querySelector('[data-testid="terminal-tab-label"]');
  const source = label instanceof HTMLElement ? label : tab;
  return (source.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function clickTab(fixture: ComponentFixture<WorkspaceComponent>, index: number): void {
  const tab = fixture.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')[index];
  if (!(tab instanceof HTMLElement)) {
    throw new Error(`Tab ${index + 1} is not shown`);
  }
  tab.click();
  fixture.detectChanges();
}

function clickIcon(fixture: ComponentFixture<WorkspaceComponent>, testId: string): void {
  const button = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${testId} is not shown`);
  }
  button.click();
  fixture.detectChanges();
}

function rightClick(element: Element): void {
  element.dispatchEvent(
    new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 48, clientY: 64 }),
  );
}

function dismissMenu(fixture: ComponentFixture<WorkspaceComponent>): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  fixture.detectChanges();
}

function paneTextarea(fixture: ComponentFixture<WorkspaceComponent>, terminalId: string): HTMLTextAreaElement {
  const pane = fixture.nativeElement.querySelector(
    `[data-testid="terminal-pane"][data-terminal-id="${terminalId}"]`,
  );
  const textarea = pane?.querySelector('textarea');
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error(`Terminal ${terminalId} has no caret`);
  }
  return textarea;
}

function menuButtons(fixture: ComponentFixture<WorkspaceComponent>): HTMLButtonElement[] {
  const menu = fixture.nativeElement.querySelector('[data-testid="terminal-menu"]');
  if (!(menu instanceof HTMLElement)) {
    return [];
  }
  return Array.from(menu.querySelectorAll('button')) as HTMLButtonElement[];
}

function moveTargetLabels(fixture: ComponentFixture<WorkspaceComponent>): string[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll('[data-testid="terminal-menu-move-target"]'),
    (button) => (button.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

function paneHeaders(fixture: ComponentFixture<WorkspaceComponent>): string[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll('[data-testid="terminal-pane-header"]'),
    (header) => {
      const name = (header as HTMLElement).querySelector('.terminal-pane-name');
      const source = name instanceof HTMLElement ? name : (header as HTMLElement);
      return (source.textContent ?? '').replace(/\s+/g, ' ').trim();
    },
  );
}

function terminalCount(fixture: ComponentFixture<WorkspaceComponent>, name: string): string | null {
  const row = fixture.nativeElement.querySelector(`[data-testid="branch-row"][data-branch="${name}"]`);
  const count = row?.querySelector('[data-testid="terminal-count"]');
  if (!count) {
    return null;
  }
  const text = count.textContent?.trim() ?? '';
  return text.length === 0 ? null : text;
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

function paneCommand(session: string): string {
  return execFileSync(tmuxBinary(), ['display-message', '-p', '-t', session, '#{pane_current_command}'], {
    encoding: 'utf8',
    env: tmuxEnv(),
  }).trim();
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

function submitCommand(textarea: HTMLTextAreaElement, command: string): void {
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

function firstTextarea(fixture: ComponentFixture<WorkspaceComponent>, index = 0): HTMLTextAreaElement {
  const textarea = fixture.nativeElement.querySelectorAll('.terminal-pane textarea')[index];
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error('The terminal pane is not accepting input');
  }
  return textarea;
}

async function waitFor(check: () => boolean, timeout = 8000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out waiting for the terminal');
}

function renameFrom(fixture: ComponentFixture<WorkspaceComponent>, target: Element, name: string): void {
  rightClick(target);
  fixture.detectChanges();
  const rename = fixture.nativeElement.querySelector('[data-testid="terminal-rename"]');
  if (!(rename instanceof HTMLButtonElement)) {
    throw new Error('Rename is not shown');
  }
  rename.click();
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector('[data-testid="terminal-name-input"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('The name field is not shown');
  }
  input.value = name;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  fixture.detectChanges();
}

function useTmuxMode(root: string): void {
  const settingsPath = join(root, 'app-settings.json');
  writeFileSync(settingsPath, '{"terminalMode":"tmux"}\n');
  process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH = settingsPath;
}

describe('terminal tabs', () => {
  let root = '';
  let settingsRoot = '';
  let fixture: ComponentFixture<WorkspaceComponent> | undefined;
  const previousSettingsPath = process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH;

  beforeEach(() => {
    TestBed.resetTestingModule();
    settingsRoot = mkdtempSync(join(tmpdir(), 'git-worktree-manager-tabs-settings-'));
    process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH = join(settingsRoot, 'app-settings.json');
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

  it('shows New, Split, and Kill as icon buttons and numbers the tab with the process name', async () => {
    const repo = createRepo();
    root = repo.root;
    useTmuxMode(root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 1);

    for (const [testId, label] of [
      ['terminal-split-button', 'Split'],
      ['terminal-new', 'New'],
      ['terminal-kill', 'Kill'],
    ] as const) {
      const button = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement;
      expect(button.getAttribute('title')).toBe(label);
      expect(button.getAttribute('aria-label')).toBe(label);
      expect(button.querySelector('svg')).not.toBeNull();
      expect(button.textContent?.trim()).toBe('');
    }

    const session = sessionsForBranch(repo.repo, 'feature')[0] ?? '';
    const command = paneCommand(session);
    expect(command.length).toBeGreaterThan(0);
    expect(tabNames(fixture)).toEqual([`1 ${command}`]);
    const tab = fixture.nativeElement.querySelector('[data-testid="terminal-tab"]') as HTMLElement;
    expect(tab.getAttribute('title')).toBe('tmux session');

    clickIcon(fixture, 'terminal-new');
    expect(collapseLabel(fixture)).toBe('Collapse terminal');
    clickIcon(fixture, 'terminal-split-button');
    expect(collapseLabel(fixture)).toBe('Collapse terminal');
    clickCollapse(fixture);
    expect(collapseLabel(fixture)).toBe('Expand terminal');
  });

  it('adds a tab at the end, and New on a collapsed header expands the row', async () => {
    const repo = createRepo();
    root = repo.root;
    useTmuxMode(root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => /^\d+ \S+/.test(tabNames(fixture!)[0] ?? ''));
    const first = tabNames(fixture)[0] ?? '';

    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 2);
    expect(tabNames(fixture)[0]).toBe(first);
    expect(tabNames(fixture)[1]).toMatch(/^2 \S+/);
    expect(sessionsForBranch(repo.repo, 'feature')).toHaveLength(2);

    clickCollapse(fixture);
    expect(collapseLabel(fixture)).toBe('Expand terminal');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 3);
    expect(collapseLabel(fixture)).toBe('Collapse terminal');
    expect(tabNames(fixture)[2]).toMatch(/^3 \S+/);
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).not.toBeNull();
  });

  it('splits the current tab side by side and disables Split when the tab already has two', async () => {
    const repo = createRepo();
    root = repo.root;
    useTmuxMode(root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 1);
    const original = sessionsForBranch(repo.repo, 'feature')[0] ?? '';

    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 2);

    const row = fixture.nativeElement.querySelector('[data-testid="terminal-row"]') as HTMLElement;
    const panes = row.querySelectorAll('[data-testid="terminal-pane"]');
    const split = row.querySelector('[data-testid="terminal-pane-split"]') as HTMLElement;
    expect(panes).toHaveLength(2);
    expect(split.getAttribute('role')).toBe('separator');
    expect(split.getAttribute('aria-orientation')).toBe('vertical');
    expect(panes[0]?.compareDocumentPosition(split) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(split.compareDocumentPosition(panes[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getComputedStyle(split.parentElement as HTMLElement).display).toBe('flex');
    const splitButton = fixture.nativeElement.querySelector(
      '[data-testid="terminal-split-button"]',
    ) as HTMLButtonElement;
    expect(splitButton.disabled).toBe(true);

    const added = sessionsForBranch(repo.repo, 'feature').find((name) => name !== original) ?? '';
    (panes[0] as HTMLElement).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-kill');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 1);
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([added]);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="terminal-pane"]')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane-split"]')).toBeNull();
  });

  it('sets the two shells to half and half when their divider is double-clicked', async () => {
    const repo = createRepo();
    root = repo.root;
    useTmuxMode(root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 1);

    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 2);

    const split = fixture.nativeElement.querySelector('[data-testid="terminal-pane-split"]') as HTMLElement;
    Object.defineProperty(split.parentElement as HTMLElement, 'clientWidth', { configurable: true, value: 200 });
    const settingsPath = process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH ?? '';
    const before = readFileSync(settingsPath, 'utf8');
    split.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    split.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 100, clientY: 0 }));
    split.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 100, clientY: 0 }));
    fixture.detectChanges();

    const columns = () =>
      [...fixture!.nativeElement.querySelectorAll('.terminal-pane-column')] as HTMLElement[];
    expect(columns()[0]?.style.flexGrow).toBe('0.8');
    expect(readFileSync(settingsPath, 'utf8')).toBe(before);

    split.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();

    expect(columns().map((column) => column.style.flexGrow)).toEqual(['0.5', '0.5']);
    expect(readFileSync(settingsPath, 'utf8')).toBe(before);
  });

  it('keeps moving the split when the pointer leaves the splitter', async () => {
    const repo = createRepo();
    root = repo.root;
    useTmuxMode(root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 1);

    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 2);

    const split = fixture.nativeElement.querySelector('[data-testid="terminal-pane-split"]') as HTMLElement;
    Object.defineProperty(split.parentElement as HTMLElement, 'clientWidth', { configurable: true, value: 200 });
    const settingsPath = process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH ?? '';
    const before = readFileSync(settingsPath, 'utf8');
    split.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 0, pointerId: 1 }));
    document.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 150, clientY: 40, pointerId: 1 }),
    );
    fixture.detectChanges();

    const columns = [...fixture.nativeElement.querySelectorAll('.terminal-pane-column')] as HTMLElement[];
    expect(columns.map((column) => column.style.flexGrow)).toEqual(['0.75', '0.25']);
    expect(readFileSync(settingsPath, 'utf8')).toBe(before);
  });

  it('stops moving the split when the pointer button is released away from the splitter', async () => {
    const repo = createRepo();
    root = repo.root;
    useTmuxMode(root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 1);

    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 2);

    const split = fixture.nativeElement.querySelector('[data-testid="terminal-pane-split"]') as HTMLElement;
    Object.defineProperty(split.parentElement as HTMLElement, 'clientWidth', { configurable: true, value: 200 });
    const settingsPath = process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH ?? '';
    const before = readFileSync(settingsPath, 'utf8');
    split.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 0, pointerId: 1 }));
    document.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 150, clientY: 40, pointerId: 1 }),
    );
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 150, clientY: 40, pointerId: 1 }));
    document.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 180, clientY: 40, pointerId: 1 }),
    );
    fixture.detectChanges();

    const columns = [...fixture.nativeElement.querySelectorAll('.terminal-pane-column')] as HTMLElement[];
    expect(columns.map((column) => column.style.flexGrow)).toEqual(['0.75', '0.25']);
    expect(readFileSync(settingsPath, 'utf8')).toBe(before);

    split.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    expect(columns.map((column) => column.style.flexGrow)).toEqual(['0.5', '0.5']);
    expect(readFileSync(settingsPath, 'utf8')).toBe(before);
  });

  it('counts both terminals in a split tab and hides the count at zero', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => terminalCount(fixture!, 'feature') === '1');

    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => terminalCount(fixture!, 'feature') === '2');
    expect(tabNames(fixture)).toHaveLength(1);

    clickCollapse(fixture);
    expect(runningCount(fixture)).toBe('2');
    expect(terminalCount(fixture, 'feature')).toBe('2');

    clickIcon(fixture, 'terminal-kill');
    clickIcon(fixture, 'terminal-kill');
    await waitFor(() => terminalCount(fixture!, 'feature') === null);
    expect(runningCount(fixture)).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-count"]')).toBeNull();
  });

  it('offers Rename, Kill, and Split on a one-terminal tab', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!)[0] === '1 bash');

    const tab = fixture.nativeElement.querySelector('[data-testid="terminal-tab"]') as HTMLElement;
    const gap = tab.querySelector('.terminal-tab-gap') as HTMLElement;
    expect(getComputedStyle(gap).whiteSpace).toBe('pre');
    rightClick(tab);
    fixture.detectChanges();

    expect(menuButtons(fixture).map((button) => button.textContent?.trim())).toEqual(['Rename', 'Kill', 'Split']);
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-menu-unsplit"]')).toBeNull();
    const split = fixture.nativeElement.querySelector('[data-testid="terminal-menu-split"]') as HTMLButtonElement;
    expect(split.disabled).toBe(false);
  });

  it('offers terminal actions inside a split and tab actions on the split chip', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 1);
    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2);

    const header = fixture.nativeElement.querySelector('[data-testid="terminal-pane-header"]') as HTMLElement;
    rightClick(header);
    fixture.detectChanges();
    expect(menuButtons(fixture).map((button) => button.textContent?.trim())).toEqual([
      'Rename',
      'Kill',
      'Split',
      'Unsplit',
    ]);
    expect(
      (fixture.nativeElement.querySelector('[data-testid="terminal-menu-split"]') as HTMLButtonElement).disabled,
    ).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-menu"]')).toBeNull();

    const tab = fixture.nativeElement.querySelector('[data-testid="terminal-tab"]') as HTMLElement;
    rightClick(tab);
    fixture.detectChanges();
    expect(menuButtons(fixture).map((button) => button.textContent?.trim())).toEqual(['Rename', 'Kill']);
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-menu-split"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-menu-unsplit"]')).toBeNull();
  });

  it('closes a terminal, its tab, and the row, and Kill on a split tab kills both', async () => {
    const repo = createRepo();
    root = repo.root;
    useTmuxMode(root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => /^\d+ \S+/.test(tabNames(fixture!)[0] ?? ''));
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 2);
    renameFrom(fixture, fixture.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')[0]!, 'one');
    renameFrom(fixture, fixture.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')[1]!, 'two');
    expect(tabNames(fixture)).toEqual(['1 one', '2 two']);

    clickTab(fixture, 0);
    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2);
    expect(sessionsForBranch(repo.repo, 'feature')).toHaveLength(3);

    const tab = fixture.nativeElement.querySelector('[data-testid="terminal-tab"]') as HTMLElement;
    rightClick(tab);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="terminal-menu-kill"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    await waitFor(() => sessionsForBranch(repo.repo, 'feature').length === 1);
    expect(tabNames(fixture)).toEqual(['1 two']);
    expect(collapseLabel(fixture)).toBe('Collapse terminal');

    clickIcon(fixture, 'terminal-kill');
    await waitFor(() => terminalCount(fixture!, 'feature') === null);
    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-header"]')).not.toBeNull();
  });

  it('moves an unsplit terminal into the following tab and renumbers', async () => {
    const repo = createRepo();
    root = repo.root;
    useTmuxMode(root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => /^\d+ \S+/.test(tabNames(fixture!)[0] ?? ''));
    renameFrom(fixture, fixture.nativeElement.querySelector('[data-testid="terminal-tab"]')!, 'left');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 2);
    renameFrom(fixture, fixture.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')[1]!, 'right');
    clickTab(fixture, 0);
    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2);
    expect(tabNames(fixture)[0]).toMatch(/^1 left · /);
    expect(tabNames(fixture)[1]).toBe('2 right');

    const headers = fixture.nativeElement.querySelectorAll('[data-testid="terminal-pane-header"]');
    rightClick(headers[1]!);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="terminal-menu-unsplit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(tabNames(fixture)).toEqual(['1 left', expect.stringMatching(/^2 \S+$/), '3 right']);
    expect(tabNames(fixture)[1]).not.toBe('2 right');
    const selected = fixture.nativeElement.querySelector('[data-testid="terminal-tab"][aria-selected="true"]');
    expect(selected instanceof HTMLElement ? tabLabel(selected) : '').toBe(tabNames(fixture)[1]);
    expect(paneHeaders(fixture)).toEqual([]);
    expect(sessionsForBranch(repo.repo, 'feature')).toHaveLength(3);
  });

  it('follows the running command and shows both names on a split tab', async () => {
    const repo = createRepo();
    root = repo.root;
    useTmuxMode(root);
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!)[0] === '1 bash');
    const session = sessionsForBranch(repo.repo, 'feature')[0] ?? '';

    submitCommand(firstTextarea(fixture), 'sleep 3');
    await waitFor(() => tabNames(fixture!)[0] === '1 sleep');
    expect(paneCommand(session)).toBe('sleep');
    await waitFor(() => tabNames(fixture!)[0] === '1 bash');
    expect(paneCommand(session)).toBe('bash');

    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2);
    expect(tabNames(fixture)[0]).toBe('1 bash · bash');
    expect(paneHeaders(fixture)).toEqual(['bash', 'bash']);
    expect(
      (fixture.nativeElement.querySelector('[data-testid="terminal-pane"]') as HTMLElement).getAttribute('title'),
    ).toBe('tmux session');

    submitCommand(firstTextarea(fixture, 1), 'npm exec -- sleep 3');
    await waitFor(() => paneHeaders(fixture!)[1] === 'npm' && tabNames(fixture!)[0] === '1 bash · npm', 20000);
    await waitFor(() => paneHeaders(fixture!)[1] === 'bash' && tabNames(fixture!)[0] === '1 bash · bash', 20000);
  });

  it('renames a tab, restores the process name, and keeps names across split and unsplit', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!)[0] === '1 bash');

    const tab = () => fixture!.nativeElement.querySelector('[data-testid="terminal-tab"]') as HTMLElement;
    rightClick(tab());
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-menu"]')).toBeNull();
    expect(tabNames(fixture)).toEqual(['1 bash']);

    rightClick(tab());
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="terminal-rename"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('[data-testid="terminal-name-input"]') as HTMLInputElement;
    input.value = 'nope';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(tabNames(fixture)).toEqual(['1 bash']);

    renameFrom(fixture, tab(), 'server');
    expect(tabNames(fixture)).toEqual(['1 server']);
    renameFrom(fixture, tab(), '');
    expect(tabNames(fixture)).toEqual(['1 bash']);

    renameFrom(fixture, tab(), 'server');
    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2 && tabNames(fixture!)[0] === '1 server · bash');
    expect(tabNames(fixture)).toEqual(['1 server · bash']);
    expect(paneHeaders(fixture)).toEqual(['server', 'bash']);

    renameFrom(fixture, tab(), 'pair');
    expect(tabNames(fixture)).toEqual(['1 pair']);
    expect(paneHeaders(fixture)).toEqual(['server', 'bash']);
    renameFrom(fixture, tab(), '');
    expect(tabNames(fixture)).toEqual(['1 server · bash']);

    const headers = () => fixture!.nativeElement.querySelectorAll('[data-testid="terminal-pane-header"]');
    renameFrom(fixture, headers()[1]!, 'logs');
    expect(paneHeaders(fixture)).toEqual(['server', 'logs']);
    expect(tabNames(fixture)).toEqual(['1 server · logs']);
    renameFrom(fixture, headers()[1]!, '');
    expect(paneHeaders(fixture)).toEqual(['server', 'bash']);

    renameFrom(fixture, headers()[1]!, 'logs');
    rightClick(headers()[0]!);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="terminal-menu-kill"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(tabNames(fixture)).toEqual(['1 logs']);
    expect(paneHeaders(fixture)).toEqual([]);

    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2);
    renameFrom(fixture, tab(), 'pair');
    expect(paneHeaders(fixture)[0]).toBe('logs');
    rightClick(headers()[1]!);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="terminal-menu-kill"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(tabNames(fixture)).toEqual(['1 pair']);

    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2);
    renameFrom(fixture, headers()[1]!, 'kept');
    rightClick(headers()[1]!);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="terminal-menu-unsplit"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(tabNames(fixture)[0]).toBe('1 pair');
    expect(tabNames(fixture)[1]).toBe('2 kept');
  });

  it('uses in-app shells for tabs when tmux is not installed and keeps them', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo, 'linux', false);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!)[0] === '1 bash');

    const tab = fixture.nativeElement.querySelector('[data-testid="terminal-tab"]') as HTMLElement;
    expect(tab.getAttribute('title')).toBe('in-app terminal');
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([]);

    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 2);
    expect(terminalCount(fixture, 'feature')).toBe('2');
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([]);

    const names = tabNames(fixture);
    clickCollapse(fixture);
    expect(tabNames(fixture)).toEqual(names);
    expect(runningCount(fixture)).toBe('2');

    clickBranch(fixture, 'master');
    fixture.detectChanges();
    expect(terminalCount(fixture, 'master')).toBeNull();
    expect(terminalCount(fixture, 'feature')).toBe('2');
    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(sessionsForBranch(repo.repo, 'master')).toEqual([]);

    clickBranch(fixture, 'feature');
    expect(tabNames(fixture)).toEqual(names);
    expect(terminalCount(fixture, 'feature')).toBe('2');
  });

  it('kills a tab from its button and leaves another focused tab focused', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!)[0] === '1 bash');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 2);
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 3);
    const tabs = () =>
      Array.from(fixture!.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')) as HTMLElement[];
    renameFrom(fixture, tabs()[0]!, 'one');
    renameFrom(fixture, tabs()[1]!, 'two');
    renameFrom(fixture, tabs()[2]!, 'three');
    expect(tabNames(fixture)).toEqual(['1 one', '2 two', '3 three']);

    clickTab(fixture, 1);
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs()[1]!.classList.contains('is-kill-visible')).toBe(true);
    expect(tabs()[0]!.classList.contains('is-kill-visible')).toBe(false);
    const shownKill = tabs()[1]!.querySelector('[data-testid="terminal-tab-kill"]') as HTMLElement;
    const hiddenKill = tabs()[0]!.querySelector('[data-testid="terminal-tab-kill"]') as HTMLElement;
    expect(getComputedStyle(shownKill).opacity).toBe('1');
    expect(getComputedStyle(shownKill).pointerEvents).toBe('auto');
    expect(getComputedStyle(hiddenKill).opacity).toBe('0');
    expect(getComputedStyle(hiddenKill).pointerEvents).toBe('none');

    tabs()[0]!.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(tabs()[0]!.classList.contains('is-kill-visible')).toBe(true);
    tabs()[0]!.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(tabs()[0]!.classList.contains('is-kill-visible')).toBe(false);

    (tabs()[2]!.querySelector('[data-testid="terminal-tab-kill"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(tabNames(fixture)).toEqual(['1 one', '2 two']);
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');

    (tabs()[1]!.querySelector('[data-testid="terminal-tab-kill"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(tabNames(fixture)).toEqual(['1 one']);
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');

    (tabs()[0]!.querySelector('[data-testid="terminal-tab-kill"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-tab"]')).toBeNull();
    expect(collapseLabel(fixture)).toBe('Expand terminal');
    expect(terminalCount(fixture, 'feature')).toBeNull();
  });

  it('outlines a split name and kills only the pane under its button', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!)[0] === '1 bash');
    const tab = () => fixture!.nativeElement.querySelector('[data-testid="terminal-tab"]') as HTMLElement;
    expect(tab().querySelector('[data-testid="terminal-tab-name"]')).toBeNull();

    renameFrom(fixture, tab(), 'left');
    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2 && tabNames(fixture!)[0] === '1 left · bash');
    const headers = () =>
      Array.from(fixture!.nativeElement.querySelectorAll('[data-testid="terminal-pane-header"]')) as HTMLElement[];
    renameFrom(fixture, headers()[1]!, 'right');
    expect(tabNames(fixture)).toEqual(['1 left · right']);
    const names = () => Array.from(tab().querySelectorAll('[data-testid="terminal-tab-name"]')) as HTMLElement[];
    expect(names().map((name) => name.textContent ?? '')).toEqual(['left', 'right']);

    names()[0]!.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(names()[0]!.classList.contains('is-pointed')).toBe(true);
    expect(getComputedStyle(names()[0]!).borderTopWidth).toBe('1px');
    expect(getComputedStyle(names()[0]!).borderTopColor).toBe('rgb(204, 204, 204)');
    names()[0]!.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(names()[0]!.classList.contains('is-pointed')).toBe(false);
    expect(getComputedStyle(names()[0]!).borderTopColor).toBe('rgba(0, 0, 0, 0)');

    rightClick(names()[1]!);
    fixture.detectChanges();
    expect(menuButtons(fixture).map((button) => button.textContent?.trim())).toEqual([
      'Rename',
      'Kill',
      'Split',
      'Unsplit',
    ]);
    expect(
      (fixture.nativeElement.querySelector('[data-testid="terminal-menu-split"]') as HTMLButtonElement).disabled,
    ).toBe(true);
    dismissMenu(fixture);

    rightClick(tab().querySelector('[data-testid="terminal-tab-index"]')!);
    fixture.detectChanges();
    expect(menuButtons(fixture).map((button) => button.textContent?.trim())).toEqual(['Rename', 'Kill']);
    dismissMenu(fixture);

    rightClick(tab().querySelector('[data-testid="terminal-tab-separator"]')!);
    fixture.detectChanges();
    expect(menuButtons(fixture).map((button) => button.textContent?.trim())).toEqual(['Rename', 'Kill']);
    dismissMenu(fixture);

    const leftName = names()[0]!;
    const rightName = names()[1]!;
    leftName.click();
    fixture.detectChanges();
    expect(tab().getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(paneTextarea(fixture, leftName.getAttribute('data-terminal-id') ?? ''));
    rightName.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(paneTextarea(fixture, rightName.getAttribute('data-terminal-id') ?? ''));

    (tab().querySelector('[data-testid="terminal-tab-index"]') as HTMLElement).click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-kill');
    expect(tabNames(fixture)).toEqual(['1 left']);
    expect(paneHeaders(fixture)).toEqual([]);

    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2 && tabNames(fixture!)[0] === '1 left · bash');
    const leftHeader = fixture.nativeElement.querySelector('[data-testid="terminal-pane-header"]') as HTMLElement;
    expect(leftHeader.classList.contains('is-kill-visible')).toBe(false);
    leftHeader.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(leftHeader.classList.contains('is-kill-visible')).toBe(true);
    const paneKill = leftHeader.querySelector('[data-testid="terminal-pane-kill"]') as HTMLElement;
    expect(getComputedStyle(paneKill).opacity).toBe('1');
    (paneKill as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(paneHeaders(fixture)).toEqual([]);
    expect(tabNames(fixture)).toEqual(['1 bash']);
  });

  it('keeps a custom split label as one target and drops a rename draft from Kill', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!)[0] === '1 bash');
    const tab = () => fixture!.nativeElement.querySelector('[data-testid="terminal-tab"]') as HTMLElement;
    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2);
    const headers = () =>
      Array.from(fixture!.nativeElement.querySelectorAll('[data-testid="terminal-pane-header"]')) as HTMLElement[];
    renameFrom(fixture, headers()[0]!, 'alpha');
    renameFrom(fixture, headers()[1]!, 'beta');
    expect(tabNames(fixture)).toEqual(['1 alpha · beta']);
    renameFrom(fixture, tab(), 'pair');
    expect(tabNames(fixture)).toEqual(['1 pair']);
    expect(tab().querySelector('[data-testid="terminal-tab-name"]')).toBeNull();
    expect(paneHeaders(fixture)).toEqual(['alpha', 'beta']);

    rightClick(tab());
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="terminal-rename"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(tab().classList.contains('is-kill-visible')).toBe(true);
    expect(tab().querySelector('[data-testid="terminal-tab-kill"]')).not.toBeNull();
    const input = fixture.nativeElement.querySelector('[data-testid="terminal-name-input"]') as HTMLInputElement;
    input.value = 'nope';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    rightClick(tab().querySelector('[data-testid="terminal-tab-kill"]')!);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-name-input"]')).toBeNull();
    expect(tabNames(fixture)).toEqual(['1 pair']);
    expect(menuButtons(fixture).map((button) => button.textContent?.trim())).toEqual(['Rename', 'Kill']);
    dismissMenu(fixture);

    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 2);
    const tabs = () =>
      Array.from(fixture!.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')) as HTMLElement[];
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    renameFrom(fixture, tabs()[0]!, '');
    expect(tabNames(fixture)[0]).toBe('1 alpha · beta');
    rightClick(tabs()[0]!.querySelector('[data-testid="terminal-tab-name"]')!);
    fixture.detectChanges();
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    expect(menuButtons(fixture).map((button) => button.textContent?.trim())).toEqual([
      'Rename',
      'Kill',
      'Split',
      'Unsplit',
      tabNames(fixture)[1],
    ]);
    expect(
      fixture.nativeElement.querySelector('[data-testid="terminal-menu-move-label"]')?.textContent?.trim(),
    ).toBe('Move to');
    dismissMenu(fixture);

    const alpha = tabs()[0]!.querySelectorAll('[data-testid="terminal-tab-name"]')[0] as HTMLElement;
    alpha.click();
    fixture.detectChanges();
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(paneTextarea(fixture, alpha.getAttribute('data-terminal-id') ?? ''));
    clickIcon(fixture, 'terminal-kill');
    expect(tabNames(fixture)[0]).toBe('1 beta');
    expect(paneHeaders(fixture)).toEqual([]);
  });

  it('keeps an empty split name as its own target', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!)[0] === '1 bash');
    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2 && tabNames(fixture!)[0] === '1 bash · bash');
    fixture.componentInstance.terminalsByBranch.update((current) => {
      const state = current.feature;
      const open = state?.tabs[0];
      if (!state || !open) {
        return current;
      }
      return {
        ...current,
        feature: {
          ...state,
          tabs: state.tabs.map((item) =>
            item.id === open.id
              ? {
                  ...item,
                  customName: '',
                  terminals: item.terminals.map((terminal, index) =>
                    index === 0 ? { ...terminal, customName: '', command: '' } : terminal,
                  ),
                }
              : item,
          ),
        },
      };
    });
    fixture.detectChanges();
    const names = fixture.nativeElement.querySelectorAll('[data-testid="terminal-tab-name"]');
    expect(names).toHaveLength(2);
    expect(names[0]?.textContent).toBe('');
    expect((names[0] as HTMLElement).getAttribute('data-terminal-id')).not.toBe(
      (names[1] as HTMLElement).getAttribute('data-terminal-id'),
    );
    const label = fixture.nativeElement.querySelector('[data-testid="terminal-tab-label"]') as HTMLElement;
    expect(label.textContent).toBe('1  · bash');
  });

  it('lists the other single-terminal tabs of this worktree under Move to', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!)[0] === '1 bash');
    const tabs = () =>
      Array.from(fixture!.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')) as HTMLElement[];
    renameFrom(fixture, tabs()[0]!, 'alpha');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 2);
    renameFrom(fixture, tabs()[1]!, 'beta');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 3);
    renameFrom(fixture, tabs()[2]!, 'gamma');

    clickBranch(fixture, 'master');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!)[0] === '1 bash');
    renameFrom(fixture, tabs()[0]!, 'other');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 2);
    renameFrom(fixture, tabs()[1]!, 'extra');

    clickBranch(fixture, 'feature');
    expect(tabNames(fixture)).toEqual(['1 alpha', '2 beta', '3 gamma']);
    rightClick(tabs()[0]!);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="terminal-menu-move-label"]')?.textContent?.trim(),
    ).toBe('Move to');
    expect(moveTargetLabels(fixture)).toEqual(['2 beta', '3 gamma']);

    dismissMenu(fixture);
    rightClick(tabs()[1]!);
    fixture.detectChanges();
    expect(moveTargetLabels(fixture)).toEqual(['1 alpha', '3 gamma']);

    dismissMenu(fixture);
    clickTab(fixture, 1);
    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2);
    rightClick(tabs()[0]!);
    fixture.detectChanges();
    expect(moveTargetLabels(fixture)).toEqual(['3 gamma']);

    dismissMenu(fixture);
    rightClick(fixture.nativeElement.querySelector('[data-testid="terminal-pane-header"]')!);
    fixture.detectChanges();
    expect(moveTargetLabels(fixture)).toEqual(['1 alpha', '3 gamma']);

    dismissMenu(fixture);
    rightClick(tabs()[1]!);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-menu-move"]')).toBeNull();
    expect(menuButtons(fixture).map((button) => button.textContent?.trim())).toEqual(['Rename', 'Kill']);

    dismissMenu(fixture);
    clickBranch(fixture, 'master');
    rightClick(tabs()[0]!);
    fixture.detectChanges();
    expect(moveTargetLabels(fixture)).toEqual(['2 extra']);
  });

  it('moves a single terminal onto the right of the chosen tab', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!)[0] === '1 bash');
    const tabs = () =>
      Array.from(fixture!.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')) as HTMLElement[];
    renameFrom(fixture, tabs()[0]!, 'server');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 2);
    renameFrom(fixture, tabs()[1]!, 'logs');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 3);
    renameFrom(fixture, tabs()[2]!, 'build');
    expect(tabNames(fixture)).toEqual(['1 server', '2 logs', '3 build']);

    clickTab(fixture, 0);
    rightClick(tabs()[0]!);
    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector(
      '[data-testid="terminal-menu-move-target"]',
    ) as HTMLButtonElement;
    expect(target.textContent?.trim()).toBe('2 logs');
    target.click();
    fixture.detectChanges();

    expect(tabNames(fixture)).toEqual(['1 logs · server', '2 build']);
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(paneHeaders(fixture)).toEqual(['logs', 'server']);
    expect(
      Array.from(tabs()[0]!.querySelectorAll('[data-testid="terminal-tab-name"]'), (name) => name.textContent),
    ).toEqual(['logs', 'server']);
    expect(tabs()[0]!.querySelector('[data-testid="terminal-tab-text"]')).toBeNull();
    expect(terminalCount(fixture, 'feature')).toBe('3');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-menu"]')).toBeNull();
  });

  it('keeps the other terminal when a split terminal moves into a tab', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!)[0] === '1 bash');
    const tabs = () =>
      Array.from(fixture!.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')) as HTMLElement[];
    renameFrom(fixture, tabs()[0]!, 'left');
    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2 && tabNames(fixture!)[0] === '1 left · bash');
    const headers = () =>
      Array.from(fixture!.nativeElement.querySelectorAll('[data-testid="terminal-pane-header"]')) as HTMLElement[];
    renameFrom(fixture, headers()[1]!, 'right');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 2);
    renameFrom(fixture, tabs()[1]!, 'logs');
    expect(tabNames(fixture)).toEqual(['1 left · right', '2 logs']);

    clickTab(fixture, 0);
    rightClick(headers()[1]!);
    fixture.detectChanges();
    expect(moveTargetLabels(fixture)).toEqual(['2 logs']);
    (fixture.nativeElement.querySelector('[data-testid="terminal-menu-move-target"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(tabNames(fixture)).toEqual(['1 left', '2 logs · right']);
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    expect(paneHeaders(fixture)).toEqual(['logs', 'right']);
    expect(tabs()[0]!.querySelector('[data-testid="terminal-tab-name"]')).toBeNull();
    expect(tabs()[1]!.querySelector('[data-testid="terminal-tab-text"]')).toBeNull();
    expect(terminalCount(fixture, 'feature')).toBe('3');
  });

  it('keeps a split tab name on the terminal that stays, as after Unsplit', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!)[0] === '1 bash');
    const tabs = () =>
      Array.from(fixture!.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')) as HTMLElement[];
    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2);
    renameFrom(fixture, tabs()[0]!, 'pair');
    const headers = () =>
      Array.from(fixture!.nativeElement.querySelectorAll('[data-testid="terminal-pane-header"]')) as HTMLElement[];
    renameFrom(fixture, headers()[1]!, 'kept');
    expect(paneHeaders(fixture)).toEqual(['bash', 'kept']);
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 2);
    renameFrom(fixture, tabs()[1]!, 'dest');
    expect(tabNames(fixture)[0]).toBe('1 pair');

    clickTab(fixture, 0);
    rightClick(headers()[1]!);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="terminal-menu-move-target"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(tabNames(fixture)).toEqual(['1 pair', '2 dest · kept']);
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    expect(paneHeaders(fixture)).toEqual(['dest', 'kept']);
    clickTab(fixture, 0);
    expect(paneHeaders(fixture)).toEqual([]);
    expect(tabNames(fixture)[0]).toBe('1 pair');
  });

  it('hides Move to when no single-terminal tab can take this terminal', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!)[0] === '1 bash');
    const tabs = () =>
      Array.from(fixture!.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')) as HTMLElement[];

    rightClick(tabs()[0]!);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-menu-move"]')).toBeNull();
    expect(menuButtons(fixture).map((button) => button.textContent?.trim())).toEqual(['Rename', 'Kill', 'Split']);
    dismissMenu(fixture);

    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2);
    rightClick(fixture.nativeElement.querySelector('[data-testid="terminal-pane-header"]')!);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-menu-move"]')).toBeNull();
    dismissMenu(fixture);

    clickIcon(fixture, 'terminal-new');
    await waitFor(() => tabNames(fixture!).length === 2);
    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => paneHeaders(fixture!).length === 2 && tabNames(fixture!)[1] === '2 bash · bash');
    rightClick(fixture.nativeElement.querySelector('[data-testid="terminal-pane-header"]')!);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-menu-move"]')).toBeNull();
    dismissMenu(fixture);

    rightClick(tabs()[0]!.querySelector('[data-testid="terminal-tab-name"]')!);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-menu-move"]')).toBeNull();
  });
});
