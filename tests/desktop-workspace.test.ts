/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import Database from 'better-sqlite3';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
import { createRepositoryWorktree } from '../src/core/create-repository-worktree.js';
import { readRepositoryBranches } from '../src/core/read-repository-branches.js';
import {
  REPOSITORY_BRANCH_SOURCE_HOST,
  type RepositoryBranchSource,
} from '../src/desktop/repository-branch-source.js';
import {
  REPOSITORY_WORKTREE_CREATE_HOST,
  type RepositoryWorktreeCreate,
} from '../src/desktop/repository-worktree-create.js';
import {
  REGISTERED_REPOSITORY_REGISTRY_HOST,
  type RegisteredRepositoryRegistry,
} from '../src/desktop/registered-repository-registry.js';
import { Workspace } from '../src/desktop/workspace.js';
import { configureTestIdentity, createTempDir, initRepo, initRepoWithRemote, setupTestEnv } from './helpers.js';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

const sampleDisplayNames = ['Harbor', 'Northwind', 'Papertrail'];

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
    installRepositoryBranchSource();
    installRepositoryWorktreeCreate();
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

  it('shows no terminal count while no terminals are running', async () => {
    addRegisteredRepository(createHarborCheckout(join(configDir, '..')), 'Harbor');
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    for (const name of screen.branchNames()) {
      expect(screen.branchRowText(name)).not.toMatch(/terminal/i);
    }
  });

  it('puts Create at the bottom of the branch list, and Merge and Remove on the branch hover menu', async () => {
    addRegisteredRepository(createHarborCheckout(join(configDir, '..')), 'Harbor');
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

    await screen.hoverBranch('notes');
    await screen.clickBranchAction('notes', 'Merge');
    await screen.clickBranchAction('notes', 'Remove');
    await screen.clickCreate();

    expect(screen.workspaceTitle()).toBe('Harbor');
    expect(screen.branchNames()).toContain('notes');
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

  it('lists every local and remote branch of the selected repository', async () => {
    const baseDir = join(configDir, '..');
    const harbor = createHarborCheckout(baseDir);
    const northwind = join(baseDir, 'northwind');
    initRepo(northwind, { initialBranch: 'ledger' });
    addRegisteredRepository(harbor, 'Harbor');
    addRegisteredRepository(northwind, 'Northwind');

    const screen = await openWorkspace();
    await screen.choose('Harbor');

    expect(screen.branchNames()).toEqual([
      'abandoned',
      'assets',
      'diverged',
      'master',
      'notes',
      'release',
      'rename-docs',
      'sketch',
    ]);
    expect(screen.branchNames()).not.toContain('HEAD');
    expect(screen.text()).not.toContain('Detached experiment');

    await screen.switchRepository();
    await screen.choose('Northwind');

    expect(screen.branchNames()).toEqual(['ledger']);
  });

  it('shows git tracking colors and commit counts for ahead and behind', async () => {
    addRegisteredRepository(createHarborCheckout(join(configDir, '..')), 'Harbor');
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    expect(screen.statusColor('notes')).toBe('rgb(125, 211, 252)');
    expect(screen.statusColor('master')).toBe('rgb(34, 197, 94)');
    expect(screen.statusColor('diverged')).toBe('rgb(34, 197, 94)');
    expect(screen.statusColor('release')).toBe('rgb(250, 204, 21)');
    expect(screen.statusColor('abandoned')).toBe('rgb(239, 68, 68)');

    for (const name of screen.branchNames()) {
      expect(screen.branchRowText(name)).toMatch(/\d+ changed/);
      expect(screen.branchRowText(name)).toMatch(/\d+ ahead/);
      expect(screen.branchRowText(name)).toMatch(/\d+ behind/);
    }

    for (const name of ['notes', 'master', 'release', 'abandoned']) {
      expect(screen.statusText(name)).toBe('');
      expect(screen.branchRowText(name)).not.toMatch(/local only|remote only|remote deleted|tracking/i);
    }

    expect(screen.commitsAhead('notes')).toBe(1);
    expect(screen.commitsBehind('notes')).toBe(0);
    expect(screen.commitsAhead('master')).toBe(0);
    expect(screen.commitsBehind('master')).toBe(0);
    expect(screen.changedFileCount('master')).toBe(0);
    expect(screen.commitsAhead('diverged')).toBe(2);
    expect(screen.commitsBehind('diverged')).toBe(1);
    expect(screen.changedFileCount('diverged')).toBe(1);
    expect(screen.commitsAhead('release')).toBe(2);
    expect(screen.commitsBehind('release')).toBe(0);
    expect(screen.commitsAhead('abandoned')).toBe(2);
    expect(screen.commitsBehind('abandoned')).toBe(1);
    expect(screen.commitsAhead('sketch')).toBe(2);
    expect(screen.commitsBehind('sketch')).toBe(0);
    expect(screen.changedFileCount('sketch')).toBe(0);
  });

  it('counts a rename as one changed file and a binary file as one changed file', async () => {
    addRegisteredRepository(createHarborCheckout(join(configDir, '..')), 'Harbor');
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    expect(screen.changedFileCount('rename-docs')).toBe(1);
    expect(screen.commitsAhead('rename-docs')).toBe(1);
    expect(screen.commitsBehind('rename-docs')).toBe(0);
    expect(screen.changedFileCount('assets')).toBe(1);
    expect(screen.commitsAhead('assets')).toBe(0);
    expect(screen.commitsBehind('assets')).toBe(0);

    await screen.selectBranch('rename-docs');

    expect(screen.changedFiles()).toEqual([{ path: 'docs/guide.md', linesAdded: 2, linesDeleted: 1 }]);

    await screen.selectChangedFile('docs/guide.md');

    expect(screen.fileDiff()).toContain('rename from docs/old-guide.md');
    expect(screen.fileDiff()).toContain('rename to docs/guide.md');
    expect(screen.fileDiff()).toContain('-Old heading');
    expect(screen.fileDiff()).toContain('+New heading');
    expect(screen.fileDiff()).toContain('+One more line');

    await screen.selectBranch('assets');

    expect(screen.changedFiles()).toEqual([{ path: 'assets/logo.png' }]);
    expect(screen.changedFileText('assets/logo.png')).toBe('assets/logo.png');

    await screen.selectChangedFile('assets/logo.png');

    expect(screen.fileDiffIsOpen()).toBe(false);
  });

  it('opens a changed file diff and the selected commit file list from the repository', async () => {
    addRegisteredRepository(createRewriteCheckout(join(configDir, '..')), 'Harbor');
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    await screen.selectBranch('rewrite');

    expect(screen.changedFiles()).toEqual([{ path: 'docs/guide.md', linesAdded: 1, linesDeleted: 0 }]);

    await screen.selectChangedFile('docs/guide.md');

    expect(screen.fileDiff()).toContain('+Dirty line');

    expect(screen.commitsOnlyOnTheBranch()).toEqual(['Retitle the guide', 'Add the logo']);

    await screen.selectCommit('Retitle the guide');

    expect(screen.commitFiles()).toEqual([{ path: 'docs/guide.md', linesAdded: 2, linesDeleted: 1 }]);

    await screen.selectCommitFile('docs/guide.md');

    expect(screen.commitDiff()).toContain('rename from docs/old-guide.md');
    expect(screen.commitDiff()).toContain('rename to docs/guide.md');
    expect(screen.commitDiff()).toContain('-Old heading');
    expect(screen.commitDiff()).toContain('+New heading');
    expect(screen.commitDiff()).toContain('+One more line');
    expect(screen.commitDiffIsInTheColumnToTheRight()).toBe(true);

    await screen.selectCommit('Add the logo');

    expect(screen.commitFiles()).toEqual([{ path: 'assets/logo.png' }]);
    expect(screen.commitFileText('assets/logo.png')).toBe('assets/logo.png');

    await screen.selectCommitFile('assets/logo.png');

    expect(screen.commitDiffIsOpen()).toBe(false);
  });

  it('shows changed-file line counts and the commits only on the selected branch', async () => {
    addRegisteredRepository(createHarborCheckout(join(configDir, '..')), 'Harbor');
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    await screen.selectBranch('diverged');

    expect(screen.changedFiles()).toEqual([{ path: 'diverged.txt', linesAdded: 1, linesDeleted: 0 }]);

    await screen.selectChangedFile('diverged.txt');

    expect(screen.fileDiff()).toContain('+dirty');

    expect(screen.commitsOnlyOnTheBranch()).toEqual(['Local ahead one', 'Local ahead two']);
    expect(screen.branchContentText()).not.toContain('Remote behind one');

    await screen.selectBranch('abandoned');

    expect(screen.commitsOnlyOnTheBranch()).toEqual(['Start the experiment', 'Continue the experiment']);
    expect(screen.branchContentText()).not.toContain('Master moved');

    await screen.selectBranch('assets');

    expect(screen.commitsOnlyOnTheBranch()).toEqual([]);
  });

  it('shows a worktree added or removed outside the app without editing the registry', async () => {
    const baseDir = join(configDir, '..');
    const harbor = createHarborCheckout(baseDir);
    const registryPath = join(configDir, 'registered-only.db');
    closeRegisteredRepositoryRegistry();
    process.env.GIT_MANAGER_REGISTRY_PATH = registryPath;
    addRegisteredRepository(harbor, 'Harbor');
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    expect(screen.isCheckedOut('master')).toBe(true);
    expect(screen.isCheckedOut('release')).toBe(false);
    expect(screen.isCheckedOut('sketch')).toBe(false);

    const sketch = join(baseDir, 'worktrees', 'sketch');
    git(harbor, `worktree add "${sketch}" sketch`);
    await screen.reopen('Harbor');

    expect(screen.isCheckedOut('sketch')).toBe(true);
    expect(registeredRepositoryRows(registryPath)).toEqual([{ path: harbor, display_name: 'Harbor' }]);

    git(harbor, `worktree remove "${sketch}"`);
    await screen.reopen('Harbor');

    expect(screen.isCheckedOut('sketch')).toBe(false);
    expect(registeredRepositoryRows(registryPath)).toEqual([{ path: harbor, display_name: 'Harbor' }]);
  });

  it('creates a worktree from the button at the bottom of the branch list', async () => {
    const repoPath = join(configDir, '..', 'harbor');
    initRepo(repoPath, { initialBranch: 'main' });
    writeFileSync(join(repoPath, '.git-manager.toml'), 'layout = "workspaces"\n');
    git(repoPath, 'checkout -b notes');
    git(repoPath, 'checkout main');
    addRegisteredRepository(repoPath, 'Harbor');

    const screen = await openWorkspace();
    await screen.choose('Harbor');

    expect(screen.isCheckedOut('main')).toBe(true);
    expect(screen.isCheckedOut('notes')).toBe(false);
    expect(screen.createFollowsTheBranchList()).toBe(true);

    await screen.createBranch('notes');

    expect(screen.isCheckedOut('notes')).toBe(true);
    expect(screen.branchNames()).toEqual(['main', 'notes']);
  });

  it('shows a failure on the workspace when the worktree folder already exists', async () => {
    const repoPath = join(configDir, '..', 'harbor');
    initRepo(repoPath, { initialBranch: 'main' });
    writeFileSync(join(repoPath, '.git-manager.toml'), 'layout = "workspaces"\n');
    git(repoPath, 'checkout -b notes');
    git(repoPath, 'checkout main');
    mkdirSync(join(repoPath, '.workspaces', 'notes'), { recursive: true });
    addRegisteredRepository(repoPath, 'Harbor');

    const screen = await openWorkspace();
    await screen.choose('Harbor');
    await screen.createBranch('notes');

    expect(screen.text()).toContain('already exists');
    expect(screen.isCheckedOut('notes')).toBe(false);

    await screen.reopen('Harbor');

    expect(screen.isCheckedOut('notes')).toBe(false);
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

function createHarborCheckout(baseDir: string): string {
  const origin = join(baseDir, 'origin.git');
  const repoPath = join(baseDir, 'harbor');
  const worktrees = join(baseDir, 'worktrees');
  mkdirSync(worktrees);
  initRepoWithRemote(repoPath, origin, { initialBranch: 'master' });

  git(repoPath, 'checkout -b abandoned');
  commitFile(repoPath, 'abandoned.txt', 'start\n', 'Start the experiment');
  git(repoPath, 'push -u origin abandoned');
  git(repoPath, 'checkout master');
  commitFile(repoPath, 'master-only.txt', 'moved\n', 'Master moved');
  git(repoPath, 'push origin master');
  git(repoPath, 'checkout abandoned');
  commitFile(repoPath, 'abandoned.txt', 'start\nmore\n', 'Continue the experiment');
  git(repoPath, 'checkout master');
  git(repoPath, 'push origin --delete abandoned');
  git(repoPath, 'fetch --prune origin');

  git(repoPath, 'checkout -b release');
  commitFile(repoPath, 'release.txt', 'cut\n', 'Cut the release');
  commitFile(repoPath, 'release.txt', 'cut\nbump\n', 'Bump the version');
  git(repoPath, 'push -u origin release');
  git(repoPath, 'checkout master');
  git(repoPath, 'branch -D release');

  git(repoPath, 'checkout -b diverged');
  git(repoPath, 'push -u origin diverged');
  commitFile(repoPath, 'diverged.txt', 'one\n', 'Local ahead one');
  commitFile(repoPath, 'diverged.txt', 'one\ntwo\n', 'Local ahead two');
  commitOnOrigin(origin, baseDir, 'diverged', 'remote-on-diverged.txt', 'remote change\n', 'Remote behind one');
  git(repoPath, 'fetch origin');
  git(repoPath, 'checkout master');
  git(repoPath, `worktree add "${join(worktrees, 'diverged')}" diverged`);
  writeFileSync(join(worktrees, 'diverged', 'diverged.txt'), 'one\ntwo\ndirty\n');

  git(repoPath, 'checkout -b notes');
  commitFile(repoPath, 'notes.txt', 'notes\n', 'Draft notes');
  git(repoPath, 'checkout master');

  git(repoPath, 'checkout -b rename-docs');
  commitFile(repoPath, 'docs/old-guide.md', '# Guide\nKeep the berth notes.\nOld heading\n', 'Add the guide');
  git(repoPath, 'checkout master');
  const renameDocs = join(worktrees, 'rename-docs');
  git(repoPath, `worktree add "${renameDocs}" rename-docs`);
  git(renameDocs, 'mv docs/old-guide.md docs/guide.md');
  writeFileSync(join(renameDocs, 'docs', 'guide.md'), '# Guide\nKeep the berth notes.\nNew heading\nOne more line\n');

  const assets = join(worktrees, 'assets');
  git(repoPath, `worktree add -b assets "${assets}" master`);
  mkdirSync(join(assets, 'assets'));
  writeFileSync(join(assets, 'assets', 'logo.png'), Buffer.from([0x50, 0x4e, 0x47, 0x00, 0x01]));

  git(repoPath, 'checkout -b sketch');
  commitFile(repoPath, 'sketch.txt', 'sketch\n', 'Sketch the idea');
  commitFile(repoPath, 'sketch.txt', 'sketch\nmore\n', 'Sketch the follow-up');
  git(repoPath, 'checkout master');

  git(repoPath, 'checkout -b discard-me');
  commitFile(repoPath, 'detached.txt', 'detached\n', 'Detached experiment');
  const detachedCommit = gitOutput(repoPath, 'rev-parse HEAD');
  git(repoPath, 'checkout master');
  git(repoPath, 'branch -D discard-me');
  git(repoPath, `worktree add --detach "${join(worktrees, 'detached')}" ${detachedCommit}`);

  return repoPath;
}

function createRewriteCheckout(baseDir: string): string {
  const repoPath = join(baseDir, 'harbor');
  const worktrees = join(baseDir, 'worktrees');
  mkdirSync(worktrees);
  initRepo(repoPath, { initialBranch: 'master' });
  commitFile(repoPath, 'docs/old-guide.md', '# Guide\nKeep the berth notes.\nOld heading\n', 'Add the guide');
  git(repoPath, 'checkout -b rewrite');
  git(repoPath, 'mv docs/old-guide.md docs/guide.md');
  commitFile(
    repoPath,
    'docs/guide.md',
    '# Guide\nKeep the berth notes.\nNew heading\nOne more line\n',
    'Retitle the guide',
  );
  const logo = join(repoPath, 'assets', 'logo.png');
  mkdirSync(dirname(logo), { recursive: true });
  writeFileSync(logo, Buffer.from([0x50, 0x4e, 0x47, 0x00, 0x01]));
  git(repoPath, 'add -- assets/logo.png');
  git(repoPath, 'commit -m "Add the logo"');
  git(repoPath, 'checkout master');
  const rewrite = join(worktrees, 'rewrite');
  git(repoPath, `worktree add "${rewrite}" rewrite`);
  writeFileSync(
    join(rewrite, 'docs', 'guide.md'),
    '# Guide\nKeep the berth notes.\nNew heading\nOne more line\nDirty line\n',
  );
  return repoPath;
}

function commitOnOrigin(
  origin: string,
  baseDir: string,
  branch: string,
  file: string,
  contents: string,
  subject: string,
): void {
  const clone = join(baseDir, `origin-clone-${branch}`);
  execSync(`git clone "${origin}" "${clone}"`, { stdio: 'ignore' });
  configureTestIdentity(clone);
  git(clone, `checkout ${branch}`);
  commitFile(clone, file, contents, subject);
  git(clone, `push origin ${branch}`);
}

function commitFile(repoPath: string, file: string, contents: string, subject: string): void {
  const absolute = join(repoPath, file);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
  git(repoPath, `add -- "${file}"`);
  git(repoPath, `commit -m "${subject}"`);
}

function git(repoPath: string, args: string): void {
  execSync(`git ${args}`, { cwd: repoPath, stdio: 'ignore' });
}

function gitOutput(repoPath: string, args: string): string {
  return execSync(`git ${args}`, { cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function rememberSampleRepositories(): void {
  rememberRegisteredRepository('/samples/harbor', 'Harbor');
  rememberRegisteredRepository('/samples/northwind', 'Northwind');
  rememberRegisteredRepository('/samples/papertrail', 'Papertrail');
}

function installRepositoryBranchSource(): void {
  const source: RepositoryBranchSource = {
    list: (path) => readRepositoryBranches(path),
  };
  Object.assign(globalThis, { [REPOSITORY_BRANCH_SOURCE_HOST]: source });
}

function installRepositoryWorktreeCreate(): void {
  const create: RepositoryWorktreeCreate = {
    create: (repositoryPath, branch) => {
      createRepositoryWorktree(repositoryPath, branch);
    },
  };
  Object.assign(globalThis, { [REPOSITORY_WORKTREE_CREATE_HOST]: create });
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

  async reopen(displayName: string): Promise<void> {
    await this.switchRepository();
    await this.choose(displayName);
  }

  isCheckedOut(name: string): boolean {
    return this.branchRow(name).querySelector('.checked-out') instanceof HTMLElement;
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

  async createBranch(name: string): Promise<void> {
    const input = this.createBranchInput();
    input.value = name;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    this.fixture.detectChanges();
    await this.clickCreate();
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

  async selectCommit(subject: string): Promise<void> {
    const button = [...this.branchContent().querySelectorAll('.branch-commit button')].find(
      (candidate) => candidate.textContent?.trim() === subject,
    );
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`No commit ${subject}`);
    }
    button.click();
    this.fixture.detectChanges();
    await this.fixture.whenStable();
  }

  commitFiles(): readonly { path: string; linesAdded?: number; linesDeleted?: number }[] {
    return [...this.commitFileList().querySelectorAll('.commit-file')].map((row) =>
      fileLineCounts(row, '.commit-file-path'),
    );
  }

  async selectCommitFile(path: string): Promise<void> {
    const button = this.commitFileRow(path).querySelector('button');
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`No commit file ${path}`);
    }
    button.click();
    this.fixture.detectChanges();
    await this.fixture.whenStable();
  }

  commitDiff(): string {
    const diff = this.commitDiffElement();
    if (!diff) {
      throw new Error('Commit diff is not on screen');
    }
    return diff.textContent ?? '';
  }

  commitDiffIsOpen(): boolean {
    return this.commitDiffElement() !== null;
  }

  commitDiffIsInTheColumnToTheRight(): boolean {
    const files = this.commitFileList();
    const diff = this.commitDiffElement();
    const view = this.branchContent().querySelector('.commit-view');
    if (!diff || !(view instanceof HTMLElement)) {
      return false;
    }
    const viewStyle = getComputedStyle(view);
    const filesStyle = getComputedStyle(files);
    const diffStyle = getComputedStyle(diff);
    return viewStyle.display === 'grid' && filesStyle.gridColumnStart === '1' && diffStyle.gridColumnStart === '2';
  }

  commitFileText(path: string): string {
    return this.commitFileRow(path).textContent?.trim() ?? '';
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

  private createBranchInput(): HTMLInputElement {
    const input = [...this.sidebar().querySelectorAll('label')]
      .find((candidate) => candidate.textContent?.includes('Branch'))
      ?.querySelector('input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('No Branch field on the create control');
    }
    return input;
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

  private commitFileRow(path: string): HTMLElement {
    const row = [...this.commitFileList().querySelectorAll('.commit-file')].find(
      (candidate) => candidate.querySelector('.commit-file-path')?.textContent?.trim() === path,
    );
    if (!(row instanceof HTMLElement)) {
      throw new Error(`No commit file ${path}`);
    }
    return row;
  }

  private commitDiffElement(): HTMLElement | null {
    const diff = this.branchContent().querySelector('[aria-label="Commit diff"]');
    return diff instanceof HTMLElement ? diff : null;
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
