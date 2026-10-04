import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { addRepository } from '../src/registry';
import {
  appTmuxSessions,
  createBranchSession,
  killTmuxSession,
  listTmuxSessions,
  nextSessionIndex,
  sessionDirectory,
  sessionName,
  sessionsForBranch,
  tmuxBinary,
} from '../src/desktop/tmux-sessions';
import { WorkspaceComponent } from '../src/desktop/workspace.component';

const emptyGitConfig = join(tmpdir(), 'git-manager-prefix-gitconfig');
writeFileSync(emptyGitConfig, '');
process.env.GIT_CONFIG_GLOBAL = emptyGitConfig;
process.env.GIT_CONFIG_SYSTEM = emptyGitConfig;
process.env.GIT_TERMINAL_PROMPT = '0';

function repoHash(repoPath: string): string {
  return createHash('sha256').update(resolve(repoPath)).digest('hex').slice(0, 8);
}

function createDirectory(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function tmuxEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TMUX;
  delete env.TMUX_PANE;
  return env;
}

function startUntaggedSession(name: string, cwd: string): void {
  execFileSync(tmuxBinary(), ['new-session', '-d', '-s', name, '-c', cwd], {
    stdio: 'ignore',
    env: tmuxEnv(),
  });
}

function createRepo(
  prefix: string,
  branches: ReadonlyArray<{ name: string; folder: string }>,
): { root: string; repo: string } {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const repo = join(root, 'billing');
  mkdirSync(repo);
  execFileSync('git', ['init', '-b', 'master'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@git-manager.local'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'git-manager test'], { cwd: repo, stdio: 'ignore' });
  writeFileSync(join(repo, 'README'), 'hi\n');
  execFileSync('git', ['add', 'README'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repo, stdio: 'ignore' });
  mkdirSync(join(repo, '.workspaces'));
  for (const branch of branches) {
    addWorktree(repo, branch.name, join(repo, '.workspaces', branch.folder));
  }
  return { root, repo };
}

function addWorktree(repo: string, branch: string, path: string): void {
  execFileSync('git', ['branch', branch], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['worktree', 'add', path, branch], { cwd: repo, stdio: 'ignore' });
}

function writeSettings(root: string, settings: Record<string, string>): void {
  const settingsPath = join(root, 'app-settings.json');
  writeFileSync(settingsPath, `${JSON.stringify(settings)}\n`);
  process.env.GIT_MANAGER_APP_SETTINGS_PATH = settingsPath;
}

async function renderWorkspace(
  repo: string | null,
  options?: { liveRegistry?: boolean },
): Promise<ComponentFixture<WorkspaceComponent>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [WorkspaceComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(WorkspaceComponent);
  if (repo !== null) {
    fixture.componentRef.setInput('repositoryPath', repo);
  }
  if (options?.liveRegistry) {
    fixture.componentRef.setInput('liveRegistry', true);
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

function clickTestId(fixture: ComponentFixture<WorkspaceComponent>, testId: string): void {
  const button = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${testId} is not shown`);
  }
  button.click();
  fixture.detectChanges();
}

function openSettings(fixture: ComponentFixture<WorkspaceComponent>): void {
  const button = fixture.nativeElement.querySelector('[data-testid="app-settings"]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('App settings is not shown');
  }
  button.click();
  fixture.detectChanges();
}

function clickMode(fixture: ComponentFixture<WorkspaceComponent>, mode: 'none' | 'terminal' | 'tmux'): void {
  const dialog = fixture.nativeElement.querySelector('[data-testid="app-settings-dialog"]');
  const input = dialog?.querySelector(`[data-testid="terminal-mode-${mode}"]`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`${mode} is not shown`);
  }
  input.click();
  fixture.detectChanges();
}

function clickModeAction(fixture: ComponentFixture<WorkspaceComponent>, action: 'keep' | 'kill' | 'cancel'): void {
  const button = fixture.nativeElement.querySelector(`[data-testid="terminal-mode-${action}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${action} is not shown`);
  }
  button.click();
  fixture.detectChanges();
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

async function waitFor(check: () => boolean): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    if (check()) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error('timed out waiting for the terminal');
}

describe('branch tmux session prefix', () => {
  const roots: string[] = [];
  let fixture: ComponentFixture<WorkspaceComponent> | undefined;
  let previousRegistry: string | undefined;
  let previousSettings: string | undefined;

  beforeEach(() => {
    previousRegistry = process.env.GIT_MANAGER_REGISTRY_PATH;
    previousSettings = process.env.GIT_MANAGER_APP_SETTINGS_PATH;
    const settingsRoot = mkdtempSync(join(tmpdir(), 'git-manager-prefix-settings-'));
    roots.push(settingsRoot);
    process.env.GIT_MANAGER_APP_SETTINGS_PATH = join(settingsRoot, 'app-settings.json');
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    for (const name of listTmuxSessions()) {
      const directory = sessionDirectory(name);
      if (name === 'outside-kept' || roots.some((root) => directory.startsWith(root))) {
        killTmuxSession(name);
      }
    }
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
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

  it('does not list a feature/foo session for feature-foo', () => {
    const repo = createDirectory('git-manager-prefix-');
    roots.push(repo);
    const hash = repoHash(repo);
    const expected = `gm_${hash}_feature/foo_1`;

    expect(sessionName(repo, 'feature/foo', 1)).toBe(expected);
    expect(createBranchSession(repo, 'feature/foo', repo, 1)).toBe(expected);
    expect(sessionsForBranch(repo, 'feature/foo')).toEqual([expected]);
    expect(sessionsForBranch(repo, 'feature-foo')).toEqual([]);
  });

  it('does not list a feature-foo session for feature/foo', () => {
    const repo = createDirectory('git-manager-prefix-');
    roots.push(repo);
    const hash = repoHash(repo);
    const expected = `gm_${hash}_feature-foo_1`;

    expect(sessionName(repo, 'feature-foo', 1)).toBe(expected);
    expect(createBranchSession(repo, 'feature-foo', repo, 1)).toBe(expected);
    expect(sessionsForBranch(repo, 'feature-foo')).toEqual([expected]);
    expect(sessionsForBranch(repo, 'feature/foo')).toEqual([]);
  });

  it('does not list a tagged session from another repository', () => {
    const left = createDirectory('git-manager-prefix-left-');
    const right = createDirectory('git-manager-prefix-right-');
    roots.push(left, right);
    const leftName = `gm_${repoHash(left)}_feature_1`;
    const rightName = `gm_${repoHash(right)}_feature_1`;

    expect(createBranchSession(left, 'feature', left, 1)).toBe(leftName);
    expect(sessionsForBranch(right, 'feature')).toEqual([]);
    expect(sessionsForBranch(left, 'feature')).toEqual([leftName]);
    expect(createBranchSession(right, 'feature', right, 1)).toBe(rightName);
    expect(sessionsForBranch(left, 'feature')).toEqual([leftName]);
    expect(sessionsForBranch(right, 'feature')).toEqual([rightName]);
  });

  it('keeps a tmux-safe branch name in the session', () => {
    const repo = createDirectory('git-manager-prefix-');
    roots.push(repo);
    const hash = repoHash(repo);
    const expected = `gm_${hash}_feature_1`;

    expect(sessionName(repo, 'feature', 1)).toBe(expected);
    expect(createBranchSession(repo, 'feature', repo, 1)).toBe(expected);
    expect(sessionsForBranch(repo, 'feature')).toEqual([expected]);
  });

  it('does not reuse the index of a recognized session', () => {
    const repo = createDirectory('git-manager-prefix-');
    roots.push(repo);
    const hash = repoHash(repo);
    const legacy = `gm_${hash}_feature-foo_1`;
    const remembered = `gm_${hash}_feature/foo_3`;
    startUntaggedSession(legacy, repo);

    expect(nextSessionIndex(repo, 'feature/foo', [])).toBe(2);
    expect(nextSessionIndex(repo, 'feature/foo', [remembered])).toBe(4);
    const created = createBranchSession(repo, 'feature/foo', repo, nextSessionIndex(repo, 'feature/foo', []));
    expect(created).toBe(`gm_${hash}_feature/foo_2`);
    expect(sessionsForBranch(repo, 'feature/foo')).toEqual([legacy, `gm_${hash}_feature/foo_2`]);
    expect(sessionsForBranch(repo, 'feature-foo')).toEqual([legacy]);
  });

  it('leaves an existing untagged session untagged', () => {
    const repo = createDirectory('git-manager-prefix-');
    roots.push(repo);
    const hash = repoHash(repo);
    const existing = `gm_${hash}_feature-foo_1`;
    startUntaggedSession(existing, repo);

    expect(createBranchSession(repo, 'feature-foo', repo, 1)).toBe(existing);
    expect(sessionsForBranch(repo, 'feature-foo')).toEqual([existing]);
    expect(sessionsForBranch(repo, 'feature/foo')).toEqual([existing]);
  });

  it('matches a slash or hex-encoded app session and ignores a session that is not the app', () => {
    const repo = createDirectory('git-manager-prefix-');
    roots.push(repo);
    const hash = repoHash(repo);
    const slash = `gm_${hash}_feature/foo_1`;
    const safe = `gm_${hash}_feature_1`;
    const encoded = `gm_${hash}_feature-2efoo_1`;
    expect(createBranchSession(repo, 'feature/foo', repo, 1)).toBe(slash);
    expect(createBranchSession(repo, 'feature', repo, 1)).toBe(safe);
    startUntaggedSession(encoded, repo);
    startUntaggedSession('outside-kept', repo);

    const matched = appTmuxSessions();
    expect(matched).toContain(slash);
    expect(matched).toContain(safe);
    expect(matched).toContain(encoded);
    expect(matched).not.toContain('outside-kept');
  });

  it('encodes a dot or colon so the session stays distinct from a hyphenated branch', () => {
    const repo = createDirectory('git-manager-prefix-');
    roots.push(repo);
    const hash = repoHash(repo);
    const dotted = `gm_${hash}_feature-2efoo_1`;
    const colon = `gm_${hash}_feature-3afoo_1`;

    expect(sessionName(repo, 'feature.foo', 1)).toBe(dotted);
    expect(sessionName(repo, 'feature:foo', 1)).toBe(colon);
    expect(createBranchSession(repo, 'feature.foo', repo, 1)).toBe(dotted);
    expect(sessionsForBranch(repo, 'feature.foo')).toEqual([dotted]);
    expect(sessionsForBranch(repo, 'feature-foo')).toEqual([]);
    expect(appTmuxSessions()).toContain(dotted);
  });

  it('still lists an untagged legacy session for the branch that created it', () => {
    const repo = createDirectory('git-manager-prefix-');
    roots.push(repo);
    const hash = repoHash(repo);
    const legacySlash = `gm_${hash}_feature-foo_1`;
    const legacySafe = `gm_${hash}_feature_1`;
    startUntaggedSession(legacySlash, repo);
    startUntaggedSession(legacySafe, repo);

    expect(sessionsForBranch(repo, 'feature/foo')).toEqual([legacySlash]);
    expect(sessionsForBranch(repo, 'feature-foo')).toEqual([legacySlash]);
    expect(sessionsForBranch(repo, 'feature')).toEqual([legacySafe]);
  });

  it('keeps New, Split, and Kill on one branch off the other branch', async () => {
    const repo = createRepo('git-manager-prefix-', [
      { name: 'feature/foo', folder: 'slash-foo' },
      { name: 'feature-foo', folder: 'feature-foo' },
    ]);
    roots.push(repo.root);
    const hash = repoHash(repo.repo);
    const slash = [1, 2, 3].map((index) => `gm_${hash}_feature/foo_${index}`);
    const hyphen = [1, 2, 3].map((index) => `gm_${hash}_feature-foo_${index}`);
    writeSettings(repo.root, { terminalMode: 'tmux' });
    fixture = await renderWorkspace(repo.repo);

    expect(terminalCount(fixture, 'feature/foo')).toBeNull();
    expect(terminalCount(fixture, 'feature-foo')).toBeNull();

    clickBranch(fixture, 'feature/foo');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature/foo').length === 1);
    expect(sessionsForBranch(repo.repo, 'feature/foo')).toEqual([slash[0]]);
    expect(sessionsForBranch(repo.repo, 'feature-foo')).toEqual([]);
    expect(terminalCount(fixture, 'feature/foo')).toBe('1');
    expect(terminalCount(fixture, 'feature-foo')).toBeNull();

    clickTestId(fixture, 'terminal-new');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature/foo').length === 2);
    expect(sessionsForBranch(repo.repo, 'feature/foo')).toEqual([slash[0], slash[1]]);
    expect(sessionsForBranch(repo.repo, 'feature-foo')).toEqual([]);
    expect(terminalCount(fixture, 'feature/foo')).toBe('2');
    expect(terminalCount(fixture, 'feature-foo')).toBeNull();

    clickTestId(fixture, 'terminal-split-button');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature/foo').length === 3);
    expect(sessionsForBranch(repo.repo, 'feature/foo')).toEqual(slash);
    expect(sessionsForBranch(repo.repo, 'feature-foo')).toEqual([]);
    expect(terminalCount(fixture, 'feature/foo')).toBe('3');
    expect(terminalCount(fixture, 'feature-foo')).toBeNull();

    clickBranch(fixture, 'feature-foo');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature-foo').length === 1);
    expect(sessionsForBranch(repo.repo, 'feature-foo')).toEqual([hyphen[0]]);
    expect(sessionsForBranch(repo.repo, 'feature/foo')).toEqual(slash);
    expect(terminalCount(fixture, 'feature/foo')).toBe('3');
    expect(terminalCount(fixture, 'feature-foo')).toBe('1');

    clickTestId(fixture, 'terminal-new');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature-foo').length === 2);
    expect(sessionsForBranch(repo.repo, 'feature-foo')).toEqual([hyphen[0], hyphen[1]]);
    expect(sessionsForBranch(repo.repo, 'feature/foo')).toEqual(slash);
    expect(terminalCount(fixture, 'feature-foo')).toBe('2');
    expect(terminalCount(fixture, 'feature/foo')).toBe('3');

    clickTestId(fixture, 'terminal-split-button');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature-foo').length === 3);
    expect(sessionsForBranch(repo.repo, 'feature-foo')).toEqual(hyphen);
    expect(sessionsForBranch(repo.repo, 'feature/foo')).toEqual(slash);
    expect(terminalCount(fixture, 'feature-foo')).toBe('3');
    expect(terminalCount(fixture, 'feature/foo')).toBe('3');

    clickTestId(fixture, 'terminal-kill');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature-foo').length === 2);
    expect(sessionsForBranch(repo.repo, 'feature/foo')).toEqual(slash);
    expect(slash.every((name) => hasSession(name))).toBe(true);
    expect(terminalCount(fixture, 'feature-foo')).toBe('2');
    expect(terminalCount(fixture, 'feature/foo')).toBe('3');

    clickBranch(fixture, 'feature/foo');
    clickTestId(fixture, 'terminal-kill');
    await waitFor(() => sessionsForBranch(repo.repo, 'feature/foo').length === 2);
    const hyphenLeft = sessionsForBranch(repo.repo, 'feature-foo');
    expect(hyphenLeft).toHaveLength(2);
    expect(hyphenLeft.every((name) => hyphen.includes(name))).toBe(true);
    expect(hyphenLeft.every((name) => hasSession(name))).toBe(true);
    expect(terminalCount(fixture, 'feature/foo')).toBe('2');
    expect(terminalCount(fixture, 'feature-foo')).toBe('2');
  });

  it('kills a slash-branch session for a repository that is not open and leaves other sessions', async () => {
    const harbor = createRepo('git-manager-prefix-harbor-', [
      { name: 'feature/foo', folder: 'slash-foo' },
    ]);
    const atlas = createRepo('git-manager-prefix-atlas-', [
      { name: 'feature', folder: 'feature' },
    ]);
    roots.push(harbor.root, atlas.root);
    writeSettings(harbor.root, { terminalMode: 'tmux' });
    process.env.GIT_MANAGER_REGISTRY_PATH = join(harbor.root, 'registry.db');
    addRepository(harbor.repo, 'Harbor');
    addRepository(atlas.repo, 'Atlas');
    startUntaggedSession('outside-kept', harbor.root);
    fixture = await renderWorkspace(null, { liveRegistry: true });
    chooseRepository(fixture, 'Harbor');
    clickBranch(fixture, 'feature/foo');
    await waitFor(() => sessionsForBranch(harbor.repo, 'feature/foo').length === 1);
    const harborSession = `gm_${repoHash(harbor.repo)}_feature/foo_1`;
    expect(sessionsForBranch(harbor.repo, 'feature/foo')).toEqual([harborSession]);

    switchRepository(fixture, 'Atlas');
    clickBranch(fixture, 'feature');
    await waitFor(() => sessionsForBranch(atlas.repo, 'feature').length === 1);
    const atlasSession = `gm_${repoHash(atlas.repo)}_feature_1`;
    expect(sessionsForBranch(atlas.repo, 'feature')).toEqual([atlasSession]);
    expect(hasSession(harborSession)).toBe(true);

    openSettings(fixture);
    clickMode(fixture, 'terminal');
    clickModeAction(fixture, 'kill');

    expect(sessionsForBranch(harbor.repo, 'feature/foo')).toEqual([]);
    expect(sessionsForBranch(atlas.repo, 'feature')).toEqual([]);
    expect(hasSession(harborSession)).toBe(false);
    expect(hasSession(atlasSession)).toBe(false);
    expect(hasSession('outside-kept')).toBe(true);
  });
});
