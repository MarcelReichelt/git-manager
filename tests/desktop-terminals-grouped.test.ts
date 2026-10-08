import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { killTmuxSession, listTmuxSessions, sessionDirectory } from '../src/desktop/tmux-sessions';
import { setAfterPaintScheduler } from '../src/desktop/after-paint';
import { whenRemoteRefreshIdle } from '../src/branches';
import { WorkspaceComponent } from '../src/desktop/workspace.component';
import { addRepository } from '../src/registry';

const emptyGitConfig = join(tmpdir(), 'git-worktree-manager-desktop-gitconfig');
writeFileSync(emptyGitConfig, '');
process.env.GIT_CONFIG_GLOBAL = emptyGitConfig;
process.env.GIT_CONFIG_SYSTEM = emptyGitConfig;
process.env.GIT_TERMINAL_PROMPT = '0';

describe('Terminals on the grouped worktrees', () => {
  const roots: string[] = [];
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
});

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
