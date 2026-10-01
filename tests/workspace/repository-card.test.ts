// @vitest-environment jsdom

import './setup';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceComponent } from '../../apps/workspace/workspace.component';

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
});
