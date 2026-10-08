import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { createBranchSession, killTmuxSession, listTmuxSessions, sessionDirectory } from '../src/desktop/tmux-sessions';
import { setAfterPaintScheduler } from '../src/desktop/after-paint';
import { whenRemoteRefreshIdle } from '../src/branches';
import { killShell } from '../src/desktop/shell-host';
import { WorkspaceComponent } from '../src/desktop/workspace.component';
import { addRepository } from '../src/registry';

const emptyGitConfig = join(tmpdir(), 'git-worktree-manager-desktop-gitconfig');
writeFileSync(emptyGitConfig, '');
process.env.GIT_CONFIG_GLOBAL = emptyGitConfig;
process.env.GIT_CONFIG_SYSTEM = emptyGitConfig;
process.env.GIT_TERMINAL_PROMPT = '0';

describe('Terminals on the grouped worktrees', () => {
  const roots: string[] = [];
  const fixtures: ComponentFixture<WorkspaceComponent>[] = [];
  const previousRegistryPath = process.env.GIT_WORKTREE_MANAGER_REGISTRY_PATH;
  const previousAppSettingsPath = process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH;
  let restoreSearch: (() => void) | undefined;

  beforeEach(() => {
    const settingsRoot = mkdtempSync(join(tmpdir(), 'git-worktree-manager-terminals-settings-'));
    roots.push(settingsRoot);
    process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH = join(settingsRoot, 'app-settings.json');
  });

  afterEach(() => {
    setAfterPaintScheduler((task) => {
      task();
    });
    restoreSearch?.();
    restoreSearch = undefined;
    if (previousRegistryPath === undefined) {
      delete process.env.GIT_WORKTREE_MANAGER_REGISTRY_PATH;
    } else {
      process.env.GIT_WORKTREE_MANAGER_REGISTRY_PATH = previousRegistryPath;
    }
    if (previousAppSettingsPath === undefined) {
      delete process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH;
    } else {
      process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH = previousAppSettingsPath;
    }
    for (const fixture of fixtures.splice(0)) {
      fixture.destroy();
    }
    const removing = roots.splice(0);
    for (const name of listTmuxSessions()) {
      const directory = sessionDirectory(name);
      if (removing.some((root) => directory.startsWith(root))) {
        killTmuxSession(name);
      }
    }
    for (const root of removing) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  async function setupWorkspace(apply?: (fixture: ComponentFixture<WorkspaceComponent>) => void) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [WorkspaceComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixtures.push(fixture);
    apply?.(fixture);
    fixture.detectChanges();
    await fixture.whenStable();
    await whenRemoteRefreshIdle();
    fixture.detectChanges();
    return fixture;
  }

  function render() {
    return setupWorkspace();
  }

  async function renderLive() {
    if (restoreSearch === undefined) {
      const previousSearch = location.search;
      history.replaceState(null, '', `${location.pathname}?live=1`);
      restoreSearch = () => {
        history.replaceState(null, '', `${location.pathname}${previousSearch}`);
      };
    }
    return setupWorkspace();
  }

  function openRepositoryCard(fixture: ComponentFixture<WorkspaceComponent>): void {
    const button = fixture.nativeElement.querySelector('[data-testid="open-repository-card"]');
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('Open repository is not shown');
    }
    button.click();
    fixture.detectChanges();
  }

  function openRepositoryTabMenu(fixture: ComponentFixture<WorkspaceComponent>, name: string): HTMLElement {
    const tab = fixture.nativeElement.querySelector(`[data-testid="repository-tab"][data-name="${name}"]`);
    if (!(tab instanceof HTMLElement)) {
      throw new Error(`${name} has no repository tab`);
    }
    tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 24, clientY: 16 }));
    fixture.detectChanges();
    const menu = fixture.nativeElement.querySelector('[data-testid="repository-tab-menu"]');
    if (!(menu instanceof HTMLElement)) {
      throw new Error('The repository tab menu is not open');
    }
    return menu;
  }

  async function openLiveRepository(fixture: ComponentFixture<WorkspaceComponent>, name: string): Promise<void> {
    const overlay = fixture.nativeElement.querySelector('[data-testid="switching-overlay"]');
    const scope = overlay instanceof HTMLElement ? overlay : fixture.nativeElement;
    const button = scope.querySelector(`[data-testid="repository"][data-name="${name}"]`);
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`${name} is not on the repository card`);
    }
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await whenRemoteRefreshIdle();
    fixture.detectChanges();
  }

  function renderRepository(repoPath: string) {
    if (!process.env.GIT_WORKTREE_MANAGER_REGISTRY_PATH) {
      process.env.GIT_WORKTREE_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    }
    return setupWorkspace((fixture) => {
      fixture.componentRef.setInput('repositoryPath', repoPath);
    });
  }

  it('pins Terminals to the left of the scrolling repository tabs, after the app mark', async () => {
    const repoPath = createRepository(roots);
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    const title = fixture.nativeElement.querySelector('.window-title');
    const mark = title.querySelector('[data-testid="app-mark"]');
    const terminals = title.querySelector('[data-testid="terminals"]');
    const tabs = title.querySelector('[data-testid="repository-tabs"]');

    expect(title.firstElementChild).toBe(mark);
    expect(mark.nextElementSibling).toBe(terminals);
    expect(terminals.nextElementSibling).toBe(tabs);
    expect(tabs.contains(terminals)).toBe(false);
    expect(['auto', 'scroll']).toContain(getComputedStyle(tabs).overflowX);
    expect(getComputedStyle(terminals).flexGrow).toBe('0');
    expect(getComputedStyle(terminals).flexShrink).toBe('0');
    expect(getComputedStyle(terminals).getPropertyValue('-webkit-app-region')).toBe('no-drag');
  });

  it('keeps Terminals off the repository card', async () => {
    const start = await render();
    const card = start.nativeElement.querySelector('[data-testid="repository-card"]');

    expect(start.nativeElement.querySelector('[data-testid="terminals"]')).toBeNull();
    expect(card.querySelector('[data-testid="terminals"]')).toBeNull();

    start.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    start.detectChanges();
    start.nativeElement.querySelector('[data-testid="open-repository-card"]').click();
    start.detectChanges();

    const overlayCard = start.nativeElement.querySelector(
      '[data-testid="switching-overlay"] [data-testid="repository-card"]',
    );
    expect(overlayCard.querySelector('[data-testid="terminals"]')).toBeNull();
    expect(start.nativeElement.querySelector('[data-testid="window-bar"] [data-testid="terminals"]')).not.toBeNull();
  });

  it('shows a black Terminals chip with a white prompt, a white count, and an accessible name', async () => {
    const repoPath = createRepository(roots);
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);
    const chip = fixture.nativeElement.querySelector('[data-testid="terminals"]');
    const prompt = chip.querySelector('[data-testid="terminals-prompt"]');
    const count = chip.querySelector('[data-testid="terminals-count"]');

    expect(getComputedStyle(chip).backgroundColor).toBe('rgb(0, 0, 0)');
    expect(prompt.textContent.trim()).toBe('>');
    expect(getComputedStyle(prompt).color).toBe('rgb(255, 255, 255)');
    expect(count.textContent.trim()).toBe('0');
    expect(getComputedStyle(count).color).toBe('rgb(255, 255, 255)');
    expect(chip.getAttribute('aria-label')).toBe('0 terminals');
  });

  it('keeps a zero Terminals count visible, dimmed, and inert', async () => {
    const repoPath = createRepository(roots);
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);
    const chip = fixture.nativeElement.querySelector('[data-testid="terminals"]') as HTMLButtonElement;

    expect(chip.querySelector('[data-testid="terminals-count"]').textContent.trim()).toBe('0');
    expect(getComputedStyle(chip).opacity).toBe('0.4');
    expect(getComputedStyle(chip).cursor).toBe('default');
    expect(terminalsHoverRule()).toBe(false);

    chip.click();
    chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    chip.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    fixture.detectChanges();

    expect(chip.getAttribute('aria-selected')).not.toBe('true');
    expect(fixture.nativeElement.querySelector('p.branch-label span').textContent.trim()).toBe('Worktrees');
  });

  it('counts each shell on the open repository tab', async () => {
    const repoPath = createRepository(roots);
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');

    const chip = fixture.nativeElement.querySelector('[data-testid="terminals"]');
    expect(chip.querySelector('[data-testid="terminals-count"]').textContent.trim()).toBe('1');
    expect(chip.getAttribute('aria-label')).toBe('1 terminals');
    expect(getComputedStyle(chip).opacity).toBe('1');
    expect(getComputedStyle(chip).cursor).toBe('pointer');
    expect(
      fixture.nativeElement.querySelector('[data-branch="master"] [data-testid="terminal-count"]').textContent.trim(),
    ).toBe('1');
  });

  it('counts a split terminal tab as two shells', async () => {
    const repoPath = createRepository(roots);
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '2');

    expect(fixture.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')).toHaveLength(1);
    expect(terminalsCount(fixture)).toBe('2');
    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-label')).toBe('2 terminals');
  });

  it('counts a shell on a repository tab that is not selected', async () => {
    registerPair(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');

    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');

    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(terminalsCount(fixture)).toBe('1');
    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-label')).toBe('1 terminals');

    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    expect(terminalsCount(fixture)).toBe('2');
  });

  it('counts a tmux session that is not yet a terminal tab', async () => {
    const { pier } = registerPair(roots);
    createBranchSession(pier, 'feature', join(pier, '.workspaces', 'feature'), 1);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');

    expect(branchTerminalCount(fixture, 'feature')).toBe('1');
    expect(branchTerminalCount(fixture, 'master')).toBeNull();
    expect(terminalsCount(fixture)).toBe('1');
    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-label')).toBe('1 terminals');
    expect(fixture.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')).toHaveLength(0);
  });

  it('drops the count when a repository tab is closed', async () => {
    const { pier } = registerPair(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    expect(terminalsCount(fixture)).toBe('1');

    openRepositoryTabMenu(fixture, 'Pier').querySelector('[data-testid="repository-tab-close"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector(`[data-testid="repository-tab"][data-path="${pier}"]`)).toBeNull();
    expect(terminalsCount(fixture)).toBe('0');
    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-label')).toBe('0 terminals');
    expect(getComputedStyle(fixture.nativeElement.querySelector('[data-testid="terminals"]')).opacity).toBe('0.4');
  });

  it('drops the count when a shell ends on a repository tab that is not selected', async () => {
    registerPair(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    const pane = fixture.nativeElement.querySelector('[data-testid="terminal-pane"]');
    const terminalId = pane?.getAttribute('data-terminal-id') ?? '';
    expect(terminalId).not.toBe('');

    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    expect(terminalsCount(fixture)).toBe('1');

    killShell(terminalId);
    await waitFor(() => {
      fixture.detectChanges();
      return terminalsCount(fixture) === '0';
    });

    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(terminalsCount(fixture)).toBe('0');
    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-label')).toBe('0 terminals');
  });

  it('selects Terminals with a white frame and leaves every repository tab unselected', async () => {
    registerPair(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => terminalsCount(fixture) === '1');

    const chip = fixture.nativeElement.querySelector('[data-testid="terminals"]') as HTMLButtonElement;
    chip.click();
    fixture.detectChanges();

    expect(chip.getAttribute('aria-selected')).toBe('true');
    expect(getComputedStyle(chip).outline).toBe('2px solid #ffffff');
    expect(getComputedStyle(chip).outlineOffset).toBe('-2px');
    const tabs = [...fixture.nativeElement.querySelectorAll('[data-testid="repository-tab"]')] as HTMLElement[];
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'false']);
    expect(tabs.map((tab) => getComputedStyle(tab).outline)).toEqual(['none', 'none']);

    chip.click();
    fixture.detectChanges();
    expect(chip.getAttribute('aria-selected')).toBe('true');
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'false']);
  });

  it('opens no context menu for Terminals', async () => {
    const repoPath = createRepository(roots);
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => terminalsCount(fixture) === '1');

    const chip = fixture.nativeElement.querySelector('[data-testid="terminals"]') as HTMLButtonElement;
    const menuEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 12 });
    chip.dispatchEvent(menuEvent);
    fixture.detectChanges();

    expect(menuEvent.defaultPrevented).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="terminals-menu"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab-menu"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-menu"]')).toBeNull();
  });

  it('selects the last repository tab on the next launch and leaves Terminals unselected', async () => {
    registerPair(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => terminalsCount(fixture) === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-selected')).toBe('true');

    fixture.destroy();
    fixtures.splice(fixtures.indexOf(fixture), 1);

    const again = await renderLive();
    expect(again.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(again.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Pier"]').getAttribute('aria-selected')).toBe(
      'false',
    );
    expect(again.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-selected')).toBe('false');
    expect(again.nativeElement.querySelector('p.branch-label span').textContent.trim()).toBe('Worktrees');
  });

  it('shows Terminals in the app settings colors with an empty content sheet', async () => {
    const { quay } = registerPair(roots);
    writeFileSync(
      process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH ?? '',
      '{"sidebarColor":"#065f46","sidebarText":"black","contentColor":"#abcdef"}\n',
    );
    mkdirSync(join(quay, '.git-worktree-manager'), { recursive: true });
    writeFileSync(
      join(quay, '.git-worktree-manager', 'config.toml'),
      ['[appearance]', 'sidebar_color = "#123456"', 'sidebar_text = "white"', ''].join('\n'),
    );
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => terminalsCount(fixture) === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();

    const aside = fixture.nativeElement.querySelector('aside');
    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]');
    expect(aside.querySelector('p.branch-label span').textContent.trim()).toBe('Terminals');
    expect(aside.querySelector('[data-testid="repository-settings"]')).toBeNull();
    expect(aside.querySelector('[data-testid="create-worktree"]')).toBeNull();
    expect(getComputedStyle(aside).backgroundColor).toBe('rgb(6, 95, 70)');
    expect(getComputedStyle(aside).color).toBe('rgb(0, 0, 0)');
    expect(getComputedStyle(fixture.nativeElement).backgroundColor).toBe('rgb(6, 95, 70)');
    expect(getComputedStyle(fixture.nativeElement.querySelector('[data-testid="window-minimize"]')).color).toBe('rgb(0, 0, 0)');
    const quayTab = fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]');
    expect(getComputedStyle(quayTab).backgroundColor).toBe('rgb(18, 52, 86)');
    expect(getComputedStyle(quayTab).color).toBe('rgb(255, 255, 255)');
    expect(sheet.textContent.trim()).toBe('');
    expect(sheet.querySelector('[data-testid="branch-heading"], h2, [data-testid="changes"]')).toBeNull();
    expect(getComputedStyle(sheet).backgroundColor).toBe('rgb(171, 205, 239)');
  });
});

function clickIcon(fixture: ComponentFixture<WorkspaceComponent>, testId: string): void {
  const button = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${testId} is not shown`);
  }
  button.click();
  fixture.detectChanges();
}

function terminalsCount(fixture: ComponentFixture<WorkspaceComponent>): string {
  return fixture.nativeElement.querySelector('[data-testid="terminals-count"]')?.textContent?.trim() ?? '';
}

function branchTerminalCount(fixture: ComponentFixture<WorkspaceComponent>, name: string): string | null {
  const count = fixture.nativeElement
    .querySelector(`[data-testid="branch-row"][data-branch="${name}"]`)
    ?.querySelector('[data-testid="terminal-count"]');
  if (!count) {
    return null;
  }
  const text = count.textContent?.trim() ?? '';
  return text.length === 0 ? null : text;
}

async function waitFor(check: () => boolean): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out waiting for Terminals');
}

function terminalsHoverRule(): boolean {
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
      if (!(rule instanceof CSSStyleRule)) {
        continue;
      }
      if (rule.selectorText.includes('terminals') && rule.selectorText.includes(':hover')) {
        return true;
      }
    }
  }
  return false;
}

function registerPair(roots: string[]): { pier: string; quay: string } {
  const root = mkdtempSync(join(tmpdir(), 'git-worktree-manager-terminals-'));
  roots.push(root);
  const pier = join(root, 'pier');
  const quay = join(root, 'quay');
  initGitRepo(pier);
  initGitRepo(quay);
  writeFileSync(join(pier, 'README.md'), '# pier\n');
  writeFileSync(join(quay, 'README.md'), '# quay\n');
  execFileSync('git', ['add', '.'], { cwd: pier, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: pier, stdio: 'ignore' });
  execFileSync('git', ['add', '.'], { cwd: quay, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: quay, stdio: 'ignore' });
  mkdirSync(join(pier, '.workspaces'));
  execFileSync('git', ['branch', 'feature'], { cwd: pier, stdio: 'ignore' });
  execFileSync('git', ['worktree', 'add', join(pier, '.workspaces', 'feature'), 'feature'], { cwd: pier, stdio: 'ignore' });
  process.env.GIT_WORKTREE_MANAGER_REGISTRY_PATH = join(root, 'registry.db');
  addRepository(pier, 'Pier');
  addRepository(quay, 'Quay');
  return { pier, quay };
}

function initGitRepo(repoPath: string): void {
  mkdirSync(repoPath, { recursive: true });
  execFileSync('git', ['init', '-b', 'master'], { cwd: repoPath, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'git-worktree-manager test'], { cwd: repoPath, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@git-worktree-manager.local'], { cwd: repoPath, stdio: 'ignore' });
}

function createRepository(roots: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'git-worktree-manager-terminals-'));
  roots.push(root);
  const repoPath = join(root, 'harbor');
  mkdirSync(repoPath, { recursive: true });
  execFileSync('git', ['init', '-b', 'master'], { cwd: repoPath, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'git-worktree-manager test'], { cwd: repoPath, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@git-worktree-manager.local'], { cwd: repoPath, stdio: 'ignore' });
  writeFileSync(join(repoPath, 'README.md'), '# harbor\n');
  execFileSync('git', ['add', '.'], { cwd: repoPath, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoPath, stdio: 'ignore' });
  return repoPath;
}
