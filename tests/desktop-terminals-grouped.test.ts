import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { createBranchSession, killTmuxSession, listTmuxSessions, sessionDirectory, sessionsForBranch } from '../src/desktop/tmux-sessions';
import { setAfterPaintScheduler } from '../src/desktop/after-paint';
import { resetIdeLaunch, setIdeLaunch } from '../src/desktop/ide-launch';
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
    resetIdeLaunch();
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
    expect(prompt.tagName.toLowerCase()).toBe('svg');
    expect(prompt.getAttribute('width')).toBe('16');
    expect(prompt.getAttribute('height')).toBe('16');
    expect(prompt.querySelector('path')).not.toBeNull();
    expect(prompt.textContent.trim()).toBe('');
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
    expect((aside.querySelector('p.branch-label') as HTMLElement).hidden).toBe(true);
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

  it('groups worktrees that have a terminal by repository tab order', async () => {
    const { pier, quay } = registerGrouped(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    expect(branchNames(fixture)).toEqual(['master', 'feature']);

    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    clickIcon(fixture, 'terminal-split-button');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '2');

    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Dock');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();

    const groups = [...fixture.nativeElement.querySelectorAll('[data-testid="terminals-group"]')] as HTMLElement[];
    expect(groups.map((group) => group.getAttribute('data-name'))).toEqual(['pier', 'Quay']);
    expect(groups.map((group) => group.querySelector('[data-testid="terminals-group-name"]')?.textContent?.trim())).toEqual([
      'pier',
      'Quay',
    ]);
    const pierName = groups[0].querySelector('[data-testid="terminals-group-name"]') as HTMLElement;
    expect(getComputedStyle(pierName).textTransform).toBe('uppercase');
    expect(getComputedStyle(pierName).fontSize).toBe('10px');
    expect(getComputedStyle(pierName).letterSpacing).toBe('0.1em');
    expect(getComputedStyle(pierName).opacity).toBe('0.7');
    expect(getComputedStyle(pierName).fontFamily).toContain('JetBrains Mono');
    expect(getComputedStyle(pierName).height).toBe('28px');
    expect(getComputedStyle(pierName).margin).toBe('0px 4px 8px');
    expect(getComputedStyle(pierName).display).toBe('flex');
    expect(groups.map((group) => group.getAttribute('data-path'))).toEqual([pier, quay]);

    const pierRows = [...groups[0].querySelectorAll('[data-testid="terminals-worktree"]')] as HTMLElement[];
    expect(pierRows.map((row) => row.getAttribute('data-branch'))).toEqual(['master', 'feature']);
    expect(pierRows.map((row) => row.querySelector('[data-testid="terminal-count"]')?.textContent?.trim())).toEqual(['1', '1']);
    expect(pierRows[0].querySelector('[data-testid="status-color"]')).toBeNull();
    expect(pierRows[0].querySelector('[data-testid="changed-file-count"]')).toBeNull();
    expect(pierRows[0].querySelector('[data-testid="ahead"]')).toBeNull();
    expect(pierRows[0].querySelector('[data-testid="behind"]')).toBeNull();
    expect(pierRows[0].querySelector('[data-testid="branch-menu"]')).toBeNull();

    const quayRows = [...groups[1].querySelectorAll('[data-testid="terminals-worktree"]')] as HTMLElement[];
    expect(quayRows.map((row) => row.getAttribute('data-branch'))).toEqual(['master']);
    expect(quayRows[0].querySelector('[data-testid="terminal-count"]')?.textContent?.trim()).toBe('2');
    expect(quayRows[0].querySelector('[data-testid="terminal-count"]')?.getAttribute('aria-label')).toBe('2 terminals');
  });

  it('shows two headers when two repositories share a display name', async () => {
    const root = mkdtempSync(join(tmpdir(), 'git-worktree-manager-terminals-'));
    roots.push(root);
    const east = join(root, 'east');
    const west = join(root, 'west');
    initGitRepo(east);
    initGitRepo(west);
    writeFileSync(join(east, 'README.md'), '# east\n');
    writeFileSync(join(west, 'README.md'), '# west\n');
    execFileSync('git', ['add', '.'], { cwd: east, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: east, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: west, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: west, stdio: 'ignore' });
    process.env.GIT_WORKTREE_MANAGER_REGISTRY_PATH = join(root, 'registry.db');
    addRepository(east, 'Harbor');
    addRepository(west, 'Harbor');

    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Harbor');
    const firstPath = fixture.nativeElement.querySelector('[data-testid="repository-tab"]').getAttribute('data-path');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    openRepositoryCard(fixture);
    const remaining = fixture.nativeElement.querySelector('[data-testid="switching-overlay"] [data-testid="repository"]');
    remaining.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await whenRemoteRefreshIdle();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();

    const groups = [...fixture.nativeElement.querySelectorAll('[data-testid="terminals-group"]')] as HTMLElement[];
    expect(groups.map((group) => group.querySelector('[data-testid="terminals-group-name"]')?.textContent?.trim())).toEqual([
      'Harbor',
      'Harbor',
    ]);
    expect(new Set(groups.map((group) => group.getAttribute('data-path')))).toEqual(new Set([east, west]));
    expect(groups[0].getAttribute('data-path')).toBe(firstPath);
  });

  it('shows the chosen repository tab workspace and leaves Terminals', async () => {
    const { quay } = registerPair(roots);
    writeFileSync(
      process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH ?? '',
      '{"sidebarColor":"#065f46","sidebarText":"white","terminalRowHeight":180}\n',
    );
    mkdirSync(join(quay, '.git-worktree-manager'), { recursive: true });
    writeFileSync(
      join(quay, '.git-worktree-manager', 'config.toml'),
      ['[appearance]', 'sidebar_color = "#123456"', 'sidebar_text = "black"', ''].join('\n'),
    );
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    expect(terminalRowPixels(fixture)).toBe('180');

    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('p.branch-label') as HTMLElement).hidden).toBe(true);

    fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Pier"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-selected')).toBe('false');
    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Pier"]').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]').getAttribute('aria-selected')).toBe(
      'false',
    );
    expect(fixture.nativeElement.querySelector('p.branch-label span').textContent.trim()).toBe('Worktrees');
    expect(fixture.nativeElement.querySelector('.branch-row.is-selected')?.getAttribute('data-branch')).toBe('feature');
    expect(terminalRowPixels(fixture)).toBe('180');
    expect(getComputedStyle(fixture.nativeElement.querySelector('aside')).backgroundColor).toBe('rgb(6, 95, 70)');
    expect(getComputedStyle(fixture.nativeElement.querySelector('aside')).color).toBe('rgb(255, 255, 255)');

    fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.branch-row.is-selected')?.getAttribute('data-branch')).toBe('master');
    expect(terminalRowPixels(fixture)).toBe('180');
    expect(getComputedStyle(fixture.nativeElement.querySelector('aside')).backgroundColor).toBe('rgb(18, 52, 86)');
    expect(getComputedStyle(fixture.nativeElement.querySelector('aside')).color).toBe('rgb(0, 0, 0)');
  });

  it('leaves Terminals when a registered repository is opened from the card', async () => {
    registerPair(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => terminalsCount(fixture) === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();

    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');

    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-selected')).toBe('false');
    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(fixture.nativeElement.querySelector('p.branch-label span').textContent.trim()).toBe('Worktrees');
    expect(fixture.nativeElement.querySelector('[data-testid="terminals-list"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-branch="master"]')).not.toBeNull();
  });

  it('keeps Terminals open behind settings and updates a renamed group header', async () => {
    registerPair(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="app-settings"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="app-settings-dialog"]')).not.toBeNull();
    expect((fixture.nativeElement.querySelector('p.branch-label') as HTMLElement).hidden).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-selected')).toBe('true');
    fixture.nativeElement.querySelector('[data-testid="close-app-settings"]').click();
    fixture.detectChanges();

    const settings = openRepositoryTabMenu(fixture, 'Quay').querySelector('[data-testid="repository-tab-settings"]');
    if (!(settings instanceof HTMLElement)) {
      throw new Error('Repository settings is not in the repository tab menu');
    }
    settings.click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="repository-settings-dialog"]');
    expect(dialog).not.toBeNull();
    expect((fixture.nativeElement.querySelector('p.branch-label') as HTMLElement).hidden).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="terminals-list"]')).not.toBeNull();
    const name = dialog.querySelector('[data-testid="repository-display-name"]') as HTMLInputElement;
    name.value = 'North Quay';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const headers = [...fixture.nativeElement.querySelectorAll('[data-testid="terminals-group-name"]')].map((header) =>
      header.textContent?.trim(),
    );
    expect(headers).toEqual(['Pier', 'North Quay']);
    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-selected')).toBe('true');
  });

  it('removes a closed repository group and returns to the tab on the right when the count reaches 0', async () => {
    registerGrouped(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    const pierTerminal = fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')?.getAttribute('data-terminal-id') ?? '';

    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');

    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Dock');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    const dockTerminal = fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')?.getAttribute('data-terminal-id') ?? '';

    fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(terminalsCount(fixture)).toBe('3');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();

    openRepositoryTabMenu(fixture, 'Quay').querySelector('[data-testid="repository-tab-close"]')?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-selected')).toBe('true');
    expect(groupNames(fixture)).toEqual(['pier', 'Dock']);
    expect(terminalsCount(fixture)).toBe('2');

    killShell(pierTerminal);
    killShell(dockTerminal);
    await waitFor(() => {
      fixture.detectChanges();
      return (fixture.nativeElement.querySelector('p.branch-label') as HTMLElement | null)?.hidden === false;
    });

    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Dock"]').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="pier"]').getAttribute('aria-selected')).toBe(
      'false',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-selected')).toBe('false');
    expect(fixture.nativeElement.querySelector('.branch-row.is-selected')?.getAttribute('data-branch')).toBe('master');
  });

  it('returns to the repository tab on the left when the closed tab had no right neighbor', async () => {
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

    openRepositoryTabMenu(fixture, 'Quay').querySelector('[data-testid="repository-tab-close"]')?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-selected')).toBe('false');
    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Pier"]').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('p.branch-label span').textContent.trim()).toBe('Worktrees');
    expect(fixture.nativeElement.querySelector('[data-testid="terminals-list"]')).toBeNull();
  });

  it('shows the repository card when the last repository tab is closed from Terminals', async () => {
    registerPair(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => terminalsCount(fixture) === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();

    openRepositoryTabMenu(fixture, 'Pier').querySelector('[data-testid="repository-tab-close"]')?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="workspace"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="repository-card"]')).not.toBeNull();
  });

  it('keeps the return repository tab when a different repository tab is closed', async () => {
    registerGrouped(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');

    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    const quayTerminal = fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')?.getAttribute('data-terminal-id') ?? '';

    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Dock');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    const dockTerminal = fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')?.getAttribute('data-terminal-id') ?? '';

    fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();

    openRepositoryTabMenu(fixture, 'pier').querySelector('[data-testid="repository-tab-close"]')?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-selected')).toBe('true');
    expect(groupNames(fixture)).toEqual(['Quay', 'Dock']);

    killShell(quayTerminal);
    killShell(dockTerminal);
    await waitFor(() => {
      fixture.detectChanges();
      return (fixture.nativeElement.querySelector('p.branch-label') as HTMLElement | null)?.hidden === false;
    });

    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(fixture.nativeElement.querySelector('.branch-row.is-selected')?.getAttribute('data-branch')).toBe('master');
  });

  it('keeps the grouped list and shows the chosen worktree on a light selected row', async () => {
    const { quay } = registerPair(roots);
    writeFileSync(
      process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH ?? '',
      '{"sidebarColor":"#065f46","sidebarText":"black"}\n',
    );
    mkdirSync(join(quay, '.git-worktree-manager'), { recursive: true });
    writeFileSync(
      join(quay, '.git-worktree-manager', 'config.toml'),
      ['[appearance]', 'sidebar_color = "#123456"', 'sidebar_text = "white"', ''].join('\n'),
    );
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();

    const feature = terminalsWorktree(fixture, 'Pier', 'feature');
    feature.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="terminals-list"]')).not.toBeNull();
    expect(groupNames(fixture)).toEqual(['Pier', 'Quay']);
    expect(feature.getAttribute('aria-selected')).toBe('true');
    expect(feature.classList.contains('is-selected')).toBe(true);
    expect(getComputedStyle(feature).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(feature).color).toBe('rgb(6, 95, 70)');
    const quayRow = terminalsWorktree(fixture, 'Quay', 'master');
    expect(quayRow.getAttribute('aria-selected')).toBe('false');
    expect(quayRow.classList.contains('is-selected')).toBe(false);
  });

  it('selects the last chosen worktree again after switching repository tabs', async () => {
    registerPair(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    const featureTerminal = fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')?.getAttribute('data-terminal-id') ?? '';
    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();
    terminalsWorktree(fixture, 'Pier', 'feature').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="terminals-list"]')).toBeNull();
    const settingsPath = process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH ?? '';
    expect(readFileSync(settingsPath, 'utf8')).not.toContain('feature');

    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(terminalsWorktree(fixture, 'Pier', 'feature').getAttribute('aria-selected')).toBe('true');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')?.getAttribute('data-terminal-id')).toBe(featureTerminal);
    const heading = fixture.nativeElement.querySelector('[data-testid="branch-heading"]') as HTMLElement;
    expect(heading.querySelector('[data-testid="copy-branch-name"]')?.textContent).toContain('feature');
    expect(heading.querySelector('[data-testid="open-ide"]')).not.toBeNull();
    expect(heading.querySelector('[data-testid="heading-summary"]')).toBeNull();

    fixture.destroy();
    fixtures.splice(fixtures.indexOf(fixture), 1);
    const again = await renderLive();
    again.nativeElement.querySelector('[data-testid="terminals"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    again.detectChanges();
    expect(again.nativeElement.querySelector('[data-testid="terminals-worktree"].is-selected')).toBeNull();
  });

  it('shows the chosen worktree terminal below its branch heading, without the summary, changes, or commits', async () => {
    registerPair(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    const featureTerminal = fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')?.getAttribute('data-terminal-id') ?? '';
    expect(featureTerminal).not.toBe('');

    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    const quayTerminal = fixture.nativeElement.querySelector('[data-testid="terminal-pane"]')?.getAttribute('data-terminal-id') ?? '';
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();
    terminalsWorktree(fixture, 'Pier', 'feature').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]') as HTMLElement;
    const heading = sheet.querySelector('[data-testid="branch-heading"]') as HTMLElement;
    const body = sheet.querySelector('.sheet-body') as HTMLElement;
    expect(heading.querySelector('[data-testid="copy-branch-name"]')?.textContent).toContain('feature');
    expect(heading.querySelector('[data-testid="open-ide"]')).not.toBeNull();
    expect(heading.querySelector('[data-testid="heading-summary"]')).toBeNull();
    expect(heading.textContent).not.toContain('commits');
    expect(heading.textContent).not.toContain('changed files');
    expect(heading.nextElementSibling).toBe(body);
    expect(body.contains(heading)).toBe(false);
    expect(body.querySelector('[data-testid="terminal-row"]')).not.toBeNull();
    expect(sheet.querySelector('[data-testid="changes"]')).toBeNull();
    expect(sheet.querySelector('[data-testid="commits"]')).toBeNull();
    expect(sheet.querySelector('[data-testid="terminal-split"]')).toBeNull();
    expect(body.style.gridTemplateRows).toBe('minmax(0, 1fr)');
    expect(sheet.querySelector('[data-testid="terminal-pane"]')?.getAttribute('data-terminal-id')).toBe(featureTerminal);
    expect(sheet.querySelector(`[data-testid="terminal-pane"][data-terminal-id="${quayTerminal}"]`)).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminals-list"]')).not.toBeNull();
  });

  it('shows Run preset immediately left of Split in Terminals', async () => {
    const { pier } = registerPair(roots);
    const checkout = join(pier, '.workspaces', 'feature');
    const directory = join(checkout, '.git-worktree-manager');
    mkdirSync(directory, { recursive: true });
    mkdirSync(join(checkout, 'packages', 'api'), { recursive: true });
    writeFileSync(
      join(directory, 'terminals.toml'),
      `[[preset]]
name = "dev"

[[preset.tab]]
terminals = [
  { name = "api", command = "npm run dev", cwd = "packages/api" },
]
`,
    );
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();
    terminalsWorktree(fixture, 'Pier', 'feature').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]') as HTMLElement;
    const split = sheet.querySelector('[data-testid="terminal-split-button"]');
    const run = split?.previousElementSibling;
    expect(run).toBeInstanceOf(HTMLButtonElement);
    expect((run as HTMLButtonElement).getAttribute('aria-label')).toBe('Run preset');
    expect(sheet.querySelector('.terminal-tabs')?.nextElementSibling).toBe(run);
    expect(sheet.querySelector('[data-testid="terminal-collapse"]')).toBeNull();
  });

  it('opens the preset menu from Run preset in Terminals', async () => {
    const { pier } = registerPair(roots);
    const directory = join(pier, '.workspaces', 'feature', '.git-worktree-manager');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, 'terminals.toml'),
      `[[preset]]
name = "dev"

[[preset.tab]]
terminals = [
  { name = "api" },
]

[[preset]]
name = "test"

[[preset.tab]]
terminals = [
  { name = "unit" },
]
`,
    );
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();
    terminalsWorktree(fixture, 'Pier', 'feature').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]') as HTMLElement;
    const run = sheet.querySelector('button.terminal-run-preset');
    expect(run).toBeInstanceOf(HTMLButtonElement);
    expect((run as HTMLButtonElement).getAttribute('aria-label')).toBe('Run preset');
    (run as HTMLButtonElement).click();
    fixture.detectChanges();

    const items = [...fixture.nativeElement.querySelectorAll('[data-testid="preset-menu-item"]')] as HTMLButtonElement[];
    expect(items.map((item) => item.textContent?.trim())).toEqual(['dev', 'test']);
    expect(sheet.querySelectorAll('[data-testid="terminal-tab"]')).toHaveLength(1);

    items[1]?.click();
    fixture.detectChanges();

    const tabs = [...sheet.querySelectorAll('[data-testid="terminal-tab"]')] as HTMLElement[];
    expect(tabs).toHaveLength(2);
    expect((tabs[1]?.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe('2 unit');
    expect(fixture.nativeElement.querySelector('[data-testid="preset-menu"]')).toBeNull();
  });

  it('offers terminal tabs, New, Split, Kill, Rename, and the terminal menu, without Collapse or Restore', async () => {
    registerPair(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();
    terminalsWorktree(fixture, 'Pier', 'feature').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]') as HTMLElement;
    expect(sheet.querySelector('[data-testid="terminal-tab"]')).not.toBeNull();
    expect(sheet.querySelector('[data-testid="terminal-new"]')).not.toBeNull();
    expect(sheet.querySelector('[data-testid="terminal-split-button"]')).not.toBeNull();
    expect(sheet.querySelector('[data-testid="terminal-kill"]')).not.toBeNull();
    expect(sheet.querySelector('[data-testid="terminal-collapse"]')).toBeNull();
    expect(sheet.querySelector('[data-testid="terminal-maximize"]')).toBeNull();

    const tab = sheet.querySelector('[data-testid="terminal-tab"]') as HTMLElement;
    tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
    fixture.detectChanges();

    const menu = fixture.nativeElement.querySelector('[data-testid="terminal-menu"]');
    expect(menu).not.toBeNull();
    expect(menu.querySelector('[data-testid="terminal-rename"]')?.textContent?.trim()).toBe('Rename');
  });

  it('opens the chosen worktree from the terminals branch header', async () => {
    const launched: Array<{ command: string; cwd: string }> = [];
    setIdeLaunch((command, cwd) => {
      launched.push({ command, cwd });
    });
    const { pier } = registerPair(roots);
    const checkout = join(pier, '.workspaces', 'feature');
    writeFileSync(
      process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH ?? '',
      `${JSON.stringify({ ideCommand: 'code -n {folder}' })}\n`,
    );
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();
    terminalsWorktree(fixture, 'Pier', 'feature').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const heading = fixture.nativeElement.querySelector('[data-testid="content-sheet"] [data-testid="branch-heading"]') as HTMLElement;
    expect(heading.querySelector('[data-testid="heading-summary"]')).toBeNull();
    heading.querySelector('[data-testid="open-ide"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(launched).toEqual([{ command: `code -n '${checkout}'`, cwd: checkout }]);
  });

  it('uses the app settings terminal background, terminal foreground, and terminal font', async () => {
    registerPair(roots);
    writeFileSync(
      process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH ?? '',
      `${JSON.stringify({
        terminalBackground: '#065f46',
        terminalForeground: '#ffffff',
        terminalFont: 'JetBrains Mono',
      })}\n`,
    );
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();
    terminalsWorktree(fixture, 'Pier', 'feature').click();
    fixture.detectChanges();
    await waitFor(() => fixture.nativeElement.querySelector('.xterm-scrollable-element') !== null);
    fixture.detectChanges();

    const pane = fixture.nativeElement.querySelector('[data-testid="content-sheet"] [data-testid="terminal-pane"]') as HTMLElement;
    expect(pane.getAttribute('style') ?? '').toMatch(/background-color:\s*(#065f46|rgb\(6,\s*95,\s*70\))/);
    const surface = pane.querySelector('.xterm-scrollable-element') as HTMLElement;
    expect(surface.style.backgroundColor).toBe('rgb(6, 95, 70)');
    const styles = [...pane.querySelectorAll('style')].map((style) => style.textContent ?? '').join('\n');
    expect(styles).toContain('.xterm-rows { pointer-events: none; color: #ffffff;');
    expect(styles).toContain('font-family: JetBrains Mono, monospace;');
  });

  it('leaves the repository tab selected branch and terminal section height unchanged', async () => {
    registerPair(roots);
    writeFileSync(
      process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH ?? '',
      '{"terminalRowHeight":180}\n',
    );
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    expect(fixture.nativeElement.querySelector('.branch-row.is-selected')?.getAttribute('data-branch')).toBe('feature');
    expect(terminalRowPixels(fixture)).toBe('180');

    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    expect(fixture.nativeElement.querySelector('.branch-row.is-selected')?.getAttribute('data-branch')).toBe('master');
    expect(terminalRowPixels(fixture)).toBe('180');

    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();
    terminalsWorktree(fixture, 'Pier', 'feature').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(fixture.nativeElement.querySelector('.branch-row.is-selected')?.getAttribute('data-branch')).toBe('master');
    expect(terminalRowPixels(fixture)).toBe('180');

    fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Pier"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.branch-row.is-selected')?.getAttribute('data-branch')).toBe('feature');
    expect(terminalRowPixels(fixture)).toBe('180');
    expect(fixture.nativeElement.querySelector('[data-testid="terminal-maximize"]')?.getAttribute('aria-label')).toBe(
      'Maximize terminal',
    );
  });

  it('turns a counted tmux session into a terminal tab and keeps the focused terminal tab', async () => {
    const { pier } = registerPair(roots);
    createBranchSession(pier, 'feature', join(pier, '.workspaces', 'feature'), 1);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    expect(branchTerminalCount(fixture, 'feature')).toBe('1');
    expect(fixture.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')).toHaveLength(0);

    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => fixture.nativeElement.querySelectorAll('[data-testid="terminal-tab"]').length === 2);
    const tabs = [...fixture.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')] as HTMLElement[];
    const focusedBefore = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
    const resting = tabs.find((tab) => tab.getAttribute('aria-selected') !== 'true');
    if (!resting || !focusedBefore) {
      throw new Error('The worktree has no resting terminal tab');
    }
    resting.click();
    fixture.detectChanges();
    const focusedLabel = resting.textContent?.trim() ?? '';
    expect(focusedLabel).not.toBe('');
    expect(focusedLabel).not.toBe(focusedBefore.textContent?.trim());
    expect(branchTerminalCount(fixture, 'feature')).toBe('1');
    expect(sessionsForBranch(pier, 'feature')).toHaveLength(1);

    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();
    terminalsWorktree(fixture, 'Pier', 'feature').click();
    fixture.detectChanges();
    await waitFor(() => fixture.nativeElement.querySelectorAll('[data-testid="content-sheet"] [data-testid="terminal-tab"]').length === 1);
    fixture.detectChanges();

    expect(sessionsForBranch(pier, 'feature')).toHaveLength(1);
    expect(terminalsWorktree(fixture, 'Pier', 'feature').querySelector('[data-testid="terminal-count"]')?.textContent?.trim()).toBe('1');
    expect(fixture.nativeElement.querySelector('[data-testid="content-sheet"] [data-testid="terminal-pane"]')).not.toBeNull();

    terminalsWorktree(fixture, 'Pier', 'master').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const masterTabs = [...fixture.nativeElement.querySelectorAll('[data-testid="content-sheet"] [data-testid="terminal-tab"]')] as HTMLElement[];
    expect(masterTabs).toHaveLength(2);
    expect(masterTabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent?.trim()).toBe(focusedLabel);
  });

  it('changes the chosen worktree terminals with New, Split, Kill, and Rename', async () => {
    registerPair(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();
    terminalsWorktree(fixture, 'Pier', 'feature').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    clickIcon(fixture, 'terminal-new');
    expect(terminalsCount(fixture)).toBe('3');
    expect(terminalsWorktree(fixture, 'Pier', 'feature').querySelector('[data-testid="terminal-count"]')?.textContent?.trim()).toBe('2');
    expect(fixture.nativeElement.querySelectorAll('[data-testid="content-sheet"] [data-testid="terminal-tab"]')).toHaveLength(2);

    clickIcon(fixture, 'terminal-split-button');
    expect(terminalsCount(fixture)).toBe('4');
    expect(terminalsWorktree(fixture, 'Pier', 'feature').querySelector('[data-testid="terminal-count"]')?.textContent?.trim()).toBe('3');

    const selected = fixture.nativeElement.querySelector(
      '[data-testid="content-sheet"] [data-testid="terminal-tab"][aria-selected="true"]',
    ) as HTMLElement;
    selected.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 48, clientY: 48 }));
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="terminal-rename"]').click();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('[data-testid="terminal-name-input"]') as HTMLInputElement;
    input.value = 'harbor';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(
      fixture.nativeElement
        .querySelector('[data-testid="content-sheet"] [data-testid="terminal-tab"][aria-selected="true"]')
        ?.textContent?.trim(),
    ).toContain('harbor');
    expect(terminalsWorktree(fixture, 'Pier', 'feature').querySelector('[data-testid="terminal-count"]')?.textContent?.trim()).toBe('3');

    clickIcon(fixture, 'terminal-kill');
    expect(terminalsCount(fixture)).toBe('3');
    expect(terminalsWorktree(fixture, 'Pier', 'feature').querySelector('[data-testid="terminal-count"]')?.textContent?.trim()).toBe('2');

    fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Pier"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.branch-row.is-selected')?.getAttribute('data-branch')).toBe('feature');
    expect(branchTerminalCount(fixture, 'feature')).toBe('2');
    expect(
      [...fixture.nativeElement.querySelectorAll('[data-testid="terminal-tab"]')].some((tab) =>
        tab.textContent?.includes('harbor'),
      ),
    ).toBe(true);
  });

  it('clears the sheet when the chosen worktree loses its last terminal and other terminals remain', async () => {
    registerPair(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'master') === '1');
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();
    terminalsWorktree(fixture, 'Pier', 'feature').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    clickIcon(fixture, 'terminal-kill');

    expect((fixture.nativeElement.querySelector('p.branch-label') as HTMLElement).hidden).toBe(true);
    expect(groupNames(fixture)).toEqual(['Quay']);
    expect(fixture.nativeElement.querySelector('[data-testid="terminals-worktree"][data-branch="feature"]')).toBeNull();
    expect(terminalsCount(fixture)).toBe('1');
    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]') as HTMLElement;
    expect(sheet.textContent?.trim()).toBe('');
    expect(sheet.querySelector('[data-testid="terminal-row"], .branch-heading, [data-testid="changes"], [data-testid="commits"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="terminals-worktree"][aria-selected="true"]')).toBeNull();
    expect(terminalsWorktree(fixture, 'Quay', 'master').getAttribute('aria-selected')).toBe('false');
  });

  it('returns to the remembered repository tab when the last terminal ends', async () => {
    registerPair(roots);
    const fixture = await renderLive();
    await openLiveRepository(fixture, 'Pier');
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();
    clickIcon(fixture, 'terminal-new');
    await waitFor(() => branchTerminalCount(fixture, 'feature') === '1');
    openRepositoryCard(fixture);
    await openLiveRepository(fixture, 'Quay');
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    expect(branchTerminalCount(fixture, 'master')).toBeNull();
    fixture.nativeElement.querySelector('[data-testid="terminals"]').click();
    fixture.detectChanges();
    terminalsWorktree(fixture, 'Pier', 'feature').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    clickIcon(fixture, 'terminal-kill');

    expect(fixture.nativeElement.querySelector('[data-testid="terminals"]').getAttribute('aria-selected')).toBe('false');
    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Quay"]').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="repository-tab"][data-name="Pier"]').getAttribute('aria-selected')).toBe(
      'false',
    );
    expect(fixture.nativeElement.querySelector('p.branch-label span')?.textContent?.trim()).toBe('Worktrees');
    expect(fixture.nativeElement.querySelector('[data-testid="terminals-list"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.branch-row.is-selected')?.getAttribute('data-branch')).toBe('master');
    expect(terminalsCount(fixture)).toBe('0');
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

function terminalRowPixels(fixture: ComponentFixture<WorkspaceComponent>): string {
  const body = fixture.nativeElement.querySelector('.sheet-body') as HTMLElement | null;
  const match = /(\d+)px\s*$/.exec(body?.style.gridTemplateRows ?? '');
  return match?.[1] ?? '';
}

function terminalsWorktree(fixture: ComponentFixture<WorkspaceComponent>, repository: string, branch: string): HTMLElement {
  const group = fixture.nativeElement.querySelector(`[data-testid="terminals-group"][data-name="${repository}"]`);
  const row = group?.querySelector(`[data-testid="terminals-worktree"][data-branch="${branch}"]`);
  if (!(row instanceof HTMLElement)) {
    throw new Error(`${repository} ${branch} is not in the grouped list`);
  }
  return row;
}

function groupNames(fixture: ComponentFixture<WorkspaceComponent>): string[] {
  return [...fixture.nativeElement.querySelectorAll('[data-testid="terminals-group"]')].map(
    (group) => (group as HTMLElement).getAttribute('data-name') ?? '',
  );
}

function branchNames(fixture: ComponentFixture<WorkspaceComponent>): string[] {
  return [...fixture.nativeElement.querySelectorAll('[data-testid="branch-row"]')].map(
    (row) => (row as HTMLElement).getAttribute('data-branch') ?? '',
  );
}

function registerGrouped(roots: string[]): { pier: string; quay: string; dock: string } {
  const root = mkdtempSync(join(tmpdir(), 'git-worktree-manager-terminals-'));
  roots.push(root);
  const pier = join(root, 'pier');
  const quay = join(root, 'quay');
  const dock = join(root, 'dock');
  initGitRepo(pier);
  initGitRepo(quay);
  initGitRepo(dock);
  writeFileSync(join(pier, 'README.md'), '# pier\n');
  writeFileSync(join(quay, 'README.md'), '# quay\n');
  writeFileSync(join(dock, 'README.md'), '# dock\n');
  for (const repoPath of [pier, quay, dock]) {
    execFileSync('git', ['add', '.'], { cwd: repoPath, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: repoPath, stdio: 'ignore' });
  }
  mkdirSync(join(pier, '.workspaces'));
  execFileSync('git', ['branch', 'feature'], { cwd: pier, stdio: 'ignore' });
  execFileSync('git', ['worktree', 'add', join(pier, '.workspaces', 'feature'), 'feature'], {
    cwd: pier,
    stdio: 'ignore',
  });
  process.env.GIT_WORKTREE_MANAGER_REGISTRY_PATH = join(root, 'registry.db');
  addRepository(pier, 'pier');
  addRepository(quay, 'Quay');
  addRepository(dock, 'Dock');
  return { pier, quay, dock };
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
