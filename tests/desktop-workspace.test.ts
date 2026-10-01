import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { killTmuxSession, listTmuxSessions, sessionDirectory } from '../src/desktop/tmux-sessions';
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

  afterEach(() => {
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

  async function render() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [WorkspaceComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.detectChanges();
    return fixture;
  }

  async function renderLive() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [WorkspaceComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.componentRef.setInput('liveRegistry', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  async function renderRepository(repoPath: string) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [WorkspaceComponent],
    }).compileComponents();

    if (!process.env.GIT_MANAGER_REGISTRY_PATH) {
      process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    }
    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.componentRef.setInput('repositoryPath', repoPath);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
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

  it('pins the content sheet to the top, right, and bottom after a repository is chosen', async () => {
    const fixture = await render();
    expect(fixture.nativeElement.querySelector('[data-testid="content-sheet"]')).toBeNull();

    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const sheet = fixture.nativeElement.querySelector('[data-testid="content-sheet"]');
    const style = getComputedStyle(sheet);
    expect(style.position).toBe('fixed');
    expect(style.top).toBe('0px');
    expect(style.right).toBe('0px');
    expect(style.bottom).toBe('0px');
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
    expect(branchList.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    const controls = [...sidebar.querySelectorAll('button, a, input, select, textarea')];
    expect(controls.at(-1)).toBe(create);
  });

  it('notes that a remote-only branch is fetched first and when create hooks run', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const note = fixture.nativeElement.querySelector('.create-note');
    expect(note.textContent.trim()).toBe(
      'A remote-only branch is fetched first. Pre-create hooks run before the worktree is added. Post-create hooks run after checkout.',
    );
  });

  it('opens a branch menu where squash is inside Merge and remove is outside it', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('[data-branch="feature/login"]');
    const closedMenu = row.querySelector('[data-testid="hover-menu"]');
    expect(closedMenu.classList.contains('is-open')).toBe(false);
    const css = [...document.querySelectorAll('style')].map((style) => style.textContent ?? '').join('\n');
    expect(css).toContain(':hover');
    row.querySelector('[data-testid="branch-menu"]').click();
    fixture.detectChanges();

    const menu = row.querySelector('[data-testid="hover-menu"]');
    const group = menu.querySelector('fieldset');
    expect(group.querySelector('legend').textContent.trim()).toBe('Merge');
    expect(group.querySelector('[data-testid="update-from-master"]')).not.toBeNull();
    expect(group.querySelector('[data-testid="merge-into-master"]')).not.toBeNull();
    const squash = group.querySelector('[data-testid="squash"]');
    expect(squash.getAttribute('type')).toBe('checkbox');
    const remove = menu.querySelector('[data-testid="remove-worktree"]');
    expect(group.contains(remove)).toBe(false);
    expect(squash.parentElement).not.toBe(remove.parentElement);
    expect(squash.parentElement).not.toBe(group.parentElement);
  });

  it('counts the commits that exist only on feature/login in the branch summary', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();

    const summary = fixture.nativeElement.querySelector('.branch-heading p');
    expect(summary.textContent.trim()).toBe('2 commits only on this branch · 2 changed files');

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

  it('shows the working tree diff when src/login.ts is chosen', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Harbor"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-branch="feature/login"]').click();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="changed-file"][data-path="src/login.ts"]').click();
    fixture.detectChanges();

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

    fixture.nativeElement.querySelector('[data-testid="commit"][data-subject="Add the login form"]').click();
    fixture.detectChanges();

    const commitFiles = fixture.nativeElement.querySelector('[data-testid="commit-files"]');
    const file = commitFiles.querySelector('[data-testid="changed-file"]');
    expect(file.getAttribute('data-path')).toBe('src/login.ts');
    expect(file.querySelector('[data-testid="lines-added"]').textContent.trim()).toBe('10');
    expect(file.querySelector('[data-testid="lines-deleted"]').textContent.trim()).toBe('0');

    const diff = fixture.nativeElement.querySelector('[data-testid="diff"]');
    expect(diff.textContent).toContain('+function login');
    expect(leftEdge(diff)).toBeGreaterThan(leftEdge(commitFiles));
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

    expect(fixture.nativeElement.querySelector('[data-testid="switch-repository"]')).toBeNull();
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
    expect(leftEdge(diff)).toBeGreaterThan(leftEdge(commitFiles));

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

  it('creates the notes worktree from the button', async () => {
    const repoPath = createEmptyRepository(roots);
    git(repoPath, ['branch', 'notes']);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(repoPath, '..', 'registry.db');
    addRepository(repoPath, 'Harbor');
    const fixture = await renderRepository(repoPath);

    const field = fixture.nativeElement.querySelector('[data-testid="create-branch"]');
    field.value = 'notes';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const checkout = join(repoPath, '.workspaces', 'notes');
    expect(git(checkout, ['branch', '--show-current'])).toBe('notes');
    expect(git(repoPath, ['worktree', 'list'])).toContain(checkout);
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
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

    const field = fixture.nativeElement.querySelector('[data-testid="create-branch"]');
    field.value = 'feature/notes';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="workspace-error"]').textContent).toContain(
      `Worktree folder already exists: ${checkout}`,
    );
    expect(git(repoPath, ['worktree', 'list'])).toBe(worktreesBefore);
    expect(readFileSync(join(checkout, 'keep.txt'), 'utf8')).toBe('stay');
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

    const field = fixture.nativeElement.querySelector('[data-testid="create-branch"]');
    field.value = 'notes';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    await untilVisible(fixture, (root) =>
      (root.querySelector('[data-testid="workspace-error"]')?.textContent ?? '').includes(
        'abort-create aborted worktree create',
      ),
    );
    expect(fixture.nativeElement.querySelector('[data-testid="workspace-error"]').textContent).toContain(
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

    const field = fixture.nativeElement.querySelector('[data-testid="create-branch"]');
    field.value = 'notes';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
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

    const field = fixture.nativeElement.querySelector('[data-testid="create-branch"]');
    field.value = 'notes';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="create-worktree"]').click();
    const copied = join(repoPath, '.workspaces', 'notes', '.env');
    await untilVisible(fixture, () => existsSync(copied));

    expect(readFileSync(copied, 'utf8')).toBe('SECRET=1\n');
    writeFileSync(copied, 'SECRET=1\nTOKEN=2\n');
    expect(readFileSync(copied, 'utf8')).toBe('SECRET=1\nTOKEN=2\n');
    expect(readFileSync(join(repoPath, '.env'), 'utf8')).toBe('SECRET=1\n');
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

    expect(fixture.nativeElement.querySelector('[data-testid="workspace-error"]').textContent).toContain(
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

    expect(readFileSync(join(checkout, 'master.txt'), 'utf8')).toBe('from master\n');
    expect(git(checkout, ['log', '-1', '--format=%s'])).toBe('master change');
    expect(git(checkout, ['branch', '--show-current'])).toBe('feature');
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
    expect(row.querySelector('[data-testid="behind"]').textContent.trim()).toBe('0');
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
    row.querySelector('[data-testid="squash"]').click();
    fixture.detectChanges();
    row.querySelector('[data-testid="merge-into-master"]').click();
    fixture.detectChanges();

    expect(readFileSync(join(repoPath, 'feature.txt'), 'utf8')).toBe('from feature\n');
    expect(git(repoPath, ['log', '--format=%s'])).toBe('Squash feature into master\ninit');
    expect(git(repoPath, ['branch', '--show-current'])).toBe('master');
    expect(git(checkout, ['log', '-1', '--format=%s'])).toBe('feature change');
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
    const previousSearch = location.search;
    history.replaceState(null, '', `${location.pathname}?live=1`);
    try {
      const fixture = await render();
      const card = fixture.nativeElement.querySelector('[data-testid="repository-card"]');

      expect(card).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="branch-list"]')).toBeNull();
      expect(card.querySelector('[data-testid="repository"][data-name="Harbor"]')).toBeNull();
      expect(card.querySelector('[data-testid="repository"][data-name="Atlas"]')).toBeNull();
    } finally {
      history.replaceState(null, '', `${location.pathname}${previousSearch}`);
    }
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

    const fixture = await renderLive();
    expect(fixture.nativeElement.querySelector('[data-testid="repository"]')).toBeNull();

    const pathField = fixture.nativeElement.querySelector('[data-testid="add-repository-path"]');
    const nameField = fixture.nativeElement.querySelector('[data-testid="add-repository-name"]');
    pathField.value = pier;
    pathField.dispatchEvent(new Event('input'));
    nameField.value = 'Pier';
    nameField.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="add-repository"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="repository"][data-name="Pier"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="card-error"]')).toBeNull();
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

function leftEdge(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  if (rect.left !== 0 || rect.width !== 0) {
    return rect.left;
  }
  return Number.parseFloat(getComputedStyle(element).left);
}

function rowText(rows: Element[], testId: string): string[] {
  return rows.map((row) => row.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '');
}

function createEmptyRepository(roots: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'git-manager-desktop-'));
  roots.push(root);
  const repoPath = join(root, 'harbor');
  initGitRepo(repoPath);
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

function initGitRepo(repoPath: string): void {
  mkdirSync(repoPath, { recursive: true });
  execFileSync('git', ['init', '-b', 'master'], { cwd: repoPath, stdio: 'ignore' });
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
