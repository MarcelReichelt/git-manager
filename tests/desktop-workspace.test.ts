import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { killTmuxSession, listTmuxSessions, sessionDirectory } from '../src/desktop/tmux-sessions';
import { resetFolderBrowser, setFolderBrowser } from '../src/desktop/folder-browser';
import { resetTextCopy, setTextCopy } from '../src/desktop/copy-text';
import { resetWindowChrome, setWindowChrome } from '../src/desktop/window-chrome';
import { WorkspaceComponent } from '../src/desktop/workspace.component';
import { addRepository } from '../src/registry';

const emptyGitConfig = join(tmpdir(), 'git-manager-desktop-gitconfig');
writeFileSync(emptyGitConfig, '');
process.env.GIT_CONFIG_GLOBAL = emptyGitConfig;
process.env.GIT_CONFIG_SYSTEM = emptyGitConfig;
process.env.GIT_TERMINAL_PROMPT = '0';

describe('desktop workspace', () => {
  const roots: string[] = [];
  const previousRegistryPath = process.env.GIT_MANAGER_REGISTRY_PATH;
  let restoreSearch: (() => void) | undefined;

  afterEach(() => {
    resetFolderBrowser();
    resetTextCopy();
    resetWindowChrome();
    restoreSearch?.();
    restoreSearch = undefined;
    if (previousRegistryPath === undefined) {
      delete process.env.GIT_MANAGER_REGISTRY_PATH;
    } else {
      process.env.GIT_MANAGER_REGISTRY_PATH = previousRegistryPath;
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

  async function setupWorkspace(
    apply?: (fixture: ComponentFixture<WorkspaceComponent>) => void,
  ) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [WorkspaceComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(WorkspaceComponent);
    apply?.(fixture);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function render() {
    return setupWorkspace();
  }

  async function renderLive() {
    const previousSearch = location.search;
    history.replaceState(null, '', `${location.pathname}?live=1`);
    restoreSearch = () => {
      history.replaceState(null, '', `${location.pathname}${previousSearch}`);
    };
    return setupWorkspace();
  }

  function renderRepository(repoPath: string) {
    if (!process.env.GIT_MANAGER_REGISTRY_PATH) {
      process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    }
    return setupWorkspace((fixture) => {
      fixture.componentRef.setInput('repositoryPath', repoPath);
    });
  }

  it('shows a centered repository card and no branch list on first start', async () => {
    const fixture = await render();
    const card = fixture.nativeElement.querySelector('[data-testid="repository-card"]');

    expect(card).not.toBeNull();
    const frame = getComputedStyle(card.parentElement);
    expect(frame.display).toBe('flex');
    expect(frame.justifyContent).toBe('center');
    expect(frame.alignItems).toBe('center');
    expect(fixture.nativeElement.querySelector('[data-testid="branch-list"]')).toBeNull();

    const names = [...card.querySelectorAll('[data-testid="repository"]')].map((element) =>
      element.getAttribute('data-name'),
    );
    expect(names).toEqual(['Harbor', 'Atlas']);
    expect(card.textContent).toContain('Harbor');
    expect(card.textContent).toContain('Atlas');
  });

  it('shows the Harbor workspace after choosing Harbor', async () => {
    const fixture = await render();
    const harbor = fixture.nativeElement.querySelector(
      '[data-testid="repository"][data-name="Harbor"]',
    );

    harbor.click();
    fixture.detectChanges();

    const workspace = fixture.nativeElement.querySelector('[data-testid="workspace"]');
    expect(workspace).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="repository-name"]').textContent).toContain(
      'Harbor',
    );
  });

  it('switches from Harbor to Atlas through a centered repository overlay', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="switch-repository"]').click();
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('[data-testid="switching-overlay"]');
    expect(overlay).not.toBeNull();
    const card = overlay.querySelector('[data-testid="repository-card"]');
    const frame = getComputedStyle(card.parentElement);
    expect(frame.display).toBe('flex');
    expect(frame.justifyContent).toBe('center');
    expect(frame.alignItems).toBe('center');
    const names = [...card.querySelectorAll('[data-testid="repository"]')].map((element) =>
      element.getAttribute('data-name'),
    );
    expect(names).toEqual(['Harbor', 'Atlas']);

    overlay.querySelector('[data-testid="repository"][data-name="Atlas"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="repository-name"]').textContent).toContain(
      'Atlas',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="switching-overlay"]')).toBeNull();
  });

  it('closes the repository switcher from the card without changing the open repository', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="switch-repository"]').click();
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('[data-testid="switching-overlay"]');
    const close = overlay.querySelector('[data-testid="close-repository-switcher"]');
    expect(close.textContent.trim()).toBe('Close');

    close.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="switching-overlay"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="repository-name"]').textContent).toContain(
      'Harbor',
    );
    expect(branchNames(fixture)).toEqual([
      'feature/login',
      'wip',
      'origin/release',
      'abandoned',
      'rename-docs',
    ]);
  });

  it('closes the repository switcher when the overlay outside the card is clicked', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="switch-repository"]').click();
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('[data-testid="switching-overlay"]');
    overlay.querySelector('[data-testid="repository-card"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="switching-overlay"]')).not.toBeNull();

    overlay.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="switching-overlay"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="repository-name"]').textContent).toContain(
      'Harbor',
    );
    expect(branchNames(fixture)).toEqual([
      'feature/login',
      'wip',
      'origin/release',
      'abandoned',
      'rename-docs',
    ]);
  });

  it('closes the repository switcher when Escape is pressed', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="switch-repository"]').click();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="switching-overlay"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="repository-name"]').textContent).toContain(
      'Harbor',
    );
    expect(branchNames(fixture)).toEqual([
      'feature/login',
      'wip',
      'origin/release',
      'abandoned',
      'rename-docs',
    ]);
  });

  it('opens the workspace window without an operating-system frame', () => {
    const main = readFileSync('src/desktop/electron-main.mjs', 'utf8');
    expect(main).toContain('frame: false');
  });

  it('rounds the workspace window itself', async () => {
    const fixture = await render();
    const host = getComputedStyle(fixture.nativeElement);
    expect(Number.parseFloat(host.borderRadius)).toBeGreaterThanOrEqual(8);
    expect(host.overflow).toBe('hidden');
    expect(host.backgroundColor).toBe('rgb(26, 60, 43)');

    const main = readFileSync('src/desktop/electron-main.mjs', 'utf8');
    expect(main).toContain('frame: false');
    expect(main).toContain('transparent: true');
    expect(main).toContain('backgroundColor: \'#00000000\'');
    expect(main).toContain('roundedCorners: true');
  });

  it('minimizes, maximizes, and closes the window from the top bar', async () => {
    const actions: string[] = [];
    setWindowChrome((action) => {
      actions.push(action);
    });
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const bar = fixture.nativeElement.querySelector('[data-testid="window-bar"]');
    const aside = fixture.nativeElement.querySelector('aside');
    const minimize = bar.querySelector('[data-testid="window-minimize"]');
    const maximize = bar.querySelector('[data-testid="window-maximize"]');
    const close = bar.querySelector('[data-testid="window-close"]');
    expect(aside.contains(minimize)).toBe(false);
    expect(aside.contains(maximize)).toBe(false);
    expect(aside.contains(close)).toBe(false);

    minimize.click();
    maximize.click();
    close.click();

    expect(actions).toEqual(['minimize', 'maximize', 'close']);
  });

  it('drags the workspace window from the top bar', async () => {
    const actions: string[] = [];
    setWindowChrome((action) => {
      actions.push(action);
    });
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const bar = fixture.nativeElement.querySelector('[data-testid="window-bar"]');
    expect(getComputedStyle(bar).getPropertyValue('-webkit-app-region')).toBe('drag');

    bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 12 }));
    bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 28, clientY: 14 }));

    expect(actions).toEqual(['drag']);
  });

  it('does not drag the window from the top bar controls', async () => {
    const actions: string[] = [];
    setWindowChrome((action) => {
      actions.push(action);
    });
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const bar = fixture.nativeElement.querySelector('[data-testid="window-bar"]');
    const controls = [
      bar.querySelector('[data-testid="repository-name"]'),
      bar.querySelector('[data-testid="switch-repository"]'),
      bar.querySelector('[data-testid="repository-settings"]'),
      bar.querySelector('[data-testid="window-minimize"]'),
      bar.querySelector('[data-testid="window-maximize"]'),
      bar.querySelector('[data-testid="window-close"]'),
    ];

    for (const control of controls) {
      expect(getComputedStyle(control).getPropertyValue('-webkit-app-region')).toBe('no-drag');
      const hit = control.querySelector('svg') ?? control;
      hit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 4, clientY: 4 }));
      hit.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 24, clientY: 18 }));
    }

    expect(actions).toEqual([]);
  });

  it('puts the repository name and switcher in the top bar and leaves room for settings', async () => {
    const repoPath = createRewriteRepository(roots);
    const fixture = await renderRepository(repoPath);

    const bar = fixture.nativeElement.querySelector('[data-testid="window-bar"]');
    const aside = fixture.nativeElement.querySelector('aside');
    const name = bar.querySelector('[data-testid="repository-name"]');
    const switcher = bar.querySelector('[data-testid="switch-repository"]');
    const settings = bar.querySelector('[data-testid="repository-settings"]');
    const minimize = bar.querySelector('[data-testid="window-minimize"]');

    expect(name.textContent.trim()).toBe('harbor');
    expect(aside.querySelector('[data-testid="repository-name"]')).toBeNull();
    expect(aside.querySelector('[data-testid="switch-repository"]')).toBeNull();
    expect(aside.querySelector('.repo-path')).toBeNull();
    expect(aside.contains(minimize)).toBe(false);
    expect(getComputedStyle(bar).justifyContent).toBe('space-between');
    expect(name.compareDocumentPosition(switcher) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(switcher.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(settings.compareDocumentPosition(minimize) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(switcher.getAttribute('aria-label')).toBe('Switch repository');
    expect(switcher.querySelector('svg')).not.toBeNull();
    expect(bar.querySelector('[data-testid="repository-settings-slot"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="switching-overlay"]')).toBeNull();

    switcher.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="switching-overlay"]')).not.toBeNull();
  });

  it('shows the repository location on the name and copies that location when the name is clicked', async () => {
    const copied: string[] = [];
    setTextCopy((text) => {
      copied.push(text);
    });

    const sample = await render();
    sample.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    sample.detectChanges();
    const harbor = sample.nativeElement.querySelector('[data-testid="repository-name"]');
    expect(harbor.getAttribute('title')).toBe('');
    harbor.click();
    expect(copied).toEqual(['']);

    const repoPath = createRewriteRepository(roots);
    const opened = await renderRepository(repoPath);
    const name = opened.nativeElement.querySelector('[data-testid="repository-name"]');
    expect(name.getAttribute('title')).toBe(repoPath);
    name.click();
    expect(copied).toEqual(['', repoPath]);
  });

  it('opens repository settings from an icon button beside the repository name', async () => {
    const repoPath = createEmptyRepository(roots);
    const fixture = await renderRepository(repoPath);

    expect(fixture.nativeElement.querySelector('[data-testid="repository-settings-dialog"]')).toBeNull();

    const bar = fixture.nativeElement.querySelector('[data-testid="window-bar"]');
    const aside = fixture.nativeElement.querySelector('aside');
    const name = bar.querySelector('[data-testid="repository-name"]');
    const settings = bar.querySelector('[data-testid="repository-settings"]');

    expect(settings).not.toBeNull();
    expect(settings.tagName).toBe('BUTTON');
    expect(settings.getAttribute('aria-label')).toBe('Repository settings');
    expect(settings.querySelector('svg')).not.toBeNull();
    expect(aside.querySelector('[data-testid="repository-settings"]')).toBeNull();
    expect(bar.querySelector('[data-testid="repository-settings-slot"]')).toBeNull();
    expect(name.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    settings.click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[data-testid="repository-settings-dialog"]');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Repository settings');
    expect(dialog.querySelector('h2').textContent.trim()).toBe('Repository settings');
    const panel = dialog.querySelector('.dialog-panel');
    const panelStyle = getComputedStyle(panel);
    expect(panelStyle.backgroundColor).toBe('rgb(247, 247, 245)');
    expect(panelStyle.borderRadius).toBe('8px');
    expect(getComputedStyle(dialog.querySelector('h2')).color).toBe('rgb(26, 60, 43)');

    dialog.querySelector('[data-testid="close-repository-settings"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="repository-settings-dialog"]')).toBeNull();
  });

  it('shows the open repository location in settings', async () => {
    const repoPath = createEmptyRepository(roots);
    const opened = await renderRepository(repoPath);
    opened.nativeElement.querySelector('[data-testid="repository-settings"]').click();
    opened.detectChanges();

    const openedDialog = opened.nativeElement.querySelector('[data-testid="repository-settings-dialog"]');
    expect(openedDialog.querySelector('[data-testid="repository-location"]').textContent).toBe(repoPath);

    const root = mkdtempSync(join(tmpdir(), 'git-manager-desktop-'));
    roots.push(root);
    const pier = join(root, 'pier');
    initGitRepo(pier);
    writeFileSync(join(pier, 'README.md'), '# pier\n');
    git(pier, ['add', '.']);
    git(pier, ['commit', '-m', 'init']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(root, 'registry.db');
    addRepository(pier, 'Pier');

    const live = await renderLive();
    live.nativeElement.querySelector('[data-testid="repository"][data-name="Pier"]').click();
    live.detectChanges();
    await live.whenStable();
    live.detectChanges();
    live.nativeElement.querySelector('[data-testid="repository-settings"]').click();
    live.detectChanges();

    const dialog = live.nativeElement.querySelector('[data-testid="repository-settings-dialog"]');
    expect(dialog.querySelector('[data-testid="repository-location"]').textContent).toBe(pier);
  });

  it('lists each git remote once with its name and fetch URL', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['remote', 'add', 'upstream', 'https://example.com/upstream.git']);
    git(repoPath, ['remote', 'add', 'origin', 'https://example.com/harbor.git']);
    git(repoPath, ['remote', 'set-url', '--push', 'origin', 'https://example.com/harbor-push.git']);

    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-testid="repository-settings"]').click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[data-testid="repository-settings-dialog"]');
    const rows = [...dialog.querySelectorAll('[data-testid="remote-row"]')];
    expect(rows.map((row) => row.querySelector('[data-testid="remote-name"]')?.textContent?.trim())).toEqual([
      'origin',
      'upstream',
    ]);
    expect(rows.map((row) => row.querySelector('[data-testid="remote-url"]')?.textContent?.trim())).toEqual([
      'https://example.com/harbor.git',
      'https://example.com/upstream.git',
    ]);
  });

  it('adds a git remote by name and URL', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['remote', 'add', 'origin', 'https://example.com/harbor.git']);
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-testid="repository-settings"]').click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[data-testid="repository-settings-dialog"]');
    const nameField = dialog.querySelector('[data-testid="add-remote-name"]');
    const urlField = dialog.querySelector('[data-testid="add-remote-url"]');
    nameField.value = 'upstream';
    nameField.dispatchEvent(new Event('input'));
    urlField.value = 'https://example.com/upstream.git';
    urlField.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dialog.querySelector('[data-testid="confirm-add-remote"]').click();
    fixture.detectChanges();

    const rows = [...dialog.querySelectorAll('[data-testid="remote-row"]')];
    expect(rows.map((row) => row.getAttribute('data-name'))).toEqual(['origin', 'upstream']);
    expect(rows.map((row) => row.querySelector('[data-testid="remote-url"]')?.textContent?.trim())).toEqual([
      'https://example.com/harbor.git',
      'https://example.com/upstream.git',
    ]);
  });

  it('changes an existing remote URL', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['remote', 'add', 'origin', 'https://example.com/harbor.git']);
    git(repoPath, ['remote', 'add', 'upstream', 'https://example.com/upstream.git']);
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-testid="repository-settings"]').click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[data-testid="repository-settings-dialog"]');
    const origin = dialog.querySelector('[data-testid="remote-row"][data-name="origin"]');
    const field = origin.querySelector('[data-testid="remote-url-field"]');
    field.value = 'https://example.com/harbor-next.git';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    origin.querySelector('[data-testid="confirm-change-remote"]').click();
    fixture.detectChanges();

    const rows = [...dialog.querySelectorAll('[data-testid="remote-row"]')];
    expect(rows.map((row) => row.getAttribute('data-name'))).toEqual(['origin', 'upstream']);
    expect(rows.map((row) => row.querySelector('[data-testid="remote-url"]')?.textContent?.trim())).toEqual([
      'https://example.com/harbor-next.git',
      'https://example.com/upstream.git',
    ]);
  });

  it('removes a git remote', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['remote', 'add', 'origin', 'https://example.com/harbor.git']);
    git(repoPath, ['remote', 'add', 'upstream', 'https://example.com/upstream.git']);
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-testid="repository-settings"]').click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[data-testid="repository-settings-dialog"]');
    const upstream = dialog.querySelector('[data-testid="remote-row"][data-name="upstream"]');
    upstream.querySelector('[data-testid="remove-remote"]').click();
    fixture.detectChanges();

    const rows = [...dialog.querySelectorAll('[data-testid="remote-row"]')];
    expect(rows.map((row) => row.getAttribute('data-name'))).toEqual(['origin']);
    expect(rows.map((row) => row.querySelector('[data-testid="remote-url"]')?.textContent?.trim())).toEqual([
      'https://example.com/harbor.git',
    ]);
  });

  it('shows an error and leaves existing remotes unchanged when a remote name is rejected', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['remote', 'add', 'origin', 'https://example.com/harbor.git']);
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-testid="repository-settings"]').click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[data-testid="repository-settings-dialog"]');
    const nameField = dialog.querySelector('[data-testid="add-remote-name"]');
    const urlField = dialog.querySelector('[data-testid="add-remote-url"]');
    nameField.value = 'bad name';
    nameField.dispatchEvent(new Event('input'));
    urlField.value = 'https://example.com/other.git';
    urlField.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dialog.querySelector('[data-testid="confirm-add-remote"]').click();
    fixture.detectChanges();

    expect(dialog.querySelector('[data-testid="settings-error"]').textContent).toBe(
      "fatal: 'bad name' is not a valid remote name",
    );
    const rows = [...dialog.querySelectorAll('[data-testid="remote-row"]')];
    expect(rows.map((row) => row.getAttribute('data-name'))).toEqual(['origin']);
    expect(rows.map((row) => row.querySelector('[data-testid="remote-url"]')?.textContent?.trim())).toEqual([
      'https://example.com/harbor.git',
    ]);
  });

  it('insets the sidebar and the content sheet so the forest background shows around them', async () => {
    const fixture = await render();
    expect(fixture.nativeElement.querySelector('[data-testid="content-sheet"]')).toBeNull();

    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    expect(getComputedStyle(fixture.nativeElement).backgroundColor).toBe('rgb(26, 60, 43)');

    const sidebar = getComputedStyle(fixture.nativeElement.querySelector('aside'));
    expect(sidebar.position).toBe('fixed');
    expect(sidebar.top).toBe('52px');
    expect(sidebar.bottom).toBe('8px');
    expect(sidebar.left).toBe('8px');
    expect(sidebar.width).toBe('320px');

    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]');
    const style = getComputedStyle(sheet);
    expect(style.position).toBe('fixed');
    expect(style.top).toBe('52px');
    expect(style.right).toBe('8px');
    expect(style.bottom).toBe('8px');
    expect(style.left).toBe('336px');
  });

  it('rounds the window, sidebar, content sheet, and dialogs', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();

    expect(getComputedStyle(fixture.nativeElement).borderRadius).toBe('8px');
    expect(getComputedStyle(fixture.nativeElement.querySelector('aside')).borderRadius).toBe('8px');
    expect(getComputedStyle(fixture.nativeElement.querySelector('[data-testid="content-sheet"]')).borderRadius).toBe('8px');
    expect(
      getComputedStyle(
        fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"] .dialog-panel'),
      ).borderRadius,
    ).toBe('8px');

    const root = mkdtempSync(join(tmpdir(), 'git-manager-desktop-'));
    roots.push(root);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(root, 'registry.db');
    const live = await renderLive();
    live.nativeElement.querySelector('[data-testid="add-repository"]').click();
    live.detectChanges();
    expect(
      getComputedStyle(live.nativeElement.querySelector('[data-testid="add-repository-dialog"] .dialog-panel')).borderRadius,
    ).toBe('8px');
  });

  it('lists the sample default branch first and keeps the other sample branches in order', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Atlas"]').click();
    fixture.detectChanges();

    expect(branchNames(fixture)).toEqual(['main', 'feature/login', 'wip']);
  });

  it('lists every Harbor branch with status, changed files, and commits ahead and behind', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const rows = [...fixture.nativeElement.querySelectorAll('[data-testid="branch-row"]')];
    expect(rows.map((row) => row.getAttribute('data-branch'))).toEqual([
      'feature/login',
      'wip',
      'origin/release',
      'abandoned',
      'rename-docs',
    ]);
    expect(rows.map((row) => row.getAttribute('data-status'))).toEqual([
      'local-and-remote',
      'local-only',
      'remote-only',
      'remote-deleted',
      'local-and-remote',
    ]);
    expect(rowText(rows, 'changed-file-count')).toEqual(['2', '0', '0', '1', '1']);
    expect(rowText(rows, 'ahead')).toEqual(['3', '0', '4', '2', '1']);
    expect(rowText(rows, 'behind')).toEqual(['1', '0', '0', '0', '0']);
    expect(fixture.nativeElement.querySelector('[data-branch="HEAD"]')).toBeNull();
  });

  it('colors a branch row by status and shows no text badge', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const background = (branch: string) =>
      getComputedStyle(
        fixture.nativeElement.querySelector(
          `[data-testid="branch-row"][data-branch="${branch}"] [data-testid="status-color"]`,
        ),
      ).backgroundColor;

    expect(background('wip')).toBe('rgb(142, 202, 230)');
    expect(background('feature/login')).toBe('rgb(61, 220, 151)');
    expect(background('origin/release')).toBe('rgb(244, 211, 94)');
    expect(background('abandoned')).toBe('rgb(255, 92, 92)');

    for (const row of fixture.nativeElement.querySelectorAll('[data-testid="branch-row"]')) {
      expect(row.textContent).not.toMatch(/local only|local-only|remote only|remote-only|gone|remote-deleted/i);
    }
  });

  it('shows no terminal count on the sample branches', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    for (const row of fixture.nativeElement.querySelectorAll('[data-testid="branch-row"]')) {
      expect(row.querySelector('[data-testid="terminal-count"]')).toBeNull();
    }
  });

  it('places create after the branch list as the last sidebar control', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const sidebar = fixture.nativeElement.querySelector('[data-testid="workspace"] aside');
    const branchList = sidebar.querySelector('[data-testid="branch-list"]');
    const create = sidebar.querySelector('[data-testid="create-worktree"]');
    expect(create).not.toBeNull();
    expect(sidebar.querySelector('[data-testid="create-branch"]')).toBeNull();
    expect(branchList.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    const controls = [...sidebar.querySelectorAll('button, a, input, select, textarea')];
    expect(controls.at(-1)).toBe(create);
  });

  it('opens a create worktree dialog instead of an inline branch field', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="create-branch"]')).toBeNull();

    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"]');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Create worktree');
    const field = dialog.querySelector('[data-testid="create-branch"]');
    expect(field.tagName).toBe('INPUT');
    expect(dialog.querySelector('h2').textContent.trim()).toBe('Create worktree');
  });

  it('notes that a remote-only branch is fetched first and when create hooks run', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const sidebar = fixture.nativeElement.querySelector('[data-testid="workspace"] aside');
    expect(sidebar.querySelector('[data-testid="create-worktree-note"]')).toBeNull();

    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"]');
    const note = dialog.querySelector('[data-testid="create-worktree-note"]');
    expect(note.textContent.trim()).toBe(
      'A remote-only branch is fetched first. Pre-create hooks run before the worktree is added. Post-create hooks run after checkout.',
    );
  });

  it('offers remote branches that do not already have a local worktree', async () => {
    const repoPath = createEmptyRepository(roots);
    const sha = git(repoPath, ['rev-parse', 'HEAD']);
    git(repoPath, ['update-ref', 'refs/remotes/origin/master', sha]);
    git(repoPath, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/master']);
    git(repoPath, ['update-ref', 'refs/remotes/origin/feature', sha]);
    git(repoPath, ['branch', 'done']);
    git(repoPath, ['update-ref', 'refs/remotes/origin/done', sha]);
    git(repoPath, ['worktree', 'add', join(repoPath, '.workspaces', 'done'), 'done']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"]');
    const field = dialog.querySelector('[data-testid="create-branch"]');
    expect(field.tagName).toBe('INPUT');
    const offered = [...dialog.querySelectorAll('[data-testid="create-branch-option"]')].map((option) =>
      option.getAttribute('data-branch'),
    );
    expect(offered).toEqual(['feature']);
  });

  it('offers a local branch with no worktree when the remote ref exists', async () => {
    const repoPath = createEmptyRepository(roots);
    const sha = git(repoPath, ['rev-parse', 'HEAD']);
    git(repoPath, ['branch', 'hold']);
    git(repoPath, ['update-ref', 'refs/remotes/origin/master', sha]);
    git(repoPath, ['update-ref', 'refs/remotes/origin/hold', sha]);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();

    const offered = [
      ...fixture.nativeElement.querySelectorAll(
        '[data-testid="create-worktree-dialog"] [data-testid="create-branch-option"]',
      ),
    ].map((option) => option.getAttribute('data-branch'));
    expect(offered).toEqual(['hold']);
  });

  it('lists free branches from every remote and omits branches that already have a worktree', async () => {
    const repoPath = createPickerRepository(roots);
    const fixture = await renderRepository(repoPath);

    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();

    const names = [
      ...fixture.nativeElement.querySelectorAll('[data-testid="create-branch-option"]'),
    ].map((option) => option.getAttribute('data-branch'));
    expect(names).toContain('plain');
    expect(names).toContain('shipped');
    expect(names).toContain('only-upstream');
    expect(names.filter((name) => name === 'shipped')).toHaveLength(1);
    expect(names).not.toContain('taken');
    expect(names).not.toContain('master');
    expect(names).not.toContain('origin/shipped');
    expect(names).not.toContain('upstream/only-upstream');
  });

  it('creates a worktree for a branch that exists only on a non-origin remote', async () => {
    const repoPath = createPickerRepository(roots);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('[data-testid="create-branch-option"][data-branch="only-upstream"]')
      .click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="confirm-create-worktree"]').click();

    const checkout = join(repoPath, '.workspaces', 'only-upstream');
    await untilVisible(fixture, () => existsSync(checkout));
    expect(git(checkout, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('only-upstream');
    expect(git(checkout, ['rev-parse', '--abbrev-ref', '@{upstream}'])).toBe('upstream/only-upstream');
  });

  it('fills the branch name when a listed remote branch is chosen', async () => {
    const repoPath = createEmptyRepository(roots);
    const sha = git(repoPath, ['rev-parse', 'HEAD']);
    git(repoPath, ['update-ref', 'refs/remotes/origin/feature', sha]);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"]');
    const field = dialog.querySelector('[data-testid="create-branch"]');
    expect(field.value).toBe('');
    dialog.querySelector('[data-testid="create-branch-option"][data-branch="feature"]').click();
    fixture.detectChanges();
    expect(field.value).toBe('feature');
  });

  it('creates the worktree when a listed remote branch is confirmed', async () => {
    const repoPath = createEmptyRepository(roots);
    const remotePath = join(repoPath, '..', 'origin.git');
    const otherPath = join(repoPath, '..', 'other');
    mkdirSync(remotePath, { recursive: true });
    execFileSync('git', ['init', '--bare', '-b', 'master'], { cwd: remotePath, stdio: 'ignore' });
    git(repoPath, ['remote', 'add', 'origin', remotePath]);
    git(repoPath, ['push', '-u', 'origin', 'master']);
    execFileSync('git', ['clone', remotePath, otherPath], { stdio: 'ignore' });
    git(otherPath, ['config', 'user.name', 'git-manager test']);
    git(otherPath, ['config', 'user.email', 'test@git-manager.local']);
    git(otherPath, ['checkout', '-b', 'feature']);
    writeFileSync(join(otherPath, 'feature.txt'), 'from remote\n');
    git(otherPath, ['add', 'feature.txt']);
    git(otherPath, ['commit', '-m', 'add feature']);
    git(otherPath, ['push', '-u', 'origin', 'feature']);
    git(repoPath, ['fetch', 'origin']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"]');
    dialog.querySelector('[data-testid="create-branch-option"][data-branch="feature"]').click();
    fixture.detectChanges();
    dialog.querySelector('[data-testid="confirm-create-worktree"]').click();
    await untilVisible(
      fixture,
      (root) => root.querySelector('[data-testid="create-worktree-dialog"]') === null,
    );

    const checkout = join(repoPath, '.workspaces', 'feature');
    expect(git(checkout, ['branch', '--show-current'])).toBe('feature');
    expect(
      [...fixture.nativeElement.querySelectorAll('[data-testid="branch-row"]')].map((row) =>
        row.getAttribute('data-branch'),
      ),
    ).toEqual(['master', 'feature']);
  });

  it('creates a worktree when a local branch name is typed', async () => {
    const repoPath = createEmptyRepository(roots);
    const sha = git(repoPath, ['rev-parse', 'HEAD']);
    git(repoPath, ['branch', 'notes']);
    git(repoPath, ['update-ref', 'refs/remotes/origin/feature', sha]);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"]');
    expect(
      [...dialog.querySelectorAll('[data-testid="create-branch-option"]')].map((option) =>
        option.getAttribute('data-branch'),
      ),
    ).toEqual(['notes', 'feature']);
    const field = dialog.querySelector('[data-testid="create-branch"]');
    field.value = 'notes';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dialog.querySelector('[data-testid="confirm-create-worktree"]').click();
    await untilVisible(
      fixture,
      (root) => root.querySelector('[data-testid="create-worktree-dialog"]') === null,
    );

    const checkout = join(repoPath, '.workspaces', 'notes');
    expect(git(checkout, ['branch', '--show-current'])).toBe('notes');
    expect(
      [...fixture.nativeElement.querySelectorAll('[data-testid="branch-row"]')].map((row) =>
        row.getAttribute('data-branch'),
      ),
    ).toEqual(['master', 'notes', 'origin/feature']);
  });

  it('opens a branch menu with merge actions and no squash control', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('[data-branch="feature/login"]');
    const closedMenu = row.querySelector('[data-testid="hover-menu"]');
    expect(closedMenu.classList.contains('is-open')).toBe(false);
    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();

    const menu = row.querySelector('[data-testid="hover-menu"]');
    expect(menu.querySelector('[data-testid="squash"]')).toBeNull();
    const group = menu.querySelector('fieldset');
    expect(group.querySelector('legend').textContent.trim()).toBe('Merge');
    expect(group.querySelector('[data-testid="update-from-master"]').textContent.trim()).toBe(
      'Update from master',
    );
    expect(group.querySelector('[data-testid="merge-into-master"]').textContent.trim()).toBe(
      'Merge into master',
    );
    const remove = menu.querySelector('[data-testid="remove-worktree"]');
    expect(remove.textContent.trim()).toBe('Remove worktree');
    expect(group.contains(remove)).toBe(false);
    expect(remove.parentElement).toBe(group.parentElement);
  });

  it('keeps branch actions closed while the pointer is only hovering the row', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const css = [...document.querySelectorAll('style')].map((style) => style.textContent ?? '').join('\n');
    const hoverOpensActions = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some((match) => {
      const selector = match[1] ?? '';
      const body = match[2] ?? '';
      return (
        selector.includes('.branch-row') &&
        selector.includes(':hover') &&
        selector.includes('.branch-actions') &&
        /display\s*:\s*block/.test(body)
      );
    });
    expect(hoverOpensActions).toBe(false);

    const menu = fixture.nativeElement.querySelector(
      '[data-branch="feature/login"] [data-testid="hover-menu"]',
    );
    expect(menu.classList.contains('is-open')).toBe(false);
    expect(getComputedStyle(menu).display).toBe('none');
  });

  it('keeps the branch menu within its own bounds when a row is hovered', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('[data-branch="feature/login"]');
    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();

    const menu = row.querySelector('[data-testid="hover-menu"]');
    const update = menu.querySelector('[data-testid="update-from-master"]');
    update.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    fixture.detectChanges();

    expect(menu.querySelector('[data-testid="squash"]')).toBeNull();
    expect(update.textContent.trim()).toBe('Update from master');
    expect(getComputedStyle(menu).overflow).toBe('hidden');
  });

  it('opens one branch action menu and closes the other', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const login = fixture.nativeElement.querySelector('[data-branch="feature/login"]');
    const wip = fixture.nativeElement.querySelector('[data-branch="wip"]');
    login.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();

    const loginMenu = login.querySelector('[data-testid="hover-menu"]');
    expect(loginMenu.classList.contains('is-open')).toBe(true);
    expect(getComputedStyle(loginMenu).display).toBe('block');
    expect(loginMenu.querySelector('[data-testid="update-from-master"]').textContent.trim()).toBe(
      'Update from master',
    );
    expect(loginMenu.querySelector('[data-testid="merge-into-master"]').textContent.trim()).toBe(
      'Merge into master',
    );
    expect(loginMenu.querySelector('[data-testid="remove-worktree"]').textContent.trim()).toBe(
      'Remove worktree',
    );

    wip.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();

    const wipMenu = wip.querySelector('[data-testid="hover-menu"]');
    expect(loginMenu.classList.contains('is-open')).toBe(false);
    expect(getComputedStyle(loginMenu).display).toBe('none');
    expect(wipMenu.classList.contains('is-open')).toBe(true);
    expect(getComputedStyle(wipMenu).display).toBe('block');
  });

  it('closes the branch menu when that branch menu button is pressed again', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('[data-branch="feature/login"]');
    const button = row.querySelector('[data-testid="branch-menu"]');
    button.click();
    fixture.detectChanges();
    expect(row.querySelector('[data-testid="hover-menu"]').classList.contains('is-open')).toBe(true);

    button.click();
    fixture.detectChanges();

    expect(row.querySelector('[data-testid="hover-menu"]').classList.contains('is-open')).toBe(false);
    expect(getComputedStyle(row.querySelector('[data-testid="hover-menu"]')).display).toBe('none');
    expect(branchNames(fixture)).toEqual([
      'feature/login',
      'wip',
      'origin/release',
      'abandoned',
      'rename-docs',
    ]);
  });

  it('closes the branch menu when the workspace outside the menu is clicked', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('[data-branch="feature/login"]');
    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();
    expect(row.querySelector('[data-testid="hover-menu"]').classList.contains('is-open')).toBe(true);

    row.querySelector('[data-testid="hover-menu"] legend').click();
    fixture.detectChanges();
    expect(row.querySelector('[data-testid="hover-menu"]').classList.contains('is-open')).toBe(true);

    fixture.nativeElement.querySelector('[data-testid="content-sheet"]').click();
    fixture.detectChanges();

    expect(row.querySelector('[data-testid="hover-menu"]').classList.contains('is-open')).toBe(false);
    expect(getComputedStyle(row.querySelector('[data-testid="hover-menu"]')).display).toBe('none');
    expect(branchNames(fixture)).toEqual([
      'feature/login',
      'wip',
      'origin/release',
      'abandoned',
      'rename-docs',
    ]);
  });

  it('closes the branch menu when Escape is pressed', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('[data-branch="feature/login"]');
    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();
    expect(row.querySelector('[data-testid="hover-menu"]').classList.contains('is-open')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(row.querySelector('[data-testid="hover-menu"]').classList.contains('is-open')).toBe(false);
    expect(getComputedStyle(row.querySelector('[data-testid="hover-menu"]')).display).toBe('none');
    expect(fixture.nativeElement.querySelector('[data-testid="switching-overlay"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="repository-name"]').textContent).toContain(
      'Harbor',
    );
    expect(branchNames(fixture)).toEqual([
      'feature/login',
      'wip',
      'origin/release',
      'abandoned',
      'rename-docs',
    ]);
  });

  it('closes the repository switcher on Escape and leaves the open branch menu open', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="switch-repository"]').click();
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('[data-branch="feature/login"]');
    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="switching-overlay"]')).not.toBeNull();
    expect(row.querySelector('[data-testid="hover-menu"]').classList.contains('is-open')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="switching-overlay"]')).toBeNull();
    expect(row.querySelector('[data-testid="hover-menu"]').classList.contains('is-open')).toBe(true);
    expect(getComputedStyle(row.querySelector('[data-testid="hover-menu"]')).display).toBe('block');
    expect(fixture.nativeElement.querySelector('[data-testid="repository-name"]').textContent).toContain(
      'Harbor',
    );
    expect(branchNames(fixture)).toEqual([
      'feature/login',
      'wip',
      'origin/release',
      'abandoned',
      'rename-docs',
    ]);
  });

  it('closes the branch menu without updating, merging, or removing the worktree', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['branch', 'feature']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const checkout = join(repoPath, '.workspaces', 'feature');
    git(repoPath, ['worktree', 'add', checkout, 'feature']);
    writeFileSync(join(checkout, 'feature.txt'), 'from feature\n');
    git(checkout, ['add', 'feature.txt']);
    git(checkout, ['commit', '-m', 'feature change']);
    writeFileSync(join(repoPath, 'master.txt'), 'from master\n');
    git(repoPath, ['add', 'master.txt']);
    git(repoPath, ['commit', '-m', 'master change']);
    const fixture = await renderRepository(repoPath);

    const row = fixture.nativeElement.querySelector('[data-branch="feature"]');
    expect(row.querySelector('[data-testid="ahead"]').textContent.trim()).toBe('1');
    expect(row.querySelector('[data-testid="behind"]').textContent.trim()).toBe('1');

    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="content-sheet"]').click();
    fixture.detectChanges();
    expect(row.querySelector('[data-testid="hover-menu"]').classList.contains('is-open')).toBe(false);

    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(row.querySelector('[data-testid="hover-menu"]').classList.contains('is-open')).toBe(false);

    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();
    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();
    expect(row.querySelector('[data-testid="hover-menu"]').classList.contains('is-open')).toBe(false);

    expect(readFileSync(join(checkout, 'feature.txt'), 'utf8')).toBe('from feature\n');
    expect(readFileSync(join(repoPath, 'master.txt'), 'utf8')).toBe('from master\n');
    expect(existsSync(join(checkout, 'master.txt'))).toBe(false);
    expect(existsSync(join(repoPath, 'feature.txt'))).toBe(false);
    expect(git(repoPath, ['log', '--format=%s'])).toBe('master change\ninit');
    expect(git(checkout, ['log', '--format=%s'])).toBe('feature change\ninit');
    expect(git(repoPath, ['worktree', 'list'])).toContain(checkout);
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
    expect(git(checkout, ['branch', '--show-current'])).toBe('feature');
    expect(row.querySelector('[data-testid="ahead"]').textContent.trim()).toBe('1');
    expect(row.querySelector('[data-testid="behind"]').textContent.trim()).toBe('1');
    expect(branchNames(fixture)).toEqual(['master', 'feature']);
    expect(fixture.nativeElement.querySelector('[data-testid="workspace-error"]')).toBeNull();
  });

  it('counts the Harbor commits that are not on the default branch', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();

    const summary = fixture.nativeElement.querySelector('.branch-heading p');
    expect(summary.textContent.trim()).toBe('2 commits · 2 changed files');

    const commits = [...fixture.nativeElement.querySelectorAll('[data-testid="branch-commits"] [data-testid="commit"]')];
    expect(commits.map((commit) => commit.getAttribute('data-subject'))).toEqual([
      'Add the login form',
      'Wire the session',
    ]);
  });

  it('shows the changed files and the commits only on feature/login', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();

    const files = [...fixture.nativeElement.querySelectorAll('[data-testid="changed-files"] [data-testid="changed-file"]')];
    expect(files.map((file) => file.getAttribute('data-path'))).toEqual(['src/login.ts', 'README.md']);
    expect(files[0].querySelector('[data-testid="lines-added"]').textContent.trim()).toBe('12');
    expect(files[0].querySelector('[data-testid="lines-deleted"]').textContent.trim()).toBe('3');
    expect(files[1].querySelector('[data-testid="lines-added"]').textContent.trim()).toBe('4');
    expect(files[1].querySelector('[data-testid="lines-deleted"]').textContent.trim()).toBe('1');

    const commits = [...fixture.nativeElement.querySelectorAll('[data-testid="branch-commits"] [data-testid="commit"]')];
    expect(commits.map((commit) => commit.getAttribute('data-subject'))).toEqual([
      'Add the login form',
      'Wire the session',
    ]);
  });

  it('places changes above commits and the selected file diff to their right', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="commit-files"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="diff"]')).toBeNull();
    const changes = fixture.nativeElement.querySelector('[data-testid="changes"]');
    const commits = fixture.nativeElement.querySelector('[data-testid="commits"]');
    expect(blockTop(commits)).toBeGreaterThanOrEqual(blockBottom(changes));

    fixture.nativeElement.querySelector('[data-testid="commit"][data-subject="Add the login form"]').click();
    fixture.detectChanges();

    const commitFiles = fixture.nativeElement.querySelector('[data-testid="commit-files"]');
    const diff = fixture.nativeElement.querySelector('[data-testid="diff"]');
    expect(commitFiles.closest('[data-testid="commits"]')).toBeNull();
    expect(commitFiles.closest('[data-testid="changes"]')).toBeNull();
    expect(commits.compareDocumentPosition(commitFiles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(commitFiles.compareDocumentPosition(diff) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the working tree diff when src/login.ts is chosen', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();

    const loginFile = fixture.nativeElement.querySelector('[data-testid="changed-file"][data-path="src/login.ts"]');
    loginFile.click();
    fixture.detectChanges();

    expect(loginFile.classList.contains('is-selected')).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="diff"]').textContent).toContain(
      '+export function login',
    );
  });

  it('shows Add the login form files with the diff in the column to the right', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();

    const loginCommit = fixture.nativeElement.querySelector(
      '[data-testid="commit"][data-subject="Add the login form"]',
    );
    loginCommit.click();
    fixture.detectChanges();

    expect(loginCommit.classList.contains('is-selected')).toBe(true);
    const commitFiles = fixture.nativeElement.querySelector('[data-testid="commit-files"]');
    const file = commitFiles.querySelector('[data-testid="changed-file"]');
    expect(file.classList.contains('is-selected')).toBe(true);
    expect(file.getAttribute('data-path')).toBe('src/login.ts');
    expect(file.querySelector('[data-testid="lines-added"]').textContent.trim()).toBe('10');
    expect(file.querySelector('[data-testid="lines-deleted"]').textContent.trim()).toBe('0');

    const diff = fixture.nativeElement.querySelector('[data-testid="diff"]');
    expect(diff.textContent).toContain('+function login');
    expect(commitFiles.closest('[data-testid="commits"]')).toBeNull();
    expect(commitFiles.compareDocumentPosition(diff) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lists only the Harbor commits that are not on the default branch, below the changes', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="recent-commits"]')).toBeNull();
    const commits = fixture.nativeElement.querySelector('[data-testid="branch-commits"]');
    expect(commits.previousElementSibling?.textContent?.trim()).toBe('Commits only on this branch');
    expect(
      [...commits.querySelectorAll('[data-testid="commit"]')].map((commit) =>
        commit.getAttribute('data-subject'),
      ),
    ).toEqual(['Add the login form', 'Wire the session']);

    const changes = sheetSection(fixture.nativeElement.querySelector('[data-testid="changed-files"]'));
    expect(blockTop(sheetSection(commits))).toBeGreaterThanOrEqual(blockBottom(changes));

    expect(fixture.nativeElement.querySelector('.branch-heading p').textContent.trim()).toBe(
      '2 commits · 2 changed files',
    );
  });

  it('lists the commits that are not on the default branch for feature/login', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();

    const only = fixture.nativeElement.querySelector('[data-testid="branch-commits"]');
    expect(only.previousElementSibling?.textContent?.trim()).toBe('Commits only on this branch');
    expect(
      [...only.querySelectorAll('[data-testid="commit"]')].map((commit) =>
        commit.getAttribute('data-subject'),
      ),
    ).toEqual(['Add the login form', 'Wire the session']);
  });

  it('shows the Atlas main history under Commits and keeps feature/login to commits that are not on main', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Atlas"]').click();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-branch="main"]').click();
    fixture.detectChanges();

    const recent = fixture.nativeElement.querySelector('[data-testid="recent-commits"]');
    expect(recent.previousElementSibling?.textContent?.trim()).toBe('Commits');
    expect(fixture.nativeElement.querySelector('[data-testid="branch-commits"]')).toBeNull();
    expect(
      [...recent.querySelectorAll('[data-testid="commit"]')].map((commit) =>
        commit.getAttribute('data-subject'),
      ),
    ).toEqual(['Open the atlas', 'Chart the coast']);
    expect(blockTop(fixture.nativeElement.querySelector('[data-testid="commits"]'))).toBeGreaterThanOrEqual(
      blockBottom(fixture.nativeElement.querySelector('[data-testid="changes"]')),
    );
    const summary = fixture.nativeElement.querySelector('.branch-heading p');
    expect(summary.textContent.trim()).toBe('2 commits · 0 changed files');
    expect(summary.textContent).not.toContain('commits only on this branch');

    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="recent-commits"]')).toBeNull();
    const only = fixture.nativeElement.querySelector('[data-testid="branch-commits"]');
    expect(only.previousElementSibling?.textContent?.trim()).toBe('Commits only on this branch');
    expect(
      [...only.querySelectorAll('[data-testid="commit"]')].map((commit) =>
        commit.getAttribute('data-subject'),
      ),
    ).toEqual(['Sketch the login']);
    expect(fixture.nativeElement.querySelector('[data-subject="Open the atlas"]')).toBeNull();
  });

  it('shows the files and diff for Wire the session', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="commit"][data-subject="Wire the session"]').click();
    fixture.detectChanges();

    const file = fixture.nativeElement.querySelector('[data-testid="commit-files"] [data-testid="changed-file"]');
    expect(file.getAttribute('data-path')).toBe('src/session.ts');
    expect(file.querySelector('[data-testid="lines-added"]').textContent.trim()).toBe('8');
    expect(file.querySelector('[data-testid="lines-deleted"]').textContent.trim()).toBe('2');
    expect(fixture.nativeElement.querySelector('[data-testid="diff"]').textContent).toContain(
      '+export function session',
    );
  });

  it('shows the renamed docs guide as one file with the previous path', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="rename-docs"]').click();
    fixture.detectChanges();

    const files = [...fixture.nativeElement.querySelectorAll('[data-testid="changed-files"] [data-testid="changed-file"]')];
    expect(files).toHaveLength(1);
    expect(files[0].getAttribute('data-path')).toBe('docs/guide.md');
    expect(files[0].getAttribute('data-previous-path')).toBe('docs/old-guide.md');
    expect(files[0].querySelector('[data-testid="lines-added"]').textContent.trim()).toBe('4');
    expect(files[0].querySelector('[data-testid="lines-deleted"]').textContent.trim()).toBe('1');
  });

  it('shows the abandoned binary logo with no line counts', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="abandoned"]').click();
    fixture.detectChanges();

    const files = [...fixture.nativeElement.querySelectorAll('[data-testid="changed-files"] [data-testid="changed-file"]')];
    expect(files).toHaveLength(1);
    expect(files[0].getAttribute('data-path')).toBe('assets/logo.png');
    expect(files[0].querySelector('[data-testid="lines-added"]')).toBeNull();
    expect(files[0].querySelector('[data-testid="lines-deleted"]')).toBeNull();
  });

  it('opens the repository path on rewrite without the sample card', async () => {
    const repoPath = createRewriteRepository(roots);
    const fixture = await renderRepository(repoPath);

    expect(fixture.nativeElement.querySelector('[data-testid="switching-overlay"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="repository-card"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="workspace"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="repository-name"]').textContent.trim()).toBe(
      'harbor',
    );

    const rewrite = fixture.nativeElement.querySelector(
      '[data-testid="branch-row"][data-branch="rewrite"]',
    );
    expect(rewrite.getAttribute('data-status')).toBe('local-only');
    expect(rewrite.querySelector('[data-testid="changed-file-count"]').textContent.trim()).toBe('1');
    expect(rewrite.querySelector('[data-testid="ahead"]').textContent.trim()).toBe('2');
    expect(rewrite.querySelector('[data-testid="behind"]').textContent.trim()).toBe('0');
    expect(rewrite.querySelector('[data-testid="terminal-count"]')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="branch-row"][data-branch="master"]'),
    ).not.toBeNull();
  });

  it('shows the files and diff for the old guide commit on the default branch', async () => {
    const repoPath = createRewriteRepository(roots);
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();

    fixture.nativeElement
      .querySelector('[data-testid="recent-commits"] [data-testid="commit"][data-subject="Add the old guide"]')
      .click();
    fixture.detectChanges();

    const commitFiles = fixture.nativeElement.querySelector('[data-testid="commit-files"]');
    const file = commitFiles.querySelector('[data-testid="changed-file"][data-path="docs/old-guide.md"]');
    expect(file.getAttribute('data-path')).toBe('docs/old-guide.md');
    file.click();
    fixture.detectChanges();

    const diff = fixture.nativeElement.querySelector('[data-testid="diff"]');
    expect(diff.textContent).toContain('old guide');
    expect(commitFiles.closest('[data-testid="commits"]')).toBeNull();
    expect(commitFiles.compareDocumentPosition(diff) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('loads the next page of recent commits when the list is scrolled to the end', async () => {
    const repoPath = createLongHistoryRepository(roots);
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();

    const list = fixture.nativeElement.querySelector('[data-testid="recent-commits"]');
    scrollCommitList(list, { scrollTop: 0, clientHeight: 100, scrollHeight: 400 });
    fixture.detectChanges();
    expect(commitSubjects(list)).not.toContain('init');

    scrollCommitList(list, { scrollTop: 300, clientHeight: 100, scrollHeight: 400 });
    fixture.detectChanges();
    const subjects = commitSubjects(list);
    expect(subjects[0]).toBe('Record 30');
    expect(subjects.at(-1)).toBe('init');
    expect(subjects.filter((subject) => subject === 'init')).toEqual(['init']);

    scrollCommitList(list, { scrollTop: 300, clientHeight: 100, scrollHeight: 400 });
    fixture.detectChanges();
    expect(commitSubjects(list).filter((subject) => subject === 'init')).toEqual(['init']);
  });

  it('shows the first page of recent commits before the list is scrolled', async () => {
    const repoPath = createLongHistoryRepository(roots);
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();

    const subjects = [
      ...fixture.nativeElement.querySelectorAll(
        '[data-testid="recent-commits"] [data-testid="commit"]',
      ),
    ].map((commit) => commit.getAttribute('data-subject'));
    expect(subjects[0]).toBe('Record 30');
    expect(subjects[29]).toBe('Record 01');
    expect(subjects).not.toContain('init');
    expect(fixture.nativeElement.querySelector('[data-testid="branch-commits"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="recent-commits"]').previousElementSibling?.textContent?.trim()).toBe(
      'Commits',
    );
    expect(blockTop(fixture.nativeElement.querySelector('[data-testid="commits"]'))).toBeGreaterThanOrEqual(
      blockBottom(fixture.nativeElement.querySelector('[data-testid="changes"]')),
    );
    const summary = fixture.nativeElement.querySelector('.branch-heading p');
    expect(summary.textContent.trim()).toBe('30 commits · 0 changed files');
    expect(summary.textContent).not.toContain('commits only on this branch');
  });

  it('lists commits that are not on main when main is the default branch', async () => {
    const repoPath = createEmptyRepository(roots, 'main');
    writeFileSync(join(repoPath, 'docs.txt'), 'main line\n');
    git(repoPath, ['add', 'docs.txt']);
    git(repoPath, ['commit', '-m', 'Plant the main line']);
    git(repoPath, ['checkout', '-b', 'feature']);
    writeFileSync(join(repoPath, 'docs.txt'), 'main line\nfeature note\n');
    git(repoPath, ['add', 'docs.txt']);
    git(repoPath, ['commit', '-m', 'Add the feature note']);
    git(repoPath, ['checkout', 'main']);
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="recent-commits"]')).toBeNull();
    const only = [
      ...fixture.nativeElement.querySelectorAll(
        '[data-testid="branch-commits"] [data-testid="commit"]',
      ),
    ].map((commit) => commit.getAttribute('data-subject'));
    expect(only).toEqual(['Add the feature note']);

    fixture.nativeElement.querySelector('[data-branch="main"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="branch-commits"]')).toBeNull();
    const recent = fixture.nativeElement.querySelector('[data-testid="recent-commits"]');
    expect(recent.previousElementSibling?.textContent?.trim()).toBe('Commits');
    expect(
      [...recent.querySelectorAll('[data-testid="commit"]')].map((commit) =>
        commit.getAttribute('data-subject'),
      ),
    ).toEqual(['Plant the main line', 'init']);
    expect(fixture.nativeElement.querySelector('.branch-heading p').textContent).not.toContain(
      'commits only on this branch',
    );
    expect(blockTop(fixture.nativeElement.querySelector('[data-testid="commits"]'))).toBeGreaterThanOrEqual(
      blockBottom(fixture.nativeElement.querySelector('[data-testid="changes"]')),
    );
  });

  it('lists commits that are not on main when the checkout is the feature branch', async () => {
    const repoPath = createEmptyRepository(roots, 'main');
    writeFileSync(join(repoPath, 'docs.txt'), 'main line\n');
    git(repoPath, ['add', 'docs.txt']);
    git(repoPath, ['commit', '-m', 'Plant the main line']);
    git(repoPath, ['checkout', '-b', 'feature']);
    writeFileSync(join(repoPath, 'docs.txt'), 'main line\nfeature note\n');
    git(repoPath, ['add', 'docs.txt']);
    git(repoPath, ['commit', '-m', 'Add the feature note']);
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-branch="feature"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="recent-commits"]')).toBeNull();
    const only = [
      ...fixture.nativeElement.querySelectorAll(
        '[data-testid="branch-commits"] [data-testid="commit"]',
      ),
    ].map((commit) => commit.getAttribute('data-subject'));
    expect(only).toEqual(['Add the feature note']);
  });

  it('shows the files and diff of the commit that was chosen when two commits share a subject', async () => {
    const repoPath = createEmptyRepository(roots);
    writeFileSync(join(repoPath, 'one.txt'), 'alpha line\n');
    git(repoPath, ['add', 'one.txt']);
    git(repoPath, ['commit', '-m', 'Same title']);
    writeFileSync(join(repoPath, 'two.txt'), 'beta line\n');
    git(repoPath, ['add', 'two.txt']);
    git(repoPath, ['commit', '-m', 'Same title']);
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();

    const same = [
      ...fixture.nativeElement.querySelectorAll(
        '[data-testid="recent-commits"] [data-testid="commit"][data-subject="Same title"]',
      ),
    ];
    expect(same).toHaveLength(2);

    same[0].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="diff"]').textContent).toContain('beta line');

    same[1].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="diff"]').textContent).toContain('alpha line');
    expect(fixture.nativeElement.querySelector('[data-testid="diff"]').textContent).not.toContain('beta line');
  });

  it('lists the commits on master, including the commit that starts the branch', async () => {
    const repoPath = createRewriteRepository(roots);
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="branch-commits"]')).toBeNull();
    const recent = fixture.nativeElement.querySelector('[data-testid="recent-commits"]');
    expect(recent.previousElementSibling?.textContent?.trim()).toBe('Commits');
    expect(
      [...recent.querySelectorAll('[data-testid="commit"]')].map((commit) =>
        commit.getAttribute('data-subject'),
      ),
    ).toEqual(['Add the old guide']);
    expect(fixture.nativeElement.querySelector('.branch-heading p').textContent).not.toContain(
      'commits only on this branch',
    );

    fixture.nativeElement.querySelector('[data-branch="rewrite"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="recent-commits"]')).toBeNull();
    expect(
      [...fixture.nativeElement.querySelectorAll('[data-testid="branch-commits"] [data-testid="commit"]')].map(
        (commit) => commit.getAttribute('data-subject'),
      ),
    ).toEqual(['Add the logo', 'Retitle the guide']);
  });

  it('shows the guide edit and the commits only on rewrite', async () => {
    const repoPath = createRewriteRepository(roots);
    const fixture = await renderRepository(repoPath);

    fixture.nativeElement.querySelector('[data-branch="rewrite"]').click();
    fixture.detectChanges();

    const files = [
      ...fixture.nativeElement.querySelectorAll(
        '[data-testid="changed-files"] [data-testid="changed-file"]',
      ),
    ];
    expect(files).toHaveLength(1);
    expect(files[0].getAttribute('data-path')).toBe('docs/guide.md');
    expect(files[0].querySelector('[data-testid="lines-added"]').textContent.trim()).toBe('1');
    expect(files[0].querySelector('[data-testid="lines-deleted"]').textContent.trim()).toBe('0');

    const commits = [
      ...fixture.nativeElement.querySelectorAll('[data-testid="branch-commits"] [data-testid="commit"]'),
    ];
    expect(commits.map((commit) => commit.getAttribute('data-subject'))).toEqual([
      'Add the logo',
      'Retitle the guide',
    ]);
  });

  it('opens the working tree diff for the renamed guide', async () => {
    const repoPath = createRewriteRepository(roots);
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-branch="rewrite"]').click();
    fixture.detectChanges();

    fixture.nativeElement
      .querySelector('[data-testid="changed-files"] [data-testid="changed-file"][data-path="docs/guide.md"]')
      .click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="diff"]').textContent).toContain('+pier note');
  });

  it('shows the renamed guide and the binary logo for commits on rewrite', async () => {
    const repoPath = createRewriteRepository(roots);
    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-branch="rewrite"]').click();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="commit"][data-subject="Retitle the guide"]').click();
    fixture.detectChanges();

    const commitFiles = fixture.nativeElement.querySelector('[data-testid="commit-files"]');
    const files = [...commitFiles.querySelectorAll('[data-testid="changed-file"]')];
    expect(files).toHaveLength(1);
    expect(files[0].getAttribute('data-path')).toBe('docs/guide.md');
    expect(files[0].getAttribute('data-previous-path')).toBe('docs/old-guide.md');
    expect(files[0].querySelector('[data-testid="lines-added"]').textContent.trim()).toBe('1');
    expect(files[0].querySelector('[data-testid="lines-deleted"]').textContent.trim()).toBe('1');

    const diff = fixture.nativeElement.querySelector('[data-testid="diff"]');
    expect(diff.textContent).toContain('new guide');
    expect(commitFiles.compareDocumentPosition(diff) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fixture.nativeElement.querySelector('[data-testid="commit"][data-subject="Add the logo"]').click();
    fixture.detectChanges();

    const logo = fixture.nativeElement.querySelector(
      '[data-testid="commit-files"] [data-testid="changed-file"]',
    );
    expect(logo.getAttribute('data-path')).toBe('assets/logo.png');
    expect(logo.querySelector('[data-testid="lines-added"]')).toBeNull();
    expect(logo.querySelector('[data-testid="lines-deleted"]')).toBeNull();
  });

  it('titles a registered repository with its display name', async () => {
    const repoPath = createEmptyRepository(roots);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');

    const fixture = await renderRepository(repoPath);

    expect(fixture.nativeElement.querySelector('[data-testid="repository-name"]').textContent.trim()).toBe(
      'Harbor',
    );
  });

  it('lists master first when that is the default branch and keeps every other branch in order', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['branch', 'feature/notes']);
    git(repoPath, ['branch', 'zeta']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    expect(branchNames(fixture)).toEqual(['master', 'feature/notes', 'zeta']);
  });

  it('lists main first when that is the default branch and keeps every other branch in order', async () => {
    const repoPath = createEmptyRepository(roots, 'main');
    git(repoPath, ['branch', 'feature/login']);
    git(repoPath, ['branch', 'zeta']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    expect(branchNames(fixture)).toEqual(['main', 'feature/login', 'zeta']);
  });

  it('pins main when the checkout is a feature branch', async () => {
    const repoPath = createEmptyRepository(roots, 'main');
    git(repoPath, ['checkout', '-b', 'feature']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    expect(branchNames(fixture)[0]).toBe('main');
    expect(branchNames(fixture)).toContain('feature');
  });

  it('pins master when the checkout is a feature branch', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['checkout', '-b', 'feature']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    expect(branchNames(fixture)[0]).toBe('master');
    expect(branchNames(fixture)).toContain('feature');
  });

  it('creates the notes worktree from the button', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['branch', 'notes']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"]');
    const field = dialog.querySelector('[data-testid="create-branch"]');
    field.value = 'notes';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dialog.querySelector('[data-testid="confirm-create-worktree"]').click();
    await untilVisible(
      fixture,
      (root) => root.querySelector('[data-testid="create-worktree-dialog"]') === null,
    );

    const checkout = join(repoPath, '.workspaces', 'notes');
    expect(git(checkout, ['branch', '--show-current'])).toBe('notes');
    expect(git(repoPath, ['worktree', 'list'])).toContain(checkout);
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
    expect(
      [...fixture.nativeElement.querySelectorAll('[data-testid="branch-row"]')].map((row) =>
        row.getAttribute('data-branch'),
      ),
    ).toEqual(['master', 'notes']);
    expect(fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"]')).toBeNull();
  });

  it('shows an error when the worktree folder already exists', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['branch', 'feature/notes']);
    const checkout = join(repoPath, '.workspaces', 'feature-notes');
    mkdirSync(checkout, { recursive: true });
    writeFileSync(join(checkout, 'keep.txt'), 'stay');
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const worktreesBefore = git(repoPath, ['worktree', 'list']);
    const fixture = await renderRepository(repoPath);

    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"]');
    const field = dialog.querySelector('[data-testid="create-branch"]');
    field.value = 'feature/notes';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dialog.querySelector('[data-testid="confirm-create-worktree"]').click();
    await untilVisible(fixture, (root) =>
      (root.querySelector('[data-testid="create-worktree-dialog"] [data-testid="workspace-error"]')?.textContent ?? '').includes(
        `Worktree folder already exists: ${checkout}`,
      ),
    );

    const error = dialog.querySelector('[data-testid="workspace-error"]');
    expect(error.textContent).toContain(`Worktree folder already exists: ${checkout}`);
    expect(git(repoPath, ['worktree', 'list'])).toBe(worktreesBefore);
    expect(readFileSync(join(checkout, 'keep.txt'), 'utf8')).toBe('stay');
    expect(
      [...fixture.nativeElement.querySelectorAll('[data-testid="branch-row"]')].map((row) =>
        row.getAttribute('data-branch'),
      ),
    ).toEqual(['master', 'feature/notes']);
  });

  it('adds no worktree when a plugin aborts create', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['branch', 'notes']);
    mkdirSync(join(repoPath, 'plugins'), { recursive: true });
    writeFileSync(
      join(repoPath, 'plugins', 'abort.ts'),
      [
        'export default {',
        "  name: 'abort-create',",
        "  preWorktreeCreate(): 'abort' {",
        "    return 'abort';",
        '  },',
        '};',
        '',
      ].join('\n'),
    );
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(
      join(repoPath, '.git-manager', 'config.toml'),
      '[hooks]\nmodules = ["plugins/abort.ts"]\n',
    );
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const worktreesBefore = git(repoPath, ['worktree', 'list']);
    const fixture = await renderRepository(repoPath);

    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"]');
    const field = dialog.querySelector('[data-testid="create-branch"]');
    field.value = 'notes';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dialog.querySelector('[data-testid="confirm-create-worktree"]').click();
    await untilVisible(fixture, (root) =>
      (root.querySelector('[data-testid="create-worktree-dialog"] [data-testid="workspace-error"]')?.textContent ?? '').includes(
        'abort-create aborted worktree create',
      ),
    );
    expect(dialog.querySelector('[data-testid="workspace-error"]').textContent).toContain(
      'abort-create aborted worktree create',
    );
    expect(git(repoPath, ['worktree', 'list'])).toBe(worktreesBefore);
    expect(existsSync(join(repoPath, '.workspaces', 'notes'))).toBe(false);
  });

  it('runs a shell command and a TypeScript plugin from the create button', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['branch', 'notes']);
    mkdirSync(join(repoPath, 'plugins'), { recursive: true });
    mkdirSync(join(repoPath, 'hooks'), { recursive: true });
    const pluginMarker = join(repoPath, 'plugin-hook.txt');
    const shellMarker = join(repoPath, 'shell-hook.txt');
    writeFileSync(
      join(repoPath, 'plugins', 'mark.ts'),
      [
        "import { writeFileSync } from 'node:fs';",
        'export default {',
        "  name: 'mark',",
        '  preWorktreeCreate() {',
        `    writeFileSync(${JSON.stringify(pluginMarker)}, 'plugin ran\\n');`,
        '  },',
        '};',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(repoPath, 'hooks', 'mark.mjs'),
      [
        "import { writeFileSync } from 'node:fs';",
        `writeFileSync(${JSON.stringify(shellMarker)}, 'shell ran\\n');`,
        '',
      ].join('\n'),
    );
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(
      join(repoPath, '.git-manager', 'config.toml'),
      [
        '[hooks]',
        'modules = ["plugins/mark.ts"]',
        '',
        '[hooks.pre_worktree_create]',
        'commands = ["node hooks/mark.mjs"]',
        '',
      ].join('\n'),
    );
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"]');
    const field = dialog.querySelector('[data-testid="create-branch"]');
    field.value = 'notes';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dialog.querySelector('[data-testid="confirm-create-worktree"]').click();
    const checkout = join(repoPath, '.workspaces', 'notes');
    await untilVisible(fixture, () => existsSync(checkout) && existsSync(pluginMarker) && existsSync(shellMarker));

    expect(readFileSync(pluginMarker, 'utf8')).toBe('plugin ran\n');
    expect(readFileSync(shellMarker, 'utf8')).toBe('shell ran\n');
    expect(git(repoPath, ['worktree', 'list'])).toContain(checkout);
  });

  it('copies .env into the new worktree and leaves the original unchanged', async () => {
    const repoPath = createEmptyRepository(roots);
    writeFileSync(join(repoPath, '.env'), 'SECRET=1\n');
    git(repoPath, ['branch', 'notes']);
    mkdirSync(join(repoPath, '.git-manager'), { recursive: true });
    writeFileSync(join(repoPath, '.git-manager', 'config.toml'), '[copy]\nfiles = [".env"]\n');
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"]');
    const field = dialog.querySelector('[data-testid="create-branch"]');
    field.value = 'notes';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dialog.querySelector('[data-testid="confirm-create-worktree"]').click();
    const copied = join(repoPath, '.workspaces', 'notes', '.env');
    await untilVisible(fixture, () => existsSync(copied));

    expect(readFileSync(copied, 'utf8')).toBe('SECRET=1\n');
    writeFileSync(copied, 'SECRET=1\nTOKEN=2\n');
    expect(readFileSync(copied, 'utf8')).toBe('SECRET=1\nTOKEN=2\n');
    expect(readFileSync(join(repoPath, '.env'), 'utf8')).toBe('SECRET=1\n');
  });

  it('leaves the branch list unchanged when create is cancelled', async () => {
    const repoPath = createEmptyRepository(roots);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    expect(
      [...fixture.nativeElement.querySelectorAll('[data-testid="branch-row"]')].map((row) =>
        row.getAttribute('data-branch'),
      ),
    ).toEqual(['master']);

    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"]');
    const field = dialog.querySelector('[data-testid="create-branch"]');
    field.value = 'dock';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dialog.querySelector('[data-testid="cancel-create-worktree"]').click();
    fixture.detectChanges();

    expect(
      [...fixture.nativeElement.querySelectorAll('[data-testid="branch-row"]')].map((row) =>
        row.getAttribute('data-branch'),
      ),
    ).toEqual(['master']);
    expect(fixture.nativeElement.querySelector('[data-testid="create-worktree-dialog"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="workspace-error"]')).toBeNull();
    expect(existsSync(join(repoPath, '.workspaces', 'dock'))).toBe(false);
  });

  it('shows the diff for the commit file that was chosen', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['checkout', '-b', 'topic']);
    writeFileSync(join(repoPath, 'a.txt'), 'alpha\n');
    writeFileSync(join(repoPath, 'b.txt'), 'beta\n');
    git(repoPath, ['add', 'a.txt', 'b.txt']);
    git(repoPath, ['commit', '-m', 'Add both files']);
    git(repoPath, ['checkout', 'master']);
    const fixture = await renderRepository(repoPath);

    fixture.nativeElement.querySelector('[data-branch="topic"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="commit"][data-subject="Add both files"]').click();
    fixture.detectChanges();

    const commitFiles = fixture.nativeElement.querySelector('[data-testid="commit-files"]');
    expect(fixture.nativeElement.querySelector('[data-testid="diff"]').textContent).toContain('+alpha');
    commitFiles.querySelector('[data-path="b.txt"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="diff"]').textContent).toContain('+beta');
    expect(fixture.nativeElement.querySelector('[data-testid="diff"]').textContent).not.toContain('+alpha');
  });

  it('shows an error when update from master has no worktree', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['branch', 'feature']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    const row = fixture.nativeElement.querySelector('[data-branch="feature"]');
    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();
    row.querySelector('[data-testid="update-from-master"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="workspace-error"]').textContent).toContain(
      'No worktree for branch: feature',
    );
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
  });

  it('shows an error when merge into master is not run on master', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['branch', 'feature']);
    git(repoPath, ['checkout', '-b', 'other']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    const row = fixture.nativeElement.querySelector('[data-branch="feature"]');
    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();
    row.querySelector('[data-testid="merge-into-master"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="merge-into-master-dialog"]');
    dialog.querySelector('[data-testid="confirm-merge-into-master"]').click();
    fixture.detectChanges();

    expect(dialog.querySelector('[data-testid="workspace-error"]').textContent).toContain(
      'Primary checkout is on other, not master',
    );
    expect(git(repoPath, ['branch', '--show-current'])).toBe('other');
  });

  it('updates the branch worktree from master', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['branch', 'feature']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const checkout = join(repoPath, '.workspaces', 'feature');
    git(repoPath, ['worktree', 'add', checkout, 'feature']);
    writeFileSync(join(repoPath, 'master.txt'), 'from master\n');
    git(repoPath, ['add', 'master.txt']);
    git(repoPath, ['commit', '-m', 'master change']);
    const fixture = await renderRepository(repoPath);

    const row = fixture.nativeElement.querySelector('[data-branch="feature"]');
    expect(row.querySelector('[data-testid="behind"]').textContent.trim()).toBe('1');
    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();
    row.querySelector('[data-testid="update-from-master"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="merge-into-master-dialog"]')).toBeNull();
    expect(readFileSync(join(checkout, 'master.txt'), 'utf8')).toBe('from master\n');
    expect(git(checkout, ['log', '-1', '--format=%s'])).toBe('master change');
    expect(git(checkout, ['branch', '--show-current'])).toBe('feature');
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
    expect(row.querySelector('[data-testid="behind"]').textContent.trim()).toBe('0');
  });

  it('opens a merge dialog that offers squash', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="merge-into-master-dialog"]')).toBeNull();

    const row = fixture.nativeElement.querySelector('[data-branch="feature/login"]');
    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();
    row.querySelector('[data-testid="merge-into-master"]').click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[data-testid="merge-into-master-dialog"]');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Merge into master');
    expect(dialog.querySelector('h2').textContent.trim()).toBe('Merge into master');
    const squash = dialog.querySelector('[data-testid="squash"]');
    expect(squash.tagName).toBe('INPUT');
    expect(squash.getAttribute('type')).toBe('checkbox');
    expect(squash.checked).toBe(false);
    expect(squash.parentElement.textContent.trim()).toBe('Squash');
    const panel = getComputedStyle(dialog.querySelector('.dialog-panel'));
    expect(panel.backgroundColor).toBe('rgb(247, 247, 245)');
    expect(panel.borderRadius).toBe('8px');
  });

  it('merges the branch into master', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['branch', 'feature']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const checkout = join(repoPath, '.workspaces', 'feature');
    git(repoPath, ['worktree', 'add', checkout, 'feature']);
    writeFileSync(join(checkout, 'feature.txt'), 'from feature\n');
    git(checkout, ['add', 'feature.txt']);
    git(checkout, ['commit', '-m', 'feature change']);
    const fixture = await renderRepository(repoPath);

    const row = fixture.nativeElement.querySelector('[data-branch="feature"]');
    expect(row.querySelector('[data-testid="ahead"]').textContent.trim()).toBe('1');
    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();
    row.querySelector('[data-testid="merge-into-master"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="merge-into-master-dialog"]');
    expect(dialog.querySelector('[data-testid="squash"]').checked).toBe(false);
    dialog.querySelector('[data-testid="confirm-merge-into-master"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="merge-into-master-dialog"]')).toBeNull();
    expect(readFileSync(join(repoPath, 'feature.txt'), 'utf8')).toBe('from feature\n');
    expect(git(repoPath, ['log', '-1', '--format=%s'])).toBe('feature change');
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
    expect(git(checkout, ['branch', '--show-current'])).toBe('feature');
    expect(row.querySelector('[data-testid="ahead"]').textContent.trim()).toBe('0');
  });

  it('squashes the branch into one master commit when squash is checked', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['branch', 'feature']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const checkout = join(repoPath, '.workspaces', 'feature');
    git(repoPath, ['worktree', 'add', checkout, 'feature']);
    writeFileSync(join(checkout, 'feature.txt'), 'from feature\n');
    git(checkout, ['add', 'feature.txt']);
    git(checkout, ['commit', '-m', 'feature change']);
    const fixture = await renderRepository(repoPath);

    const row = fixture.nativeElement.querySelector('[data-branch="feature"]');
    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();
    row.querySelector('[data-testid="merge-into-master"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="merge-into-master-dialog"]');
    dialog.querySelector('[data-testid="squash"]').click();
    fixture.detectChanges();
    expect(dialog.querySelector('[data-testid="squash"]').checked).toBe(true);
    dialog.querySelector('[data-testid="confirm-merge-into-master"]').click();
    fixture.detectChanges();

    expect(readFileSync(join(repoPath, 'feature.txt'), 'utf8')).toBe('from feature\n');
    expect(git(repoPath, ['log', '--format=%s'])).toBe('Squash feature into master\ninit');
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
    expect(git(checkout, ['log', '-1', '--format=%s'])).toBe('feature change');
  });

  it('does not merge into master when the merge dialog is cancelled', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['branch', 'feature']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const checkout = join(repoPath, '.workspaces', 'feature');
    git(repoPath, ['worktree', 'add', checkout, 'feature']);
    writeFileSync(join(checkout, 'feature.txt'), 'from feature\n');
    git(checkout, ['add', 'feature.txt']);
    git(checkout, ['commit', '-m', 'feature change']);
    const fixture = await renderRepository(repoPath);

    const row = fixture.nativeElement.querySelector('[data-branch="feature"]');
    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();
    row.querySelector('[data-testid="merge-into-master"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="merge-into-master-dialog"]');
    dialog.querySelector('[data-testid="squash"]').click();
    fixture.detectChanges();
    dialog.querySelector('[data-testid="cancel-merge-into-master"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="merge-into-master-dialog"]')).toBeNull();
    expect(existsSync(join(repoPath, 'feature.txt'))).toBe(false);
    expect(git(repoPath, ['log', '--format=%s'])).toBe('init');
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
    expect(git(checkout, ['log', '-1', '--format=%s'])).toBe('feature change');
    expect(row.querySelector('[data-testid="ahead"]').textContent.trim()).toBe('1');
  });

  it('removes the worktree and keeps the branch in the sidebar', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['branch', 'feature']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const checkout = join(repoPath, '.workspaces', 'feature');
    git(repoPath, ['worktree', 'add', checkout, 'feature']);
    const branchSha = git(repoPath, ['rev-parse', 'refs/heads/feature']);
    const fixture = await renderRepository(repoPath);

    const row = fixture.nativeElement.querySelector('[data-branch="feature"]');
    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();
    row.querySelector('[data-testid="remove-worktree"]').click();
    fixture.detectChanges();

    expect(git(repoPath, ['worktree', 'list'])).not.toContain(checkout);
    expect(git(repoPath, ['rev-parse', 'refs/heads/feature'])).toBe(branchSha);
    expect(fixture.nativeElement.querySelector('[data-testid="branch-row"][data-branch="feature"]')).not.toBeNull();
  });

  it('reads the registry on the centered card when the live query flag is set', async () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-desktop-'));
    roots.push(root);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(root, 'registry.db');
    const fixture = await renderLive();
    const card = fixture.nativeElement.querySelector('[data-testid="repository-card"]');

    expect(card).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="branch-list"]')).toBeNull();
    expect(card.querySelector('[data-testid="repository"][data-name="Harbor"]')).toBeNull();
    expect(card.querySelector('[data-testid="repository"][data-name="Atlas"]')).toBeNull();
  });

  it('lists registered repositories on the card and opens that repository', async () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-desktop-'));
    roots.push(root);
    const pier = join(root, 'pier');
    const quay = join(root, 'quay');
    initGitRepo(pier);
    writeFileSync(join(pier, 'README.md'), '# pier\n');
    git(pier, ['add', '.']);
    git(pier, ['commit', '-m', 'init']);
    git(pier, ['checkout', '-b', 'dock']);
    initGitRepo(quay);
    writeFileSync(join(quay, 'README.md'), '# quay\n');
    git(quay, ['add', '.']);
    git(quay, ['commit', '-m', 'init']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(root, 'registry.db');
    addRepository(pier, 'Pier');
    addRepository(quay, 'Quay');

    const fixture = await renderLive();
    const names = [...fixture.nativeElement.querySelectorAll('[data-testid="repository"]')].map((element) =>
      element.getAttribute('data-name'),
    );
    expect(names).toEqual(['Pier', 'Quay']);
    expect(fixture.nativeElement.querySelector('[data-testid="branch-list"]')).toBeNull();

    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Pier"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const rows = [...fixture.nativeElement.querySelectorAll('[data-testid="branch-row"]')].map((row) =>
      row.getAttribute('data-branch'),
    );
    expect(rows).toContain('dock');
    expect(rows).not.toContain('feature/login');
    expect(fixture.nativeElement.querySelector('[data-testid="repository-name"]').textContent).toContain('Pier');
  });

  it('adds a repository from the centered card', async () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-desktop-'));
    roots.push(root);
    const pier = join(root, 'pier');
    initGitRepo(pier);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(root, 'registry.db');
    setFolderBrowser(async () => pier);

    const fixture = await renderLive();
    const card = fixture.nativeElement.querySelector('[data-testid="repository-card"]');
    expect(card.querySelector('[data-testid="repository"]')).toBeNull();
    expect(card.querySelector('[data-testid="add-repository-path"]')).toBeNull();
    expect(card.querySelector('[data-testid="add-repository-name"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="add-repository-dialog"]')).toBeNull();

    card.querySelector('[data-testid="add-repository"]').click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[data-testid="add-repository-dialog"]');
    expect(dialog.querySelector('[data-testid="browse-repository-folder"]').textContent).toBe('Choose folder');
    expect(card.querySelector('[data-testid="add-repository-path"]')).toBeNull();
    expect(card.querySelector('[data-testid="add-repository-name"]')).toBeNull();

    dialog.querySelector('[data-testid="browse-repository-folder"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(dialog.querySelector('[data-testid="add-repository-path"]').textContent).toBe(pier);

    const nameField = dialog.querySelector('[data-testid="add-repository-name"]');
    nameField.value = 'Pier';
    nameField.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dialog.querySelector('[data-testid="confirm-add-repository"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Pier"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="card-error"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="add-repository-dialog"]')).toBeNull();
  });

  it('shows an error and does not add a repository when the folder is not a git repository', async () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-desktop-'));
    roots.push(root);
    const plain = join(root, 'plain');
    mkdirSync(plain);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(root, 'registry.db');
    setFolderBrowser(async () => plain);

    const fixture = await renderLive();
    fixture.nativeElement.querySelector('[data-testid="add-repository"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="add-repository-dialog"]');
    dialog.querySelector('[data-testid="browse-repository-folder"]').click();
    await fixture.whenStable();
    fixture.detectChanges();

    const nameField = dialog.querySelector('[data-testid="add-repository-name"]');
    nameField.value = 'Plain';
    nameField.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dialog.querySelector('[data-testid="confirm-add-repository"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="card-error"]').textContent).toBe(
      `Not a git repository: ${plain}`,
    );
    expect(fixture.nativeElement.querySelector('[data-testid="repository"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="add-repository-dialog"]')).not.toBeNull();
  });

  it('shows an error and does not add a repository when no folder is chosen', async () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-desktop-'));
    roots.push(root);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(root, 'registry.db');

    const fixture = await renderLive();
    fixture.nativeElement.querySelector('[data-testid="add-repository"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="add-repository-dialog"]');
    const nameField = dialog.querySelector('[data-testid="add-repository-name"]');
    nameField.value = 'Nowhere';
    nameField.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dialog.querySelector('[data-testid="confirm-add-repository"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="card-error"]').textContent).toBe(
      'Choose a repository folder',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="repository"]')).toBeNull();
  });

  it('shows an error and does not add a repository when the display name is blank', async () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-desktop-'));
    roots.push(root);
    const pier = join(root, 'pier');
    initGitRepo(pier);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(root, 'registry.db');
    setFolderBrowser(async () => pier);

    const fixture = await renderLive();
    fixture.nativeElement.querySelector('[data-testid="add-repository"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="add-repository-dialog"]');
    dialog.querySelector('[data-testid="browse-repository-folder"]').click();
    await fixture.whenStable();
    fixture.detectChanges();

    const nameField = dialog.querySelector('[data-testid="add-repository-name"]');
    nameField.value = '   ';
    nameField.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dialog.querySelector('[data-testid="confirm-add-repository"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="card-error"]').textContent).toBe(
      'Enter a display name',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="repository"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="add-repository-dialog"]')).not.toBeNull();
  });

  it('does not scroll the content sheet as one page', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]');
    expect(getComputedStyle(sheet).overflowY).toBe('hidden');
  });

  it('keeps a scrollbar inside the content sheet corners', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="changed-file"][data-path="src/login.ts"]').click();
    fixture.detectChanges();

    let sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]');
    expectContentSheetCorners(sheet);
    expectScrollingRegionsInset(sheet);

    fixture.nativeElement.querySelector('[data-testid="commit"][data-subject="Add the login form"]').click();
    fixture.detectChanges();
    sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]');
    expectScrollingRegionsInset(sheet);

    fixture.nativeElement.querySelector('[data-testid="switch-repository"]').click();
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('[data-testid="switching-overlay"] [data-testid="repository"][data-name="Atlas"]')
      .click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="main"]').click();
    fixture.detectChanges();
    sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]');
    expectScrollingRegionsInset(sheet);
  });

  it('scrolls the branch list inside the sidebar', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const sidebar = fixture.nativeElement.querySelector('[data-testid="workspace"] aside');
    const branchList = sidebar.querySelector('[data-testid="branch-list"]');
    const style = getComputedStyle(branchList);
    expect(['auto', 'scroll']).toContain(style.overflowY);
    expect(Number.parseFloat(style.minHeight)).toBe(0);
    expect(Number.parseFloat(style.flexGrow)).toBeGreaterThan(0);
    expect(branchList.parentElement).toBe(sidebar);
  });

  it('scrolls the changes inside their own region', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();

    const changedFiles = fixture.nativeElement.querySelector('[data-testid="changed-files"]');
    const style = getComputedStyle(changedFiles);
    expect(['auto', 'scroll']).toContain(style.overflowY);
    expect(Number.parseFloat(style.minHeight)).toBe(0);
    expect(Number.parseFloat(style.flexGrow)).toBeGreaterThan(0);
    expect(changedFiles.closest('[data-testid="changes"]')).not.toBeNull();
  });

  it('scrolls the diff inside its own region', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="changed-file"][data-path="src/login.ts"]').click();
    fixture.detectChanges();

    const diff = fixture.nativeElement.querySelector('[data-testid="diff"]');
    const style = getComputedStyle(diff);
    expect(['auto', 'scroll']).toContain(style.overflowY);
    expect(Number.parseFloat(style.minHeight)).toBe(0);
    expect(Number.parseFloat(style.flexGrow)).toBeGreaterThan(0);
  });

  it('scrolls the commits inside their own region', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();

    const branchCommits = fixture.nativeElement.querySelector('[data-testid="branch-commits"]');
    const branchStyle = getComputedStyle(branchCommits);
    expect(['auto', 'scroll']).toContain(branchStyle.overflowY);
    expect(Number.parseFloat(branchStyle.minHeight)).toBe(0);
    expect(Number.parseFloat(branchStyle.flexGrow)).toBeGreaterThan(0);
    expect(branchCommits.closest('[data-testid="commits"]')).not.toBeNull();

    fixture.nativeElement.querySelector('[data-testid="switch-repository"]').click();
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('[data-testid="switching-overlay"] [data-testid="repository"][data-name="Atlas"]')
      .click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="main"]').click();
    fixture.detectChanges();

    const recentCommits = fixture.nativeElement.querySelector('[data-testid="recent-commits"]');
    const recentStyle = getComputedStyle(recentCommits);
    expect(['auto', 'scroll']).toContain(recentStyle.overflowY);
    expect(Number.parseFloat(recentStyle.minHeight)).toBe(0);
    expect(Number.parseFloat(recentStyle.flexGrow)).toBeGreaterThan(0);
  });

  it('leaves the top bar and the other regions in place when one region scrolls', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="changed-file"][data-path="src/login.ts"]').click();
    fixture.detectChanges();

    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]');
    const bar = fixture.nativeElement.querySelector('[data-testid="window-bar"]');
    const branchList = fixture.nativeElement.querySelector('[data-testid="branch-list"]');
    const changedFiles = fixture.nativeElement.querySelector('[data-testid="changed-files"]');
    const diff = fixture.nativeElement.querySelector('[data-testid="diff"]');
    const commits = fixture.nativeElement.querySelector('[data-testid="branch-commits"]');

    expect(bar.offsetParent).not.toBe(sheet);

    changedFiles.scrollTop = 48;

    expect(changedFiles.scrollTop).toBe(48);
    expect(sheet.scrollTop).toBe(0);
    expect(branchList.scrollTop).toBe(0);
    expect(diff.scrollTop).toBe(0);
    expect(commits.scrollTop).toBe(0);
  });

  it('shows the first-parent diff for a merge commit and highlights the selection', async () => {
    const repoPath = createEmptyRepository(roots);
    writeFileSync(join(repoPath, 'base.txt'), 'base\n');
    git(repoPath, ['add', 'base.txt']);
    git(repoPath, ['commit', '-m', 'Add the base']);
    git(repoPath, ['checkout', '-b', 'feature']);
    writeFileSync(join(repoPath, 'feature.txt'), 'from feature\n');
    git(repoPath, ['add', 'feature.txt']);
    git(repoPath, ['commit', '-m', 'Add the feature file']);
    git(repoPath, ['checkout', 'master']);
    writeFileSync(join(repoPath, 'master.txt'), 'from master\n');
    git(repoPath, ['add', 'master.txt']);
    git(repoPath, ['commit', '-m', 'Add the master file']);
    git(repoPath, ['merge', '--no-ff', 'feature', '-m', 'Merge feature into master']);

    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();

    const merge = fixture.nativeElement.querySelector(
      '[data-testid="commit"][data-subject="Merge feature into master"]',
    );
    merge.click();
    fixture.detectChanges();

    expect(merge.classList.contains('is-selected')).toBe(true);
    expect(getComputedStyle(merge).backgroundColor).toBe('rgba(26, 60, 43, 0.12)');
    const featureFile = fixture.nativeElement.querySelector(
      '[data-testid="commit-files"] [data-testid="changed-file"][data-path="feature.txt"]',
    );
    expect(featureFile.classList.contains('is-selected')).toBe(true);
    const diff = fixture.nativeElement.querySelector('[data-testid="diff"]');
    expect(diff.textContent).toContain('from feature');

    const plain = fixture.nativeElement.querySelector(
      '[data-testid="commit"][data-subject="Add the master file"]',
    );
    plain.click();
    fixture.detectChanges();
    expect(merge.classList.contains('is-selected')).toBe(false);
    expect(plain.classList.contains('is-selected')).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="diff"]').textContent).toContain('from master');
  });

  it('keeps the file list and explains a commit that has no diff', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['commit', '--allow-empty', '-m', 'Empty note']);

    const fixture = await renderRepository(repoPath);
    fixture.nativeElement.querySelector('[data-branch="master"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="changed-files"]')).not.toBeNull();

    fixture.nativeElement.querySelector('[data-testid="commit"][data-subject="Empty note"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="changed-files"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="commit-files"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="diff"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="empty-diff"]').textContent.trim()).toBe(
      'No diff for this file',
    );
  });

  it('drags the divider between the changed-file list and the diff', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="changed-file"][data-path="src/login.ts"]').click();
    fixture.detectChanges();

    const split = fixture.nativeElement.querySelector('[data-testid="changes-split"]');
    expect(split.getAttribute('role')).toBe('separator');
    expect(split.getAttribute('aria-orientation')).toBe('vertical');
    expect(split.getAttribute('tabindex')).toBe('0');

    const files = fixture.nativeElement.querySelector('[data-testid="changed-files"]');
    const listed = [...files.querySelectorAll('[data-testid="changed-file"]')].map((file) =>
      file.getAttribute('data-path'),
    );
    const before = paneTrack(split.parentElement, 'gridTemplateColumns');

    dragDivider(split, { x: 240, y: 120 }, { x: 360, y: 120 });
    fixture.detectChanges();

    const after = paneTrack(split.parentElement, 'gridTemplateColumns');
    expect(after).toBeGreaterThan(before);

    fixture.detectChanges();
    expect(paneTrack(split.parentElement, 'gridTemplateColumns')).toBe(after);
    expect(
      [...files.querySelectorAll('[data-testid="changed-file"]')].map((file) => file.getAttribute('data-path')),
    ).toEqual(listed);
  });

  it('drags the divider between the changes and the commits', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();

    const split = fixture.nativeElement.querySelector('[data-testid="commits-split"]');
    expect(split.getAttribute('role')).toBe('separator');
    expect(split.getAttribute('aria-orientation')).toBe('horizontal');
    expect(split.getAttribute('tabindex')).toBe('0');

    const files = fixture.nativeElement.querySelector('[data-testid="changed-files"]');
    const commits = fixture.nativeElement.querySelector('[data-testid="branch-commits"]');
    const listedFiles = [...files.querySelectorAll('[data-testid="changed-file"]')].map((file) =>
      file.getAttribute('data-path'),
    );
    const listedCommits = [...commits.querySelectorAll('[data-testid="commit"]')].map((commit) =>
      commit.getAttribute('data-subject'),
    );
    const before = paneTrack(split.parentElement, 'gridTemplateRows');

    dragDivider(split, { x: 400, y: 200 }, { x: 400, y: 280 });
    fixture.detectChanges();

    const after = paneTrack(split.parentElement, 'gridTemplateRows');
    expect(after).toBeGreaterThan(before);
    expect(blockTop(sheetSection(commits))).toBeGreaterThanOrEqual(blockBottom(sheetSection(files)));

    fixture.detectChanges();
    expect(paneTrack(split.parentElement, 'gridTemplateRows')).toBe(after);
    expect(
      [...files.querySelectorAll('[data-testid="changed-file"]')].map((file) => file.getAttribute('data-path')),
    ).toEqual(listedFiles);
    expect(
      [...commits.querySelectorAll('[data-testid="commit"]')].map((commit) => commit.getAttribute('data-subject')),
    ).toEqual(listedCommits);
  });

  it('keeps the commits divider inside the sheet when the changes pane is dragged tall', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();

    const split = fixture.nativeElement.querySelector('[data-testid="commits-split"]');
    const columns = split.parentElement as HTMLElement;
    Object.defineProperty(columns, 'clientHeight', { configurable: true, value: 400 });

    dragDivider(split, { x: 400, y: 200 }, { x: 400, y: 2000 });
    fixture.detectChanges();

    expect(paneTrack(columns, 'gridTemplateRows')).toBe(312);
  });

  it('drags the divider between the open commit files and the diff', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="commit"][data-subject="Add the login form"]').click();
    fixture.detectChanges();

    const split = fixture.nativeElement.querySelector('[data-testid="commit-detail-split"]');
    expect(split.getAttribute('role')).toBe('separator');
    expect(split.getAttribute('aria-orientation')).toBe('vertical');
    expect(split.getAttribute('tabindex')).toBe('0');

    const files = fixture.nativeElement.querySelector('[data-testid="commit-files"]');
    const diff = files.parentElement.querySelector('[data-testid="diff"]');
    const commits = fixture.nativeElement.querySelector('[data-testid="branch-commits"]');
    const listedFiles = [...files.querySelectorAll('[data-testid="changed-file"]')].map((file) =>
      file.getAttribute('data-path'),
    );
    const listedCommits = [...commits.querySelectorAll('[data-testid="commit"]')].map((commit) =>
      commit.getAttribute('data-subject'),
    );
    const before = Number.parseFloat(files.style.width);

    dragDivider(split, { x: 240, y: 160 }, { x: 360, y: 160 });
    fixture.detectChanges();

    const after = Number.parseFloat(files.style.width);
    expect(after).toBeGreaterThan(before);
    expect(files.compareDocumentPosition(diff) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fixture.detectChanges();
    expect(Number.parseFloat(files.style.width)).toBe(after);
    expect(
      [...files.querySelectorAll('[data-testid="changed-file"]')].map((file) => file.getAttribute('data-path')),
    ).toEqual(listedFiles);
    expect(
      [...commits.querySelectorAll('[data-testid="commit"]')].map((commit) => commit.getAttribute('data-subject')),
    ).toEqual(listedCommits);
  });

  it('leaves registered repositories unchanged when the add dialog is cancelled', async () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-desktop-'));
    roots.push(root);
    const pier = join(root, 'pier');
    const quay = join(root, 'quay');
    initGitRepo(pier);
    initGitRepo(quay);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(root, 'registry.db');
    addRepository(pier, 'Pier');
    setFolderBrowser(async () => quay);

    const fixture = await renderLive();
    expect(fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Pier"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Quay"]')).toBeNull();

    fixture.nativeElement.querySelector('[data-testid="add-repository"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="add-repository-dialog"]');
    dialog.querySelector('[data-testid="browse-repository-folder"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    const nameField = dialog.querySelector('[data-testid="add-repository-name"]');
    nameField.value = 'Quay';
    nameField.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dialog.querySelector('[data-testid="cancel-add-repository"]').click();
    fixture.detectChanges();

    const names = [...fixture.nativeElement.querySelectorAll('[data-testid="repository"]')].map((element) =>
      element.getAttribute('data-name'),
    );
    expect(names).toEqual(['Pier']);
    expect(fixture.nativeElement.querySelector('[data-testid="add-repository-dialog"]')).toBeNull();
  });
});

async function untilVisible(
  fixture: { detectChanges(): void; nativeElement: HTMLElement },
  ready: (root: HTMLElement) => boolean,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    fixture.detectChanges();
    if (ready(fixture.nativeElement)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  fixture.detectChanges();
}

function paneTrack(element: HTMLElement, property: 'gridTemplateColumns' | 'gridTemplateRows'): number {
  return Number.parseFloat(element.style[property]);
}

function dragDivider(split: HTMLElement, start: { x: number; y: number }, end: { x: number; y: number }): void {
  split.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: start.x, clientY: start.y }));
  split.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: end.x, clientY: end.y }));
  split.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: end.x, clientY: end.y }));
}

function sheetSection(element: HTMLElement): HTMLElement {
  const boundary = element.closest('.sheet-stack') ?? element.closest('.sheet-columns');
  let current: HTMLElement | null = element;
  while (current && current.parentElement !== boundary) {
    current = current.parentElement;
  }
  return current ?? element;
}

function blockTop(element: HTMLElement): number {
  return placedBlock(element).top;
}

function blockBottom(element: HTMLElement): number {
  return placedBlock(element).bottom;
}

function placedBlock(element: HTMLElement): { top: number; bottom: number } {
  const rect = element.getBoundingClientRect();
  if (rect.height !== 0 || rect.width !== 0) {
    return { top: rect.top, bottom: rect.bottom };
  }
  const parent = element.parentElement;
  if (!parent) {
    return { top: 0, bottom: 0 };
  }
  const siblings = [...parent.children].filter((child): child is HTMLElement => child instanceof HTMLElement);
  const index = Math.max(0, siblings.indexOf(element));
  if (stacksVertically(getComputedStyle(parent))) {
    return { top: index, bottom: index + 1 };
  }
  return { top: 0, bottom: 1 };
}

function stacksVertically(style: CSSStyleDeclaration): boolean {
  const display = style.display;
  if (display === 'flex' || display === 'inline-flex') {
    return style.flexDirection === 'column' || style.flexDirection === 'column-reverse';
  }
  if (display === 'grid' || display === 'inline-grid') {
    return columnTrackCount(style.gridTemplateColumns) <= 1;
  }
  return display === 'block' || display === 'flow-root';
}

function columnTrackCount(columns: string): number {
  const value = columns.trim();
  if (value === '' || value === 'none') {
    return 1;
  }
  let depth = 0;
  let tracks = 0;
  let token = '';
  for (const char of value) {
    if (char === '(') {
      depth += 1;
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1);
    }
    if (/\s/.test(char) && depth === 0) {
      if (token.trim() !== '') {
        tracks += 1;
      }
      token = '';
    } else {
      token += char;
    }
  }
  if (token.trim() !== '') {
    tracks += 1;
  }
  return tracks;
}

function branchNames(fixture: { nativeElement: HTMLElement }): string[] {
  return [...fixture.nativeElement.querySelectorAll('[data-testid="branch-row"]')].map(
    (row) => row.getAttribute('data-branch') ?? '',
  );
}

function rowText(rows: Element[], testId: string): string[] {
  return rows.map((row) => row.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '');
}

function commitSubjects(list: Element): string[] {
  return [...list.querySelectorAll('[data-testid="commit"]')].map(
    (commit) => commit.getAttribute('data-subject') ?? '',
  );
}

function expectContentSheetCorners(sheet: HTMLElement): void {
  const style = getComputedStyle(sheet);
  expect(Number.parseFloat(style.borderRadius)).toBeGreaterThanOrEqual(4);
  expect(style.overflow).toBe('hidden');
}

function expectScrollingRegionsInset(sheet: HTMLElement): void {
  const regions = scrollingRegions(sheet);
  expect(regions.length).toBeGreaterThan(0);
  for (const region of regions) {
    expect(scrollingRegionRightInset(region, sheet)).toBeGreaterThan(0);
  }
}

function scrollingRegions(sheet: HTMLElement): HTMLElement[] {
  return [...sheet.querySelectorAll<HTMLElement>('*')].filter((element) => {
    const overflowY = getComputedStyle(element).overflowY;
    return overflowY === 'auto' || overflowY === 'scroll';
  });
}

function scrollingRegionRightInset(region: HTMLElement, sheet: HTMLElement): number {
  const regionStyle = getComputedStyle(region);
  const sheetStyle = getComputedStyle(sheet);
  const paddingRight = Math.max(
    Number.parseFloat(regionStyle.paddingRight) || 0,
    Number.parseFloat(sheetStyle.paddingRight) || 0,
  );
  const marginRight = Number.parseFloat(regionStyle.marginRight) || 0;
  if (paddingRight > 0 || marginRight > 0) {
    return Math.max(paddingRight, marginRight);
  }

  const regionBox = region.getBoundingClientRect();
  const sheetBox = sheet.getBoundingClientRect();
  if (sheetBox.width > 0 && regionBox.width < sheetBox.width) {
    return sheetBox.width - regionBox.width;
  }
  return 0;
}

function scrollCommitList(
  list: Element,
  metrics: { scrollTop: number; clientHeight: number; scrollHeight: number },
): void {
  Object.defineProperty(list, 'clientHeight', { configurable: true, value: metrics.clientHeight });
  Object.defineProperty(list, 'scrollHeight', { configurable: true, value: metrics.scrollHeight });
  if (list instanceof HTMLElement) {
    list.scrollTop = metrics.scrollTop;
  }
  list.dispatchEvent(new Event('scroll'));
}

function createLongHistoryRepository(roots: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'git-manager-desktop-'));
  roots.push(root);
  const repoPath = join(root, 'harbor');
  initGitRepo(repoPath);
  writeFileSync(join(repoPath, 'note.txt'), 'init\n');
  git(repoPath, ['add', '.']);
  commitWithDate(repoPath, 'init', 0);
  for (let number = 1; number <= 30; number += 1) {
    const label = String(number).padStart(2, '0');
    writeFileSync(join(repoPath, 'note.txt'), `${label}\n`);
    git(repoPath, ['add', 'note.txt']);
    commitWithDate(repoPath, `Record ${label}`, number);
  }
  return repoPath;
}

function commitWithDate(repoPath: string, message: string, second: number): void {
  const date = `2030-01-01T00:00:${String(second).padStart(2, '0')}+0000`;
  execFileSync('git', ['commit', '-m', message], {
    cwd: repoPath,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    },
  });
}

function createPickerRepository(roots: string[]): string {
  const repoPath = createEmptyRepository(roots);
  const root = join(repoPath, '..');
  git(repoPath, ['branch', 'plain']);
  git(repoPath, ['branch', 'taken']);
  git(repoPath, ['worktree', 'add', join(repoPath, '.workspaces', 'taken'), 'taken']);
  const origin = join(root, 'origin.git');
  const upstream = join(root, 'upstream.git');
  execFileSync('git', ['init', '--bare', '-b', 'master', origin], { stdio: 'ignore' });
  execFileSync('git', ['init', '--bare', '-b', 'master', upstream], { stdio: 'ignore' });
  git(repoPath, ['remote', 'add', 'origin', origin]);
  git(repoPath, ['remote', 'add', 'upstream', upstream]);
  git(repoPath, ['checkout', '-b', 'shipped']);
  git(repoPath, ['push', 'origin', 'shipped']);
  git(repoPath, ['push', 'upstream', 'shipped']);
  git(repoPath, ['checkout', '-b', 'only-upstream']);
  writeFileSync(join(repoPath, 'only.txt'), 'only\n');
  git(repoPath, ['add', 'only.txt']);
  git(repoPath, ['commit', '-m', 'only upstream']);
  git(repoPath, ['push', 'upstream', 'only-upstream']);
  git(repoPath, ['checkout', 'master']);
  git(repoPath, ['branch', '-D', 'shipped']);
  git(repoPath, ['branch', '-D', 'only-upstream']);
  return repoPath;
}

function createEmptyRepository(roots: string[], branch = 'master'): string {
  const root = mkdtempSync(join(tmpdir(), 'git-manager-desktop-'));
  roots.push(root);
  const repoPath = join(root, 'harbor');
  initGitRepo(repoPath, branch);
  writeFileSync(join(repoPath, 'README.md'), '# harbor\n');
  git(repoPath, ['add', '.']);
  git(repoPath, ['commit', '-m', 'init']);
  return repoPath;
}

function createRewriteRepository(roots: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'git-manager-desktop-'));
  roots.push(root);
  const repoPath = join(root, 'harbor');
  mkdirSync(join(repoPath, 'docs'), { recursive: true });
  initGitRepo(repoPath);
  writeFileSync(join(repoPath, 'docs', 'old-guide.md'), 'harbor notes\nold guide\nkeep the rest\n');
  writeFileSync(join(repoPath, '.gitattributes'), '*.png binary\n');
  git(repoPath, ['add', '.']);
  git(repoPath, ['commit', '-m', 'Add the old guide']);
  git(repoPath, ['checkout', '-b', 'rewrite']);
  git(repoPath, ['mv', 'docs/old-guide.md', 'docs/guide.md']);
  writeFileSync(join(repoPath, 'docs', 'guide.md'), 'harbor notes\nnew guide\nkeep the rest\n');
  git(repoPath, ['add', '-A']);
  git(repoPath, ['commit', '-m', 'Retitle the guide']);
  mkdirSync(join(repoPath, 'assets'), { recursive: true });
  writeFileSync(join(repoPath, 'assets', 'logo.png'), Buffer.from([0x89]));
  git(repoPath, ['add', 'assets/logo.png']);
  git(repoPath, ['commit', '-m', 'Add the logo']);
  git(repoPath, ['checkout', 'master']);
  git(repoPath, ['worktree', 'add', join(repoPath, '.workspaces', 'rewrite'), 'rewrite']);
  writeFileSync(
    join(repoPath, '.workspaces', 'rewrite', 'docs', 'guide.md'),
    'harbor notes\nnew guide\nkeep the rest\npier note\n',
  );
  return repoPath;
}

function initGitRepo(repoPath: string, branch = 'master'): void {
  mkdirSync(repoPath, { recursive: true });
  execFileSync('git', ['init', '-b', branch], { cwd: repoPath, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'git-manager test'], {
    cwd: repoPath,
    stdio: 'ignore',
  });
  execFileSync('git', ['config', 'user.email', 'test@git-manager.local'], {
    cwd: repoPath,
    stdio: 'ignore',
  });
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
