import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

const emptyGitConfig = join(tmpdir(), 'git-manager-desktop-tabs-gitconfig');
writeFileSync(emptyGitConfig, '');
process.env.GIT_CONFIG_GLOBAL = emptyGitConfig;
process.env.GIT_CONFIG_SYSTEM = emptyGitConfig;
process.env.GIT_TERMINAL_PROMPT = '0';

function createRepo(): { root: string; repo: string } {
  const root = mkdtempSync(join(tmpdir(), 'git-manager-tabs-'));
  const repo = join(root, 'billing');
  mkdirSync(repo);
  execFileSync('git', ['init', '-b', 'master'], { cwd: repo, stdio: 'ignore' });
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
  return Array.from(tabs, (tab) => (tab as HTMLElement).textContent?.trim() ?? '');
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

function menuButtons(fixture: ComponentFixture<WorkspaceComponent>): HTMLButtonElement[] {
  const menu = fixture.nativeElement.querySelector('[data-testid="terminal-menu"]');
  if (!(menu instanceof HTMLElement)) {
    return [];
  }
  return Array.from(menu.querySelectorAll('button')) as HTMLButtonElement[];
}

function paneHeaders(fixture: ComponentFixture<WorkspaceComponent>): string[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll('[data-testid="terminal-pane-header"]'),
    (header) => (header as HTMLElement).textContent?.trim() ?? '',
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

describe('terminal tabs', () => {
  let root = '';
  let fixture: ComponentFixture<WorkspaceComponent> | undefined;

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    if (root) {
      for (const name of listTmuxSessions()) {
        if (sessionDirectory(name).startsWith(root)) {
          killTmuxSession(name);
        }
      }
      rmSync(root, { recursive: true, force: true });
      root = '';
    }
  });

  it('shows New, Split, and Kill as icon buttons and numbers the tab with the process name', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
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
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
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
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
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

  it('counts both terminals in a split tab and hides the count at zero', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
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
    await waitFor(() => tabNames(fixture!).length === 1);

    const tab = fixture.nativeElement.querySelector('[data-testid="terminal-tab"]') as HTMLElement;
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
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
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
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
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
    expect(selected?.textContent?.trim()).toBe(tabNames(fixture)[1]);
    expect(paneHeaders(fixture)).toEqual([]);
    expect(sessionsForBranch(repo.repo, 'feature')).toHaveLength(3);
  });

  it('follows the running command and shows both names on a split tab', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
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
    await waitFor(() => paneHeaders(fixture!)[1] === 'npm' && tabNames(fixture!)[0] === '1 bash · npm', 12000);
    await waitFor(() => paneHeaders(fixture!)[1] === 'bash' && tabNames(fixture!)[0] === '1 bash · bash', 12000);
  });

  it('renames a tab, restores the process name, and keeps names across split and unsplit', async () => {
    const repo = createRepo();
    root = repo.root;
    fixture = await renderWorkspace(repo.repo);
    clickBranch(fixture, 'feature');
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
    await waitFor(() => paneHeaders(fixture!).length === 2);
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
    await waitFor(() => terminalCount(fixture!, 'master') === '1');
    expect(terminalCount(fixture, 'feature')).toBe('2');
    expect(collapseLabel(fixture)).toBe('Expand terminal');

    clickBranch(fixture, 'feature');
    expect(tabNames(fixture)).toEqual(names);
    expect(terminalCount(fixture, 'feature')).toBe('2');
  });
});
