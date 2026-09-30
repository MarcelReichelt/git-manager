/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import {
  addRegisteredRepository,
  closeRegisteredRepositoryRegistry,
  listRegisteredRepositories,
  rememberRegisteredRepository,
  unregisterRegisteredRepository,
} from '../src/core/registered-repositories.js';
import { listRepositories, upsertRepository } from '../src/core/registry.js';
import type { ListedBranch } from '../src/desktop/repository-branches.js';
import {
  REGISTERED_REPOSITORY_REGISTRY_HOST,
  type RegisteredRepositoryRegistry,
} from '../src/desktop/registered-repository-registry.js';
import { REPOSITORY_BRANCHES } from '../src/desktop/sample-branches.js';
import { Workspace } from '../src/desktop/workspace.js';
import { createTempDir, initRepo, setupTestEnv } from './helpers.js';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

const sampleDisplayNames = ['Harbor', 'Northwind', 'Papertrail'];

const notesTodayDiff = [
  '--- a/notes/today.md',
  '+++ b/notes/today.md',
  '@@ -1,2 +1,5 @@',
  ' # Today',
  '-Tide chart',
  '+Harbor tide chart',
  '+Mooring notes',
  '+Weather',
  '+Crew',
].join('\n');

const notesTodoDiff = [
  '--- a/notes/todo.md',
  '+++ b/notes/todo.md',
  '@@ -1 +1,3 @@',
  ' # Todo',
  '+Paint the hull',
  '+Check the lines',
].join('\n');

const draftNotesTodayDiff = [
  '--- a/notes/today.md',
  '+++ b/notes/today.md',
  '@@ -1,2 +1,4 @@',
  ' # Today',
  '-Tide chart',
  '+Harbor tide chart',
  '+Mooring notes',
  '+Weather',
].join('\n');

const guideRenameDiff = [
  'diff --git a/docs/old-guide.md b/docs/guide.md',
  'rename from docs/old-guide.md',
  'rename to docs/guide.md',
  '--- a/docs/old-guide.md',
  '+++ b/docs/guide.md',
  '@@ -1,3 +1,4 @@',
  ' # Guide',
  ' Keep the berth notes.',
  '-Old heading',
  '+New heading',
  '+One more line',
].join('\n');

const draftNotesTodoDiff = [
  '--- a/notes/todo.md',
  '+++ b/notes/todo.md',
  '@@ -1 +1,2 @@',
  ' # Todo',
  '+Paint the hull',
].join('\n');

describe('desktop workspace', () => {
  let cleanup: () => void;
  let configDir: string;

  beforeEach(() => {
    const env = setupTestEnv(createTempDir());
    cleanup = env.cleanup;
    configDir = env.configDir;
    upsertRepository({
      name: 'Registry Only',
      path: '/tmp/registry-only',
      gitRoot: '/tmp/registry-only',
      primaryBranch: 'main',
      layoutMode: 'workspaces',
    });
    installRegisteredRepositoryRegistry();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows a centered card of registered repositories on first start', async () => {
    const screen = await openWorkspace();

    expect(screen.repositoryNames()).toEqual([]);
    expect(screen.text()).not.toContain('Registry Only');
    expect(listRepositories().map((repository) => repository.name)).toEqual(['Registry Only']);
    expect(screen.cardIsCenteredInTheWindow()).toBe(true);
  });

  it('shows the chosen repository workspace', async () => {
    rememberSampleRepositories();
    const screen = await openWorkspace();

    await screen.choose('Harbor');

    expect(screen.workspaceTitle()).toBe('Harbor');
    expect(screen.repositoryCardIsOpen()).toBe(false);
  });

  it('opens a card overlay of the same registered repositories when switching', async () => {
    rememberSampleRepositories();
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    await screen.switchRepository();

    expect(screen.workspaceTitle()).toBe('Harbor');
    expect(screen.repositoryNames()).toEqual(sampleDisplayNames);
    expect(screen.text()).not.toContain('Registry Only');
    expect(screen.cardIsCenteredInTheWindow()).toBe(true);

    await screen.choose('Northwind');

    expect(screen.workspaceTitle()).toBe('Northwind');
    expect(screen.repositoryCardIsOpen()).toBe(false);
  });

  it('places the content sheet flush with the top, right, and bottom of the window', async () => {
    rememberSampleRepositories();
    const screen = await openWorkspace();

    expect(screen.contentSheetIsFlushWithTheWindow()).toBe(true);

    await screen.choose('Harbor');

    expect(screen.contentSheetIsFlushWithTheWindow()).toBe(true);
  });

  it('lists every sample branch for the selected repository, including one with no worktree', async () => {
    rememberSampleRepositories();
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    const harbor = TestBed.inject(REPOSITORY_BRANCHES).find((entry) => entry.repositoryPath === '/samples/harbor');
    const sketch = harbor?.branches.find((branch) => branch.name === 'sketch');
    const detached = harbor?.branches.find((branch) => branch.detached);

    expect(sketch?.detached).toBe(false);
    if (!sketch || sketch.detached) {
      throw new Error('Harbor sample is missing the sketch branch');
    }
    expect(sketch.hasWorktree).toBe(false);
    if (!detached?.detached) {
      throw new Error('Harbor sample is missing a detached HEAD');
    }
    expect(detached.subject).toBe('Detached experiment');
    expect(screen.branchNames()).toEqual([
      'notes',
      'main',
      'release',
      'abandoned',
      'sketch',
      'rename-docs',
      'assets',
      'review',
    ]);
    expect(screen.text()).not.toContain('Detached experiment');
    expect(screen.branchNames()).not.toContain('HEAD');

    await screen.switchRepository();
    await screen.choose('Northwind');

    expect(screen.branchNames()).toEqual(['ledger']);
  });

  it('shows a status color and no text badge for each branch tracking state', async () => {
    rememberSampleRepositories();
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    expect(listedHarborBranch('notes').tracking).toBe('local-only');
    expect(screen.statusColor('notes')).toBe('rgb(125, 211, 252)');
    expect(listedHarborBranch('main').tracking).toBe('local-and-remote');
    expect(screen.statusColor('main')).toBe('rgb(34, 197, 94)');
    expect(listedHarborBranch('release').tracking).toBe('remote-only');
    expect(screen.statusColor('release')).toBe('rgb(250, 204, 21)');
    expect(listedHarborBranch('abandoned').tracking).toBe('remote-deleted');
    expect(screen.statusColor('abandoned')).toBe('rgb(239, 68, 68)');

    for (const name of ['notes', 'main', 'release', 'abandoned']) {
      expect(screen.statusText(name)).toBe('');
      expect(screen.branchRowText(name)).not.toMatch(/local only|remote only|remote deleted|tracking/i);
    }
  });

  it('shows a changed-file count and commits ahead and behind on each branch', async () => {
    rememberSampleRepositories();
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    for (const name of screen.branchNames()) {
      expect(screen.branchRowText(name)).toMatch(/\d+ changed/);
      expect(screen.branchRowText(name)).toMatch(/\d+ ahead/);
      expect(screen.branchRowText(name)).toMatch(/\d+ behind/);
    }

    const rename = listedHarborBranch('rename-docs');
    expect(rename.changes).toEqual([
      {
        kind: 'rename',
        path: 'docs/guide.md',
        previousPath: 'docs/old-guide.md',
        linesAdded: 2,
        linesDeleted: 1,
        diff: guideRenameDiff,
      },
    ]);
    expect(rename.commitsAhead).toHaveLength(3);
    expect(rename.commitsBehind).toHaveLength(2);
    expect(screen.changedFileCount('rename-docs')).toBe(1);
    expect(screen.commitsAhead('rename-docs')).toBe(3);
    expect(screen.commitsBehind('rename-docs')).toBe(2);

    const assets = listedHarborBranch('assets');
    expect(assets.changes).toEqual([{ kind: 'binary', path: 'assets/logo.png' }]);
    expect(assets.commitsBehind).toHaveLength(5);
    expect(screen.changedFileCount('assets')).toBe(1);
    expect(screen.commitsAhead('assets')).toBe(0);
    expect(screen.commitsBehind('assets')).toBe(5);

    expect(listedHarborBranch('notes').changes).toHaveLength(2);
    expect(listedHarborBranch('notes').commitsAhead).toHaveLength(1);
    expect(screen.changedFileCount('notes')).toBe(2);
    expect(screen.commitsAhead('notes')).toBe(1);
    expect(screen.commitsBehind('notes')).toBe(0);

    expect(screen.changedFileCount('main')).toBe(0);
    expect(screen.commitsAhead('main')).toBe(0);
    expect(screen.commitsBehind('main')).toBe(0);
  });

  it('shows lines added and lines deleted for each changed file when a branch is selected', async () => {
    rememberSampleRepositories();
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    await screen.selectBranch('notes');

    expect(screen.changedFiles()).toEqual([
      { path: 'notes/today.md', linesAdded: 4, linesDeleted: 1 },
      { path: 'notes/todo.md', linesAdded: 2, linesDeleted: 0 },
    ]);
  });

  it('shows the commits that exist only on the selected branch', async () => {
    rememberSampleRepositories();
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    await screen.selectBranch('abandoned');

    expect(screen.commitsOnlyOnTheBranch()).toEqual([
      'Start the experiment',
      'Adjust the experiment',
      'Keep the experiment',
      'Leave the experiment',
    ]);
    expect(screen.branchContentText()).not.toContain('Upstream moved on');

    await screen.selectBranch('assets');

    expect(screen.commitsOnlyOnTheBranch()).toEqual([]);
    expect(screen.branchContentText()).not.toContain('Add the first asset');
  });

  it('opens the diff for a selected changed file', async () => {
    rememberSampleRepositories();
    const screen = await openWorkspace();
    await screen.choose('Harbor');
    await screen.selectBranch('notes');

    await screen.selectChangedFile('notes/today.md');

    expect(screen.fileDiff()).toBe(notesTodayDiff);

    await screen.selectChangedFile('notes/todo.md');

    expect(screen.fileDiff()).toBe(notesTodoDiff);
  });

  it('opens a changed file diff and a commit file list with the diff beside it', async () => {
    rememberSampleRepositories();
    const screen = await openWorkspace();
    await screen.choose('Harbor');
    await screen.selectBranch('notes');

    await screen.selectChangedFile('notes/today.md');
    expect(screen.fileDiff()).toBe(notesTodayDiff);

    await screen.selectCommit('Draft notes');
    expect(screen.commitFiles()).toEqual([
      { path: 'notes/today.md', linesAdded: 3, linesDeleted: 1 },
      { path: 'notes/todo.md', linesAdded: 1, linesDeleted: 0 },
    ]);

    await screen.selectCommitFile('notes/today.md');
    expect(screen.commitFileDiff()).toBe(draftNotesTodayDiff);
    expect(screen.commitDiffIsBesideTheFileList()).toBe(true);

    await screen.selectCommitFile('notes/todo.md');
    expect(screen.commitFileDiff()).toBe(draftNotesTodoDiff);
    expect(screen.commitDiffIsBesideTheFileList()).toBe(true);
  });

  it('shows a rename as the lines added and deleted after rename detection', async () => {
    rememberSampleRepositories();
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    await screen.selectBranch('rename-docs');

    expect(screen.changedFiles()).toEqual([{ path: 'docs/guide.md', linesAdded: 2, linesDeleted: 1 }]);

    await screen.selectChangedFile('docs/guide.md');

    expect(screen.fileDiff()).toBe(guideRenameDiff);

    await screen.selectCommit('Rename the guide');

    expect(screen.commitFiles()).toEqual([{ path: 'docs/guide.md', linesAdded: 0, linesDeleted: 0 }]);
  });

  it('lists a binary file without added or deleted line counts', async () => {
    rememberSampleRepositories();
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    await screen.selectBranch('assets');

    expect(screen.changedFiles()).toEqual([{ path: 'assets/logo.png' }]);
    expect(screen.changedFileText('assets/logo.png')).toBe('assets/logo.png');

    await screen.selectChangedFile('assets/logo.png');

    expect(screen.fileDiffIsOpen()).toBe(false);

    await screen.selectBranch('review');
    await screen.selectCommit('Open the review');

    expect(screen.commitFiles()).toEqual([
      { path: 'src/review.ts', linesAdded: 7, linesDeleted: 1 },
      { path: 'assets/badge.bin' },
    ]);
  });

  it('shows a terminal count only while terminals for that branch are running', async () => {
    rememberSampleRepositories();
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    expect(listedHarborBranch('review').runningTerminals).toBe(2);
    expect(screen.terminalCount('review')).toBe(2);

    for (const name of screen.branchNames()) {
      if (name === 'review') {
        continue;
      }
      expect(listedHarborBranch(name).runningTerminals).toBe(0);
      expect(screen.branchRowText(name)).not.toMatch(/terminal/i);
    }
  });

  it('puts Create at the bottom of the branch list, and Merge and Remove on the branch hover menu', async () => {
    rememberSampleRepositories();
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    expect(screen.createFollowsTheBranchList()).toBe(true);
    expect(screen.sidebarText()).not.toMatch(/squash/i);
    expect(screen.branchMenuActions('notes')).toEqual([]);

    await screen.hoverBranch('notes');

    expect(screen.branchMenuActions('notes')).toEqual(['Merge', 'Remove']);
    expect(screen.sidebarText()).not.toMatch(/squash/i);

    await screen.leaveBranch('notes');

    expect(screen.branchMenuActions('notes')).toEqual([]);

    await screen.hoverBranch('review');
    await screen.clickBranchAction('review', 'Merge');
    await screen.clickBranchAction('review', 'Remove');
    await screen.clickCreate();

    expect(screen.workspaceTitle()).toBe('Harbor');
    expect(screen.branchNames()).toContain('review');
    expect(screen.repositoryCardIsOpen()).toBe(false);
    expect(screen.branchContentIsOpen()).toBe(false);
  });

  it('shows the selected repository display name in the sidebar', async () => {
    rememberSampleRepositories();
    const screen = await openWorkspace();

    expect(screen.branchSidebarIsOpen()).toBe(false);

    await screen.choose('Harbor');

    expect(screen.sidebarRepositoryName()).toBe('Harbor');

    await screen.switchRepository();
    await screen.choose('Northwind');

    expect(screen.sidebarRepositoryName()).toBe('Northwind');
  });

  it('adds an existing repository on the card and the switching overlay, then unregisters it', async () => {
    const repoPath = join(configDir, '..', 'harbor-checkout');
    const plainPath = join(configDir, '..', 'plain-notes');
    const registryPath = join(configDir, 'registered-only.db');
    initRepo(repoPath);
    mkdirSync(plainPath);
    closeRegisteredRepositoryRegistry();
    process.env.GIT_MANAGER_REGISTRY_PATH = registryPath;

    const screen = await openWorkspace();
    expect(screen.repositoryNames()).toEqual([]);
    expect(screen.cardIsCenteredInTheWindow()).toBe(true);

    await screen.addRepository(plainPath, 'Plain Notes');
    expect(screen.repositoryNames()).toEqual([]);
    expect(screen.addError()).toContain('Not a git repository');

    await screen.addRepository(repoPath, 'Harbor Checkout');
    expect(screen.repositoryNames()).toEqual(['Harbor Checkout']);
    expect(screen.text()).toContain(repoPath);
    expect(registeredRepositoryRows(registryPath)).toEqual([{ path: repoPath, display_name: 'Harbor Checkout' }]);

    await screen.choose('Harbor Checkout');
    expect(screen.workspaceTitle()).toBe('Harbor Checkout');
    expect(screen.repositoryCardIsOpen()).toBe(false);

    await screen.switchRepository();
    expect(screen.repositoryNames()).toEqual(['Harbor Checkout']);
    expect(screen.text()).toContain(repoPath);
    expect(screen.cardIsCenteredInTheWindow()).toBe(true);

    await screen.unregister('Harbor Checkout');
    expect(screen.repositoryNames()).toEqual([]);
    expect(registryColumnNames(registryPath)).toEqual(['path', 'display_name']);
  });
});

function registeredRepositoryRows(path: string): readonly { path: string; display_name: string }[] {
  return readRegistry(path).rows;
}

function registryColumnNames(path: string): string[] {
  return readRegistry(path).columns;
}

function readRegistry(path: string): {
  columns: string[];
  rows: readonly { path: string; display_name: string }[];
} {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const tables: unknown[] = db
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all();
    const schema = tables.map((table) => {
      if (!isSchemaTable(table)) {
        throw new Error('Registry schema is invalid');
      }
      return table;
    });
    expect(schema).toHaveLength(1);
    const sql = schema[0]?.sql ?? '';
    expect(sql.toLowerCase()).not.toMatch(/worktree|layout|terminal/);
    const tableName = schema[0]?.name ?? '';
    if (!/^[A-Za-z_]+$/.test(tableName)) {
      throw new Error('Registry table name is invalid');
    }
    const columns: unknown[] = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const rows: unknown[] = db.prepare(`SELECT * FROM ${tableName}`).all();
    return {
      columns: columns.map((column) => {
        if (!isSchemaColumn(column)) {
          throw new Error('Registry column is invalid');
        }
        return column.name;
      }),
      rows: rows.map((row) => {
        if (!isStoredRepository(row)) {
          throw new Error('Registry row is invalid');
        }
        return row;
      }),
    };
  } finally {
    db.close();
  }
}

function isSchemaTable(value: unknown): value is { name: string; sql: string | null } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'sql' in value &&
    typeof value.name === 'string' &&
    (typeof value.sql === 'string' || value.sql === null)
  );
}

function isSchemaColumn(value: unknown): value is { name: string } {
  return typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string';
}

function isStoredRepository(value: unknown): value is { path: string; display_name: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('path') || !keys.includes('display_name')) {
    return false;
  }
  return (
    'path' in value &&
    'display_name' in value &&
    typeof value.path === 'string' &&
    typeof value.display_name === 'string'
  );
}

function rememberSampleRepositories(): void {
  rememberRegisteredRepository('/samples/harbor', 'Harbor');
  rememberRegisteredRepository('/samples/northwind', 'Northwind');
  rememberRegisteredRepository('/samples/papertrail', 'Papertrail');
}

function installRegisteredRepositoryRegistry(): void {
  const registry: RegisteredRepositoryRegistry = {
    list: () => listRegisteredRepositories(),
    add: (path, displayName) => {
      addRegisteredRepository(path, displayName);
    },
    unregister: (path) => {
      unregisterRegisteredRepository(path);
    },
  };
  Object.assign(globalThis, { [REGISTERED_REPOSITORY_REGISTRY_HOST]: registry });
}

function listedHarborBranch(name: string): ListedBranch {
  const harbor = TestBed.inject(REPOSITORY_BRANCHES).find((entry) => entry.repositoryPath === '/samples/harbor');
  const branch = harbor?.branches.find((candidate) => candidate.name === name);
  if (!branch || branch.detached) {
    throw new Error(`Harbor sample is missing ${name}`);
  }
  return branch;
}

async function openWorkspace(): Promise<WorkspaceScreen> {
  const fixture = TestBed.createComponent(Workspace);
  fixture.detectChanges();
  await fixture.whenStable();
  return new WorkspaceScreen(fixture);
}

class WorkspaceScreen {
  constructor(private readonly fixture: ComponentFixture<Workspace>) {}

  text(): string {
    return this.root().textContent ?? '';
  }

  repositoryNames(): string[] {
    return [...this.card().querySelectorAll('[data-registered-repository]')].map(
      (repository) => repository.getAttribute('data-registered-repository') ?? '',
    );
  }

  async addRepository(path: string, displayName: string): Promise<void> {
    this.labeledInput('Repository path').value = path;
    this.labeledInput('Repository path').dispatchEvent(new Event('input', { bubbles: true }));
    this.labeledInput('Display name').value = displayName;
    this.labeledInput('Display name').dispatchEvent(new Event('input', { bubbles: true }));
    this.fixture.detectChanges();
    this.button('Add').click();
    this.fixture.detectChanges();
    await this.fixture.whenStable();
  }

  addError(): string {
    return this.card().querySelector('[role="alert"]')?.textContent?.trim() ?? '';
  }

  async unregister(displayName: string): Promise<void> {
    const button = [...this.registeredRepository(displayName).querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === 'Unregister',
    );
    if (!button) {
      throw new Error(`No unregister button for ${displayName}`);
    }
    button.click();
    this.fixture.detectChanges();
    await this.fixture.whenStable();
  }

  async choose(displayName: string): Promise<void> {
    const button = [...this.card().querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === displayName,
    );
    if (!button) {
      throw new Error(`No registered repository named ${displayName}`);
    }
    button.click();
    this.fixture.detectChanges();
    await this.fixture.whenStable();
  }

  async switchRepository(): Promise<void> {
    const button = [...this.root().querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === 'Switch repository',
    );
    if (!button) {
      throw new Error('Switch repository is not on screen');
    }
    button.click();
    this.fixture.detectChanges();
    await this.fixture.whenStable();
  }

  workspaceTitle(): string {
    const heading = this.root().querySelector('[aria-label="Workspace"] h1');
    return heading?.textContent?.trim() ?? '';
  }

  contentSheetIsFlushWithTheWindow(): boolean {
    const sheet = this.root().querySelector('[aria-label="Workspace"]');
    if (!(sheet instanceof HTMLElement)) {
      return false;
    }
    const style = getComputedStyle(sheet);
    return (
      style.position === 'fixed' &&
      style.top === '0px' &&
      style.right === '0px' &&
      style.bottom === '0px' &&
      style.marginTop === '0px' &&
      style.marginRight === '0px' &&
      style.marginBottom === '0px'
    );
  }

  repositoryCardIsOpen(): boolean {
    return this.root().querySelector('[aria-label="Registered repositories"]') instanceof HTMLElement;
  }

  branchSidebarIsOpen(): boolean {
    return this.root().querySelector('[aria-label="Branches"]') instanceof HTMLElement;
  }

  sidebarRepositoryName(): string {
    const heading = this.sidebar().querySelector('h2');
    return heading?.textContent?.trim() ?? '';
  }

  branchNames(): string[] {
    return [...this.sidebar().querySelectorAll('.branch-name')].map((name) => name.textContent?.trim() ?? '');
  }

  statusColor(name: string): string {
    const status = this.branchRow(name).querySelector('.status');
    if (!(status instanceof HTMLElement)) {
      throw new Error(`No status color for ${name}`);
    }
    return getComputedStyle(status).backgroundColor;
  }

  statusText(name: string): string {
    return this.branchRow(name).querySelector('.status')?.textContent?.trim() ?? '';
  }

  branchRowText(name: string): string {
    return this.branchRow(name).textContent?.trim() ?? '';
  }

  changedFileCount(name: string): number {
    return this.countInRow(name, 'changed-file-count');
  }

  commitsAhead(name: string): number {
    return this.countInRow(name, 'commits-ahead');
  }

  commitsBehind(name: string): number {
    return this.countInRow(name, 'commits-behind');
  }

  terminalCount(name: string): number {
    return this.countInRow(name, 'running-terminals');
  }

  sidebarText(): string {
    return this.sidebar().textContent ?? '';
  }

  createFollowsTheBranchList(): boolean {
    const list = this.sidebar().querySelector('.branch-list');
    const create = this.createButton();
    if (!list) {
      return false;
    }
    const follows = (list.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    return follows && create.closest('.branch-row') === null;
  }

  branchMenuActions(name: string): string[] {
    return [...this.branchRow(name).querySelectorAll('[role="menuitem"]')].map(
      (action) => action.textContent?.trim() ?? '',
    );
  }

  async hoverBranch(name: string): Promise<void> {
    this.branchRow(name).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    this.fixture.detectChanges();
    await this.fixture.whenStable();
  }

  async leaveBranch(name: string): Promise<void> {
    this.branchRow(name).dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    this.fixture.detectChanges();
    await this.fixture.whenStable();
  }

  async clickBranchAction(name: string, label: string): Promise<void> {
    const action = [...this.branchRow(name).querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === label,
    );
    if (!action) {
      throw new Error(`No ${label} action on ${name}`);
    }
    action.click();
    this.fixture.detectChanges();
    await this.fixture.whenStable();
  }

  async clickCreate(): Promise<void> {
    this.createButton().click();
    this.fixture.detectChanges();
    await this.fixture.whenStable();
  }

  async selectBranch(name: string): Promise<void> {
    this.branchRow(name).click();
    this.fixture.detectChanges();
    await this.fixture.whenStable();
  }

  commitsOnlyOnTheBranch(): string[] {
    const list = this.branchContent().querySelector('[aria-label="Commits only on this branch"]');
    if (!(list instanceof HTMLElement)) {
      throw new Error('Commits only on this branch are not on screen');
    }
    return [...list.querySelectorAll('.branch-commit')].map((commit) => commit.textContent?.trim() ?? '');
  }

  branchContentText(): string {
    return this.branchContent().textContent ?? '';
  }

  branchContentIsOpen(): boolean {
    return this.root().querySelector('[aria-label="Workspace"] [aria-label="Branch"]') instanceof HTMLElement;
  }

  async selectChangedFile(path: string): Promise<void> {
    const button = this.changedFileRow(path).querySelector('button');
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`No changed file ${path}`);
    }
    button.click();
    this.fixture.detectChanges();
    await this.fixture.whenStable();
  }

  fileDiff(): string {
    const diff = this.fileDiffElement();
    if (!diff) {
      throw new Error('Diff is not on screen');
    }
    return diff.textContent ?? '';
  }

  fileDiffIsOpen(): boolean {
    return this.fileDiffElement() !== null;
  }

  changedFileText(path: string): string {
    return this.changedFileRow(path).textContent?.trim() ?? '';
  }

  async selectCommit(subject: string): Promise<void> {
    const commit = [...this.branchContent().querySelectorAll('.branch-commit')].find(
      (candidate) => candidate.textContent?.trim() === subject,
    );
    const button = commit?.querySelector('button');
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`No commit ${subject}`);
    }
    button.click();
    this.fixture.detectChanges();
    await this.fixture.whenStable();
  }

  commitFiles(): readonly { path: string; linesAdded?: number; linesDeleted?: number }[] {
    const list = this.branchContent().querySelector('[aria-label="Commit files"]');
    if (!(list instanceof HTMLElement)) {
      throw new Error('Commit files are not on screen');
    }
    return [...list.querySelectorAll('.commit-file')].map((row) => fileLineCounts(row, '.commit-file-path'));
  }

  async selectCommitFile(path: string): Promise<void> {
    const row = [...this.commitFileList().querySelectorAll('.commit-file')].find(
      (candidate) => candidate.querySelector('.commit-file-path')?.textContent?.trim() === path,
    );
    const button = row?.querySelector('button');
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`No commit file ${path}`);
    }
    button.click();
    this.fixture.detectChanges();
    await this.fixture.whenStable();
  }

  commitFileDiff(): string {
    const diff = this.branchContent().querySelector('[aria-label="Commit diff"]');
    if (!(diff instanceof HTMLElement)) {
      throw new Error('Commit diff is not on screen');
    }
    return diff.textContent ?? '';
  }

  commitDiffIsBesideTheFileList(): boolean {
    const list = this.commitFileList();
    const diff = this.branchContent().querySelector('[aria-label="Commit diff"]');
    const view = list.parentElement;
    if (!(diff instanceof HTMLElement) || !(view instanceof HTMLElement) || diff.parentElement !== view) {
      return false;
    }
    const viewStyle = getComputedStyle(view);
    const columns = viewStyle.gridTemplateColumns.split(' ').filter((column) => column.length > 0);
    return (
      viewStyle.display === 'grid' &&
      columns.length === 2 &&
      getComputedStyle(list).gridColumnStart === '1' &&
      getComputedStyle(diff).gridColumnStart === '2'
    );
  }

  changedFiles(): readonly { path: string; linesAdded?: number; linesDeleted?: number }[] {
    return [...this.branchContent().querySelectorAll('.changed-file')].map((row) =>
      fileLineCounts(row, '.changed-file-path'),
    );
  }

  cardIsCenteredInTheWindow(): boolean {
    const layer = this.card().parentElement;
    if (!layer) {
      return false;
    }
    const style = getComputedStyle(layer);
    return (
      style.position === 'fixed' &&
      style.top === '0px' &&
      style.right === '0px' &&
      style.bottom === '0px' &&
      style.left === '0px' &&
      style.display === 'flex' &&
      style.alignItems === 'center' &&
      style.justifyContent === 'center'
    );
  }

  private labeledInput(label: string): HTMLInputElement {
    const input = [...this.card().querySelectorAll('label')]
      .find((candidate) => candidate.textContent?.includes(label))
      ?.querySelector('input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`No ${label} field on the registered repositories card`);
    }
    return input;
  }

  private button(label: string): HTMLButtonElement {
    const button = [...this.card().querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`${label} is not on the registered repositories card`);
    }
    return button;
  }

  private registeredRepository(displayName: string): HTMLElement {
    const repository = this.card().querySelector(`[data-registered-repository="${displayName}"]`);
    if (!(repository instanceof HTMLElement)) {
      throw new Error(`No registered repository named ${displayName}`);
    }
    return repository;
  }

  private root(): HTMLElement {
    return this.fixture.nativeElement as HTMLElement;
  }

  private card(): HTMLElement {
    const card = this.root().querySelector('[aria-label="Registered repositories"]');
    if (!(card instanceof HTMLElement)) {
      throw new Error('Registered repositories card is not on screen');
    }
    return card;
  }

  private createButton(): HTMLButtonElement {
    const create = [...this.sidebar().querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Create',
    );
    if (!(create instanceof HTMLButtonElement)) {
      throw new Error('Create is not on the branch sidebar');
    }
    return create;
  }

  private countInRow(name: string, className: string): number {
    const element = this.branchRow(name).querySelector(`.${className}`);
    const match = element?.textContent?.trim().match(/^(\d+)/);
    if (!match) {
      throw new Error(`No ${className} count for ${name}`);
    }
    return Number(match[1]);
  }

  private branchRow(name: string): HTMLElement {
    const row = [...this.sidebar().querySelectorAll('.branch-row')].find(
      (candidate) => candidate.querySelector('.branch-name')?.textContent?.trim() === name,
    );
    if (!(row instanceof HTMLElement)) {
      throw new Error(`No branch row named ${name}`);
    }
    return row;
  }

  private sidebar(): HTMLElement {
    const sidebar = this.root().querySelector('[aria-label="Branches"]');
    if (!(sidebar instanceof HTMLElement)) {
      throw new Error('Branch sidebar is not on screen');
    }
    return sidebar;
  }

  private fileDiffElement(): HTMLElement | null {
    const diff = this.branchContent().querySelector('[aria-label="Diff"]');
    return diff instanceof HTMLElement ? diff : null;
  }

  private commitFileList(): HTMLElement {
    const list = this.branchContent().querySelector('[aria-label="Commit files"]');
    if (!(list instanceof HTMLElement)) {
      throw new Error('Commit files are not on screen');
    }
    return list;
  }

  private changedFileRow(path: string): HTMLElement {
    const row = [...this.branchContent().querySelectorAll('.changed-file')].find(
      (candidate) => candidate.querySelector('.changed-file-path')?.textContent?.trim() === path,
    );
    if (!(row instanceof HTMLElement)) {
      throw new Error(`No changed file ${path}`);
    }
    return row;
  }

  private branchContent(): HTMLElement {
    const content = this.root().querySelector('[aria-label="Workspace"] [aria-label="Branch"]');
    if (!(content instanceof HTMLElement)) {
      throw new Error('Branch content is not on screen');
    }
    return content;
  }
}

function lineCount(element: HTMLElement): number {
  const match = element.textContent?.trim().match(/(\d+)/);
  if (!match) {
    throw new Error(`No line count in ${element.textContent ?? ''}`);
  }
  return Number(match[1]);
}

function fileLineCounts(
  row: Element,
  pathClass: string,
): { path: string; linesAdded?: number; linesDeleted?: number } {
  const path = row.querySelector(pathClass)?.textContent?.trim() ?? '';
  const added = row.querySelector('.lines-added');
  const deleted = row.querySelector('.lines-deleted');
  if (!(added instanceof HTMLElement) || !(deleted instanceof HTMLElement)) {
    return { path };
  }
  return {
    path,
    linesAdded: lineCount(added),
    linesDeleted: lineCount(deleted),
  };
}
