/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { upsertRepository } from '../src/core/registry.js';
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
});

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
}
