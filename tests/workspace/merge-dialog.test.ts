// @vitest-environment jsdom

import './setup';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceComponent } from '../../apps/workspace/workspace.component';

function createRepo(): { root: string; repo: string } {
  const root = mkdtempSync(join(tmpdir(), 'git-manager-merge-'));
  const repo = join(root, 'billing');
  mkdirSync(repo);
  execFileSync('git', ['init', '-b', 'trunk'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@git-manager.local'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'git-manager test'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: repo, stdio: 'ignore' });
  writeFileSync(join(repo, 'README'), 'hi\n');
  execFileSync('git', ['add', 'README'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['branch', 'feature'], { cwd: repo, stdio: 'ignore' });
  return { root, repo };
}

function renderWorkspace(repo: string): ComponentFixture<WorkspaceComponent> {
  TestBed.configureTestingModule({
    imports: [WorkspaceComponent],
  });
  const fixture = TestBed.createComponent(WorkspaceComponent);
  fixture.componentRef.setInput('repoPath', repo);
  fixture.detectChanges();
  return fixture;
}

function branchRow(fixture: ComponentFixture<WorkspaceComponent>, name: string): HTMLElement {
  const rows = Array.from(fixture.nativeElement.querySelectorAll('aside .branch-row')) as HTMLElement[];
  const row = rows.find((candidate) => candidate.querySelector('.branch-name')?.textContent?.trim() === name);
  if (!row) {
    throw new Error(`Branch ${name} is not shown`);
  }
  return row;
}

function hoverBranch(fixture: ComponentFixture<WorkspaceComponent>, name: string): void {
  branchRow(fixture, name).dispatchEvent(new MouseEvent('mouseenter'));
  fixture.detectChanges();
}

function clickMenu(fixture: ComponentFixture<WorkspaceComponent>, label: string): void {
  const buttons = Array.from(fixture.nativeElement.querySelectorAll('[role="menu"] button')) as HTMLButtonElement[];
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label);
  if (!button) {
    throw new Error(`${label} is not in the hover menu`);
  }
  button.click();
  fixture.detectChanges();
}

function mergeDialog(fixture: ComponentFixture<WorkspaceComponent>): HTMLElement {
  const dialogs = fixture.nativeElement.querySelectorAll('dialog');
  expect(dialogs).toHaveLength(1);
  return dialogs[0] as HTMLElement;
}

function fieldValue(dialog: HTMLElement, name: 'Source' | 'Target'): { value: string; masterTree: boolean } {
  const input = dialog.querySelector(`[aria-label="${name}"]`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`${name} is not on the merge dialog`);
  }
  const label = input.closest('label');
  return {
    value: input.value,
    masterTree: (label?.textContent ?? '').includes('master tree'),
  };
}

describe('merge dialog', () => {
  let root = '';
  let fixture: ComponentFixture<WorkspaceComponent> | undefined;

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    fixture?.destroy();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('opens one dialog, prefilled for into and from, and blank for a generic merge', () => {
    const repo = createRepo();
    root = repo.root;
    fixture = renderWorkspace(repo.repo);

    hoverBranch(fixture, 'feature');
    clickMenu(fixture, 'Merge into the master tree');

    const into = mergeDialog(fixture);
    expect(fieldValue(into, 'Source')).toEqual({ value: 'feature', masterTree: false });
    expect(fieldValue(into, 'Target')).toEqual({ value: 'trunk', masterTree: true });

    hoverBranch(fixture, 'feature');
    clickMenu(fixture, 'Merge from the master tree');

    const from = mergeDialog(fixture);
    expect(fieldValue(from, 'Source')).toEqual({ value: 'trunk', masterTree: true });
    expect(fieldValue(from, 'Target')).toEqual({ value: 'feature', masterTree: false });

    hoverBranch(fixture, 'feature');
    clickMenu(fixture, 'Generic merge');

    const generic = mergeDialog(fixture);
    expect(fieldValue(generic, 'Source')).toEqual({ value: '', masterTree: false });
    expect(fieldValue(generic, 'Target')).toEqual({ value: '', masterTree: false });
  });
});
