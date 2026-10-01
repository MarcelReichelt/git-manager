// @vitest-environment jsdom

import './setup';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceComponent } from '../../apps/workspace/workspace.component';
import { addRepository } from '../../src/registry.js';

function initRepo(repo: string): void {
  mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '-b', 'trunk'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@git-manager.local'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'git-manager test'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: repo, stdio: 'ignore' });
  writeFileSync(join(repo, 'README'), 'hi\n');
  execFileSync('git', ['add', 'README'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repo, stdio: 'ignore' });
}

function renderWorkspace(): ComponentFixture<WorkspaceComponent> {
  TestBed.configureTestingModule({
    imports: [WorkspaceComponent],
  });
  const fixture = TestBed.createComponent(WorkspaceComponent);
  fixture.detectChanges();
  return fixture;
}

function repositoryCard(fixture: ComponentFixture<WorkspaceComponent>): HTMLElement {
  const card = fixture.nativeElement.querySelector('.repository-card');
  if (!(card instanceof HTMLElement)) {
    throw new Error('The repository card is not shown');
  }
  return card;
}

function setField(fixture: ComponentFixture<WorkspaceComponent>, label: string, value: string): void {
  const field = repositoryCard(fixture).querySelector(`[aria-label="${label}"]`);
  if (!(field instanceof HTMLInputElement)) {
    throw new Error(`${label} is not on the card`);
  }
  field.value = value;
  field.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function clickCardButton(fixture: ComponentFixture<WorkspaceComponent>, label: string): void {
  const buttons = Array.from(repositoryCard(fixture).querySelectorAll('button')) as HTMLButtonElement[];
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label);
  if (!button) {
    throw new Error(`${label} is not on the card`);
  }
  button.click();
  fixture.detectChanges();
}

function cardNames(fixture: ComponentFixture<WorkspaceComponent>): string[] {
  const buttons = Array.from(repositoryCard(fixture).querySelectorAll('li button')) as HTMLButtonElement[];
  return buttons.map((button) => button.textContent?.trim() ?? '');
}

function branchNames(fixture: ComponentFixture<WorkspaceComponent>): string[] {
  return Array.from(fixture.nativeElement.querySelectorAll('.branch-name'), (name) => (name.textContent ?? '').trim());
}

describe('repository card', () => {
  let root = '';
  let fixture: ComponentFixture<WorkspaceComponent> | undefined;
  let previousRegistry: string | undefined;

  beforeEach(() => {
    previousRegistry = process.env.GIT_MANAGER_REGISTRY_PATH;
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    fixture?.destroy();
    if (previousRegistry === undefined) {
      delete process.env.GIT_MANAGER_REGISTRY_PATH;
    } else {
      process.env.GIT_MANAGER_REGISTRY_PATH = previousRegistry;
    }
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('adds a local repository from the centered card and lists its display name', () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-card-'));
    const repo = join(root, 'billing');
    initRepo(repo);
    process.env.GIT_MANAGER_REGISTRY_PATH = join(root, 'registry.db');
    fixture = renderWorkspace();

    setField(fixture, 'Path', repo);
    setField(fixture, 'Display name', 'Billing');
    clickCardButton(fixture, 'Add');

    expect(repositoryCard(fixture).textContent).toContain('Billing');
    expect(fixture.nativeElement.textContent).not.toContain(repo);
  });

  it('lists registered repositories and opens the branches of the one you choose', () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-card-'));
    const billing = join(root, 'billing');
    const ledger = join(root, 'ledger');
    initRepo(billing);
    initRepo(ledger);
    execFileSync('git', ['branch', 'feature'], { cwd: billing, stdio: 'ignore' });
    execFileSync('git', ['branch', 'release'], { cwd: ledger, stdio: 'ignore' });
    process.env.GIT_MANAGER_REGISTRY_PATH = join(root, 'registry.db');
    addRepository(billing, 'Billing');
    addRepository(ledger, 'Ledger');
    fixture = renderWorkspace();

    expect(cardNames(fixture)).toEqual(['Billing', 'Ledger']);
    expect(fixture.nativeElement.textContent).not.toContain(billing);
    expect(fixture.nativeElement.textContent).not.toContain(ledger);

    clickCardButton(fixture, 'Billing');

    expect(branchNames(fixture)).toEqual(['feature', 'trunk']);
  });

  it('opens a switching overlay that lists repositories and can add one', () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-card-'));
    const billing = join(root, 'billing');
    const ledger = join(root, 'ledger');
    const payroll = join(root, 'payroll');
    initRepo(billing);
    initRepo(ledger);
    initRepo(payroll);
    execFileSync('git', ['branch', 'feature'], { cwd: billing, stdio: 'ignore' });
    process.env.GIT_MANAGER_REGISTRY_PATH = join(root, 'registry.db');
    addRepository(billing, 'Billing');
    addRepository(ledger, 'Ledger');
    fixture = renderWorkspace();
    clickCardButton(fixture, 'Billing');

    clickButton(fixture, 'Switch');

    expect(cardNames(fixture)).toEqual(['Billing', 'Ledger']);
    expect(branchNames(fixture)).toEqual(['feature', 'trunk']);

    setField(fixture, 'Path', payroll);
    setField(fixture, 'Display name', 'Payroll');
    clickCardButton(fixture, 'Add');

    expect(cardNames(fixture)).toEqual(['Billing', 'Ledger', 'Payroll']);
    expect(fixture.nativeElement.textContent).not.toContain(payroll);
    expect(branchNames(fixture)).toEqual(['feature', 'trunk']);
  });
});

function clickButton(fixture: ComponentFixture<WorkspaceComponent>, label: string): void {
  const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label);
  if (!button) {
    throw new Error(`${label} is not shown`);
  }
  button.click();
  fixture.detectChanges();
}
