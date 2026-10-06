import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { addRepository } from '../src/registry';
import { createRepository as createRepo, renderWorkspace, waitForTerminal as waitFor } from './desktop-terminal-harness';
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

const emptyGitConfig = join(tmpdir(), 'git-worktree-manager-prefix-gitconfig');
writeFileSync(emptyGitConfig, '');
process.env.GIT_CONFIG_GLOBAL = emptyGitConfig;
process.env.GIT_CONFIG_SYSTEM = emptyGitConfig;
process.env.GIT_TERMINAL_PROMPT = '0';

function repoHash(repoPath: string): string {
  return createHash('sha256').update(resolve(repoPath)).digest('hex').slice(0, 8);
}

function branchHash(branch: string): string {
  return createHash('sha256').update(branch).digest('hex').slice(0, 8);
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

function writeSettings(root: string, settings: Record<string, string>): void {
  const settingsPath = join(root, 'app-settings.json');
  writeFileSync(settingsPath, `${JSON.stringify(settings)}\n`);
  process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH = settingsPath;
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
  const tab = fixture.nativeElement.querySelector(`[data-testid="repository-tab"][data-name="${name}"]`);
  if (tab instanceof HTMLButtonElement) {
    tab.click();
    fixture.detectChanges();
    return;
  }
  const button = fixture.nativeElement.querySelector('[data-testid="open-repository-card"]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Open repository is not shown');
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

function recordedBranch(session: string): string {
  try {
    return execFileSync(tmuxBinary(), ['show-options', '-v', '-t', session, '@gm_branch'], {
      encoding: 'utf8',
      env: tmuxEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function oldSessionDialog(fixture: ComponentFixture<WorkspaceComponent>): HTMLElement | null {
  const dialog = fixture.nativeElement.querySelector('[data-testid="old-session-dialog"]');
  return dialog instanceof HTMLElement ? dialog : null;
}

function oldSessionRow(dialog: ParentNode, session: string): HTMLElement {
  const row = dialog.querySelector(`[data-testid="old-session"][data-session="${session}"]`);
  if (!(row instanceof HTMLElement)) {
    throw new Error(`${session} is not in the question`);
  }
  return row;
}

function oldSessionBranch(row: ParentNode, branch: string): HTMLButtonElement {
  const button = row.querySelector(`[data-testid="old-session-branch"][data-branch="${branch}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${branch} is not offered`);
  }
  return button;
}

describe('branch tmux session prefix', () => {
  const roots: string[] = [];
  let fixture: ComponentFixture<WorkspaceComponent> | undefined;
  let previousRegistry: string | undefined;
  let previousSettings: string | undefined;

  beforeEach(() => {
    previousRegistry = process.env.GIT_WORKTREE_MANAGER_REGISTRY_PATH;
    previousSettings = process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH;
    const settingsRoot = mkdtempSync(join(tmpdir(), 'git-worktree-manager-prefix-settings-'));
    roots.push(settingsRoot);
    process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH = join(settingsRoot, 'app-settings.json');
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
      delete process.env.GIT_WORKTREE_MANAGER_REGISTRY_PATH;
    } else {
      process.env.GIT_WORKTREE_MANAGER_REGISTRY_PATH = previousRegistry;
    }
    if (previousSettings === undefined) {
      delete process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH;
    } else {
      process.env.GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH = previousSettings;
    }
  });

  it('does not list a feature/foo session for feature-foo', () => {
    const repo = createDirectory('git-worktree-manager-prefix-');
    roots.push(repo);
    const hash = repoHash(repo);
    const expected = `gm_${hash}_feature/foo_1`;

    expect(sessionName(repo, 'feature/foo', 1)).toBe(expected);
    expect(createBranchSession(repo, 'feature/foo', repo, 1)).toBe(expected);
    expect(sessionsForBranch(repo, 'feature/foo')).toEqual([expected]);
    expect(sessionsForBranch(repo, 'feature-foo')).toEqual([]);
  });

  it('does not list a feature-foo session for feature/foo', () => {
    const repo = createDirectory('git-worktree-manager-prefix-');
    roots.push(repo);
    const hash = repoHash(repo);
    const expected = `gm_${hash}_feature-foo_1`;

    expect(sessionName(repo, 'feature-foo', 1)).toBe(expected);
    expect(createBranchSession(repo, 'feature-foo', repo, 1)).toBe(expected);
    expect(sessionsForBranch(repo, 'feature-foo')).toEqual([expected]);
    expect(sessionsForBranch(repo, 'feature/foo')).toEqual([]);
  });

  it('does not list a tagged session from another repository', () => {
    const left = createDirectory('git-worktree-manager-prefix-left-');
    const right = createDirectory('git-worktree-manager-prefix-right-');
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
    const repo = createDirectory('git-worktree-manager-prefix-');
    roots.push(repo);
    const hash = repoHash(repo);
    const expected = `gm_${hash}_feature_1`;

    expect(sessionName(repo, 'feature', 1)).toBe(expected);
    expect(createBranchSession(repo, 'feature', repo, 1)).toBe(expected);
    expect(sessionsForBranch(repo, 'feature')).toEqual([expected]);
  });

  it('does not reuse the index of a recognized session', () => {
    const repo = createDirectory('git-worktree-manager-prefix-');
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
    const repo = createDirectory('git-worktree-manager-prefix-');
    roots.push(repo);
    const hash = repoHash(repo);
    const existing = `gm_${hash}_feature-foo_1`;
    startUntaggedSession(existing, repo);

    expect(createBranchSession(repo, 'feature-foo', repo, 1)).toBe(existing);
    expect(sessionsForBranch(repo, 'feature-foo')).toEqual([existing]);
    expect(sessionsForBranch(repo, 'feature/foo')).toEqual([existing]);
  });

  it('matches a slash or hex-encoded app session and ignores a session that is not the app', () => {
    const repo = createDirectory('git-worktree-manager-prefix-');
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
    const repo = createDirectory('git-worktree-manager-prefix-');
    roots.push(repo);
    const hash = repoHash(repo);
    const dotted = `gm_${hash}_feature-2efoo/${branchHash('feature.foo')}_1`;
    const colon = `gm_${hash}_feature-3afoo/${branchHash('feature:foo')}_1`;
    const encodedSafe = `gm_${hash}_feature-2efoo_1`;

    expect(sessionName(repo, 'feature.foo', 1)).toBe(dotted);
    expect(sessionName(repo, 'feature:foo', 1)).toBe(colon);
    expect(sessionName(repo, 'feature-2efoo', 1)).toBe(encodedSafe);
    expect(createBranchSession(repo, 'feature.foo', repo, 1)).toBe(dotted);
    expect(createBranchSession(repo, 'feature-2efoo', repo, 1)).toBe(encodedSafe);
    expect(sessionsForBranch(repo, 'feature.foo')).toEqual([dotted]);
    expect(sessionsForBranch(repo, 'feature-2efoo')).toEqual([encodedSafe]);
    expect(sessionsForBranch(repo, 'feature-foo')).toEqual([]);
    expect(appTmuxSessions()).toContain(dotted);
    expect(appTmuxSessions()).toContain(encodedSafe);
  });

  it('still lists an untagged legacy session for the branch that created it', () => {
    const repo = createDirectory('git-worktree-manager-prefix-');
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

  it('tags an untagged feature session when that branch is the only match and does not ask', async () => {
    const repo = createRepo('git-worktree-manager-prefix-', [{ name: 'feature', folder: 'feature' }]);
    roots.push(repo.root);
    const session = `gm_${repoHash(repo.repo)}_feature_1`;
    startUntaggedSession(session, repo.repo);

    fixture = await renderWorkspace(repo.repo);

    expect(oldSessionDialog(fixture)).toBeNull();
    expect(recordedBranch(session)).toBe('feature');
    expect(hasSession(session)).toBe(true);
    expect(listTmuxSessions()).toContain(session);
    expect(sessionsForBranch(repo.repo, 'feature')).toEqual([session]);
    expect(branchRow(fixture, 'feature')).toBeInstanceOf(HTMLElement);
  });

  it('tags an untagged feature-foo session as feature/foo when that is the only match and keeps the old name', async () => {
    const repo = createRepo('git-worktree-manager-prefix-', [{ name: 'feature/foo', folder: 'slash-foo' }]);
    roots.push(repo.root);
    const hash = repoHash(repo.repo);
    const session = `gm_${hash}_feature-foo_1`;
    startUntaggedSession(session, repo.repo);

    fixture = await renderWorkspace(repo.repo);

    expect(oldSessionDialog(fixture)).toBeNull();
    expect(recordedBranch(session)).toBe('feature/foo');
    expect(hasSession(session)).toBe(true);
    expect(listTmuxSessions()).toContain(session);
    expect(listTmuxSessions()).not.toContain(`gm_${hash}_feature/foo_1`);
    expect(sessionsForBranch(repo.repo, 'feature/foo')).toEqual([session]);
  });

  it('does not list a silently tagged session for a branch created later with the same old name', async () => {
    const repo = createRepo('git-worktree-manager-prefix-', [{ name: 'feature/foo', folder: 'slash-foo' }]);
    roots.push(repo.root);
    const session = `gm_${repoHash(repo.repo)}_feature-foo_1`;
    startUntaggedSession(session, repo.repo);
    fixture = await renderWorkspace(repo.repo);

    execFileSync('git', ['branch', 'feature-foo'], { cwd: repo.repo, stdio: 'ignore' });

    expect(recordedBranch(session)).toBe('feature/foo');
    expect(sessionsForBranch(repo.repo, 'feature/foo')).toEqual([session]);
    expect(sessionsForBranch(repo.repo, 'feature-foo')).toEqual([]);
  });

  it('asks before keeping an untagged session that matches two branches', async () => {
    const repo = createRepo('git-worktree-manager-prefix-', [
      { name: 'feature/foo', folder: 'slash-foo' },
      { name: 'feature-foo', folder: 'feature-foo' },
    ]);
    roots.push(repo.root);
    const session = `gm_${repoHash(repo.repo)}_feature-foo_1`;
    startUntaggedSession(session, repo.repo);

    fixture = await renderWorkspace(repo.repo);

    const dialog = oldSessionDialog(fixture);
    if (!(dialog instanceof HTMLElement)) {
      throw new Error('Old session question is not shown');
    }
    expect(recordedBranch(session)).toBe('');
    expect(hasSession(session)).toBe(true);
    const row = oldSessionRow(dialog, session);
    expect(oldSessionBranch(row, 'feature/foo').textContent?.trim()).toBe('feature/foo');
    expect(oldSessionBranch(row, 'feature-foo').textContent?.trim()).toBe('feature-foo');
    expect(row.querySelector('[data-testid="old-session-kill"]')?.textContent?.trim()).toBe('Kill');
    expect(row.querySelector('[data-testid="old-session-leave"]')?.textContent?.trim()).toBe('Leave unchanged');
    expect(branchRow(fixture, 'feature/foo')).toBeInstanceOf(HTMLElement);
  });

  it('lists each ambiguous session and tags a session that matches one branch', async () => {
    const repo = createRepo('git-worktree-manager-prefix-', [
      { name: 'feature/foo', folder: 'slash-foo' },
      { name: 'feature-foo', folder: 'feature-foo' },
      { name: 'topic', folder: 'topic' },
    ]);
    roots.push(repo.root);
    const hash = repoHash(repo.repo);
    const first = `gm_${hash}_feature-foo_1`;
    const second = `gm_${hash}_feature-foo_2`;
    const unique = `gm_${hash}_topic_1`;
    startUntaggedSession(first, repo.repo);
    startUntaggedSession(second, repo.repo);
    startUntaggedSession(unique, repo.repo);

    fixture = await renderWorkspace(repo.repo);

    const dialog = oldSessionDialog(fixture);
    if (!(dialog instanceof HTMLElement)) {
      throw new Error('Old session question is not shown');
    }
    expect(dialog.querySelectorAll('[data-testid="old-session"]')).toHaveLength(2);
    expect(oldSessionRow(dialog, first)).toBeInstanceOf(HTMLElement);
    expect(oldSessionRow(dialog, second)).toBeInstanceOf(HTMLElement);
    expect(dialog.textContent).not.toContain(unique);
    expect(recordedBranch(unique)).toBe('topic');
    expect(recordedBranch(first)).toBe('');
    expect(recordedBranch(second)).toBe('');
  });

  it('keeps the old name and lists the session only for the branch the person chooses', async () => {
    const repo = createRepo('git-worktree-manager-prefix-', [
      { name: 'feature/foo', folder: 'slash-foo' },
      { name: 'feature-foo', folder: 'feature-foo' },
    ]);
    roots.push(repo.root);
    const hash = repoHash(repo.repo);
    const session = `gm_${hash}_feature-foo_1`;
    startUntaggedSession(session, repo.repo);
    fixture = await renderWorkspace(repo.repo);
    const dialog = oldSessionDialog(fixture);
    if (!(dialog instanceof HTMLElement)) {
      throw new Error('Old session question is not shown');
    }

    oldSessionBranch(oldSessionRow(dialog, session), 'feature/foo').click();
    fixture.detectChanges();

    expect(oldSessionDialog(fixture)).toBeNull();
    expect(recordedBranch(session)).toBe('feature/foo');
    expect(hasSession(session)).toBe(true);
    expect(listTmuxSessions()).toContain(session);
    expect(listTmuxSessions()).not.toContain(`gm_${hash}_feature/foo_1`);
    expect(sessionsForBranch(repo.repo, 'feature/foo')).toEqual([session]);
    expect(sessionsForBranch(repo.repo, 'feature-foo')).toEqual([]);
  });

  it('ends the session when the person chooses Kill', async () => {
    const repo = createRepo('git-worktree-manager-prefix-', [
      { name: 'feature/foo', folder: 'slash-foo' },
      { name: 'feature-foo', folder: 'feature-foo' },
    ]);
    roots.push(repo.root);
    const hash = repoHash(repo.repo);
    const session = `gm_${hash}_feature-foo_1`;
    const other = `gm_${hash}_feature-foo_2`;
    startUntaggedSession(session, repo.repo);
    startUntaggedSession(other, repo.repo);
    fixture = await renderWorkspace(repo.repo);
    const dialog = oldSessionDialog(fixture);
    if (!(dialog instanceof HTMLElement)) {
      throw new Error('Old session question is not shown');
    }

    const kill = oldSessionRow(dialog, session).querySelector('[data-testid="old-session-kill"]');
    if (!(kill instanceof HTMLButtonElement)) {
      throw new Error('Kill is not shown');
    }
    kill.click();
    fixture.detectChanges();

    expect(hasSession(session)).toBe(false);
    expect(sessionsForBranch(repo.repo, 'feature/foo')).not.toContain(session);
    expect(sessionsForBranch(repo.repo, 'feature-foo')).not.toContain(session);
    expect(hasSession(other)).toBe(true);
    expect(recordedBranch(other)).toBe('');
    const remaining = oldSessionDialog(fixture);
    if (!(remaining instanceof HTMLElement)) {
      throw new Error('The other session left the question');
    }
    expect(oldSessionRow(remaining, other)).toBeInstanceOf(HTMLElement);
  });

  it('leaves an ambiguous session unchanged and still opens the workspace', async () => {
    const repo = createRepo('git-worktree-manager-prefix-', [
      { name: 'feature/foo', folder: 'slash-foo' },
      { name: 'feature-foo', folder: 'feature-foo' },
    ]);
    roots.push(repo.root);
    const hash = repoHash(repo.repo);
    const session = `gm_${hash}_feature-foo_1`;
    const other = `gm_${hash}_feature-foo_2`;
    startUntaggedSession(session, repo.repo);
    startUntaggedSession(other, repo.repo);
    fixture = await renderWorkspace(repo.repo);
    const dialog = oldSessionDialog(fixture);
    if (!(dialog instanceof HTMLElement)) {
      throw new Error('Old session question is not shown');
    }

    const leave = oldSessionRow(dialog, session).querySelector('[data-testid="old-session-leave"]');
    if (!(leave instanceof HTMLButtonElement)) {
      throw new Error('Leave unchanged is not shown');
    }
    leave.click();
    fixture.detectChanges();

    expect(recordedBranch(session)).toBe('');
    expect(hasSession(session)).toBe(true);
    expect(listTmuxSessions()).toContain(session);
    expect(branchRow(fixture, 'feature/foo')).toBeInstanceOf(HTMLElement);
    const remaining = oldSessionDialog(fixture);
    if (!(remaining instanceof HTMLElement)) {
      throw new Error('The other session left the question');
    }
    expect(oldSessionRow(remaining, other)).toBeInstanceOf(HTMLElement);
    expect(remaining.textContent).not.toContain(session);
  });

  it('asks again when that repository is opened after a session was left unchanged', async () => {
    const harbor = createRepo('git-worktree-manager-prefix-harbor-', [
      { name: 'feature/foo', folder: 'slash-foo' },
      { name: 'feature-foo', folder: 'feature-foo' },
    ]);
    const atlas = createRepo('git-worktree-manager-prefix-atlas-', [{ name: 'feature', folder: 'feature' }]);
    roots.push(harbor.root, atlas.root);
    process.env.GIT_WORKTREE_MANAGER_REGISTRY_PATH = join(harbor.root, 'registry.db');
    addRepository(harbor.repo, 'Harbor');
    addRepository(atlas.repo, 'Atlas');
    const session = `gm_${repoHash(harbor.repo)}_feature-foo_1`;
    startUntaggedSession(session, harbor.repo);
    fixture = await renderWorkspace(null, { liveRegistry: true });
    chooseRepository(fixture, 'Harbor');

    const dialog = oldSessionDialog(fixture);
    if (!(dialog instanceof HTMLElement)) {
      throw new Error('Old session question is not shown');
    }
    const leave = oldSessionRow(dialog, session).querySelector('[data-testid="old-session-leave"]');
    if (!(leave instanceof HTMLButtonElement)) {
      throw new Error('Leave unchanged is not shown');
    }
    leave.click();
    fixture.detectChanges();
    expect(oldSessionDialog(fixture)).toBeNull();
    expect(recordedBranch(session)).toBe('');
    expect(hasSession(session)).toBe(true);
    expect(branchRow(fixture, 'feature/foo')).toBeInstanceOf(HTMLElement);

    switchRepository(fixture, 'Atlas');
    expect(oldSessionDialog(fixture)).toBeNull();
    expect(recordedBranch(session)).toBe('');
    expect(hasSession(session)).toBe(true);

    switchRepository(fixture, 'Harbor');
    const again = oldSessionDialog(fixture);
    if (!(again instanceof HTMLElement)) {
      throw new Error('Old session question is not shown again');
    }
    expect(oldSessionRow(again, session)).toBeInstanceOf(HTMLElement);
    expect(recordedBranch(session)).toBe('');
    expect(hasSession(session)).toBe(true);
  });

  it('leaves a session running and does not ask when its old name matches no branch', async () => {
    const repo = createRepo('git-worktree-manager-prefix-', [{ name: 'feature', folder: 'feature' }]);
    roots.push(repo.root);
    const session = `gm_${repoHash(repo.repo)}_retired_1`;
    startUntaggedSession(session, repo.repo);

    fixture = await renderWorkspace(repo.repo);

    expect(oldSessionDialog(fixture)).toBeNull();
    expect(recordedBranch(session)).toBe('');
    expect(hasSession(session)).toBe(true);
    expect(sessionsForBranch(repo.repo, 'feature')).not.toContain(session);
    expect(branchRow(fixture, 'feature')).toBeInstanceOf(HTMLElement);
  });

  it('leaves a tmux session that is not the app running and out of the question', async () => {
    const repo = createRepo('git-worktree-manager-prefix-', [
      { name: 'feature/foo', folder: 'slash-foo' },
      { name: 'feature-foo', folder: 'feature-foo' },
    ]);
    roots.push(repo.root);
    const session = `gm_${repoHash(repo.repo)}_feature-foo_1`;
    startUntaggedSession(session, repo.repo);
    startUntaggedSession('outside-kept', repo.repo);

    fixture = await renderWorkspace(repo.repo);

    const dialog = oldSessionDialog(fixture);
    if (!(dialog instanceof HTMLElement)) {
      throw new Error('Old session question is not shown');
    }
    expect(dialog.textContent).not.toContain('outside-kept');
    expect(oldSessionRow(dialog, session)).toBeInstanceOf(HTMLElement);
    expect(hasSession('outside-kept')).toBe(true);
    expect(recordedBranch('outside-kept')).toBe('');
  });

  it('leaves an old session for another repository until that repository is opened', async () => {
    const harbor = createRepo('git-worktree-manager-prefix-harbor-', [{ name: 'feature/foo', folder: 'slash-foo' }]);
    const atlas = createRepo('git-worktree-manager-prefix-atlas-', [{ name: 'feature', folder: 'feature' }]);
    roots.push(harbor.root, atlas.root);
    process.env.GIT_WORKTREE_MANAGER_REGISTRY_PATH = join(harbor.root, 'registry.db');
    addRepository(harbor.repo, 'Harbor');
    addRepository(atlas.repo, 'Atlas');
    const harborSession = `gm_${repoHash(harbor.repo)}_feature-foo_1`;
    const atlasSession = `gm_${repoHash(atlas.repo)}_feature_1`;
    startUntaggedSession(harborSession, harbor.repo);
    startUntaggedSession(atlasSession, atlas.repo);
    fixture = await renderWorkspace(null, { liveRegistry: true });

    chooseRepository(fixture, 'Harbor');

    expect(oldSessionDialog(fixture)).toBeNull();
    expect(recordedBranch(harborSession)).toBe('feature/foo');
    expect(listTmuxSessions()).toContain(harborSession);
    expect(recordedBranch(atlasSession)).toBe('');
    expect(hasSession(atlasSession)).toBe(true);

    switchRepository(fixture, 'Atlas');

    expect(oldSessionDialog(fixture)).toBeNull();
    expect(recordedBranch(atlasSession)).toBe('feature');
    expect(listTmuxSessions()).toContain(atlasSession);
    expect(recordedBranch(harborSession)).toBe('feature/foo');
    expect(hasSession(harborSession)).toBe(true);
  });

  it('leaves the remaining sessions unchanged when Escape closes the question', async () => {
    const repo = createRepo('git-worktree-manager-prefix-', [
      { name: 'feature/foo', folder: 'slash-foo' },
      { name: 'feature-foo', folder: 'feature-foo' },
    ]);
    roots.push(repo.root);
    const hash = repoHash(repo.repo);
    const first = `gm_${hash}_feature-foo_1`;
    const second = `gm_${hash}_feature-foo_2`;
    startUntaggedSession(first, repo.repo);
    startUntaggedSession(second, repo.repo);
    fixture = await renderWorkspace(repo.repo);
    expect(oldSessionDialog(fixture)).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(oldSessionDialog(fixture)).toBeNull();
    expect(recordedBranch(first)).toBe('');
    expect(recordedBranch(second)).toBe('');
    expect(hasSession(first)).toBe(true);
    expect(hasSession(second)).toBe(true);
    expect(branchRow(fixture, 'feature/foo')).toBeInstanceOf(HTMLElement);
  });

  it('leaves the remaining sessions unchanged when the question backdrop is clicked', async () => {
    const repo = createRepo('git-worktree-manager-prefix-', [
      { name: 'feature/foo', folder: 'slash-foo' },
      { name: 'feature-foo', folder: 'feature-foo' },
    ]);
    roots.push(repo.root);
    const session = `gm_${repoHash(repo.repo)}_feature-foo_1`;
    startUntaggedSession(session, repo.repo);
    fixture = await renderWorkspace(repo.repo);
    const dialog = oldSessionDialog(fixture);
    if (!(dialog instanceof HTMLElement)) {
      throw new Error('Old session question is not shown');
    }

    const panel = dialog.querySelector('.dialog-panel');
    if (!(panel instanceof HTMLElement)) {
      throw new Error('Old session question has no panel');
    }
    panel.click();
    fixture.detectChanges();
    expect(oldSessionDialog(fixture)).not.toBeNull();

    dialog.click();
    fixture.detectChanges();

    expect(oldSessionDialog(fixture)).toBeNull();
    expect(recordedBranch(session)).toBe('');
    expect(hasSession(session)).toBe(true);
    expect(branchRow(fixture, 'feature/foo')).toBeInstanceOf(HTMLElement);
  });

  it('does not ask again during the same open after a session is left unchanged', async () => {
    const repo = createRepo('git-worktree-manager-prefix-', [
      { name: 'feature/foo', folder: 'slash-foo' },
      { name: 'feature-foo', folder: 'feature-foo' },
    ]);
    roots.push(repo.root);
    process.env.GIT_WORKTREE_MANAGER_REGISTRY_PATH = join(repo.root, 'registry.db');
    addRepository(repo.repo, 'Billing');
    const session = `gm_${repoHash(repo.repo)}_feature-foo_1`;
    startUntaggedSession(session, repo.repo);
    fixture = await renderWorkspace(repo.repo);
    const dialog = oldSessionDialog(fixture);
    if (!(dialog instanceof HTMLElement)) {
      throw new Error('Old session question is not shown');
    }
    const leave = oldSessionRow(dialog, session).querySelector('[data-testid="old-session-leave"]');
    if (!(leave instanceof HTMLButtonElement)) {
      throw new Error('Leave unchanged is not shown');
    }
    leave.click();
    fixture.detectChanges();
    execFileSync('git', ['branch', 'topic'], { cwd: repo.repo, stdio: 'ignore' });

    fixture.componentInstance.createBranchName.set('topic');
    await fixture.componentInstance.createBranch();
    fixture.detectChanges();

    expect(oldSessionDialog(fixture)).toBeNull();
    expect(recordedBranch(session)).toBe('');
    expect(hasSession(session)).toBe(true);
    expect(branchRow(fixture, 'topic')).toBeInstanceOf(HTMLElement);
  });

  it('keeps New, Split, and Kill on one branch off the other branch', async () => {
    const repo = createRepo('git-worktree-manager-prefix-', [
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
    const harbor = createRepo('git-worktree-manager-prefix-harbor-', [
      { name: 'feature/foo', folder: 'slash-foo' },
    ]);
    const atlas = createRepo('git-worktree-manager-prefix-atlas-', [
      { name: 'feature', folder: 'feature' },
    ]);
    roots.push(harbor.root, atlas.root);
    writeSettings(harbor.root, { terminalMode: 'tmux' });
    process.env.GIT_WORKTREE_MANAGER_REGISTRY_PATH = join(harbor.root, 'registry.db');
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
