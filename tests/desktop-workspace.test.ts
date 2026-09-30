/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { upsertRepository } from '../src/core/registry.js';
import type { ListedBranch } from '../src/desktop/repository-branches.js';
import { REPOSITORY_BRANCHES } from '../src/desktop/sample-branches.js';
import { Workspace } from '../src/desktop/workspace.js';
import { createTempDir, setupTestEnv } from './helpers.js';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

const sampleDisplayNames = ['Harbor', 'Northwind', 'Papertrail'];

describe('desktop workspace', () => {
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnv(createTempDir());
    cleanup = env.cleanup;
    upsertRepository({
      name: 'Registry Only',
      path: '/tmp/registry-only',
      gitRoot: '/tmp/registry-only',
      primaryBranch: 'main',
      layoutMode: 'workspaces',
    });
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows a centered card of sample registered repositories on first start', async () => {
    const screen = await openWorkspace();

    expect(screen.repositoryNames()).toEqual(sampleDisplayNames);
    expect(screen.text()).not.toContain('Registry Only');
    expect(screen.cardIsCenteredInTheWindow()).toBe(true);
  });

  it('shows the chosen repository workspace', async () => {
    const screen = await openWorkspace();

    await screen.choose('Harbor');

    expect(screen.workspaceTitle()).toBe('Harbor');
    expect(screen.repositoryCardIsOpen()).toBe(false);
  });

  it('opens a card overlay of the same sample repositories when switching', async () => {
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
    const screen = await openWorkspace();

    expect(screen.contentSheetIsFlushWithTheWindow()).toBe(true);

    await screen.choose('Harbor');

    expect(screen.contentSheetIsFlushWithTheWindow()).toBe(true);
  });

  it('lists every sample branch for the selected repository, including one with no worktree', async () => {
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
    const screen = await openWorkspace();
    await screen.choose('Harbor');

    for (const name of screen.branchNames()) {
      expect(screen.branchRowText(name)).toMatch(/\d+ changed/);
      expect(screen.branchRowText(name)).toMatch(/\d+ ahead/);
      expect(screen.branchRowText(name)).toMatch(/\d+ behind/);
    }

    const rename = listedHarborBranch('rename-docs');
    expect(rename.changes).toEqual([
      { kind: 'rename', path: 'docs/guide.md', previousPath: 'docs/old-guide.md' },
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

  it('shows a terminal count only while terminals for that branch are running', async () => {
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
  });

  it('shows the selected repository display name in the sidebar', async () => {
    const screen = await openWorkspace();

    expect(screen.branchSidebarIsOpen()).toBe(false);

    await screen.choose('Harbor');

    expect(screen.sidebarRepositoryName()).toBe('Harbor');

    await screen.switchRepository();
    await screen.choose('Northwind');

    expect(screen.sidebarRepositoryName()).toBe('Northwind');
  });
});

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
    return [...this.card().querySelectorAll('button')].map((button) => button.textContent?.trim() ?? '');
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
}
