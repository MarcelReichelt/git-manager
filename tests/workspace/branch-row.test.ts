// @vitest-environment jsdom

import './setup';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceComponent } from '../../apps/workspace/workspace.component';

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function initRepo(repo: string): void {
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'trunk']);
  git(repo, ['config', 'user.email', 'test@git-manager.local']);
  git(repo, ['config', 'user.name', 'git-manager test']);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(repo, 'README'), 'hi\n');
  git(repo, ['add', 'README']);
  git(repo, ['commit', '-m', 'init']);
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
  const rows = Array.from(fixture.nativeElement.querySelectorAll('.branch-row')) as HTMLElement[];
  const row = rows.find((candidate) => candidate.querySelector('.branch-name')?.textContent?.trim() === name);
  if (!row) {
    throw new Error(`Branch ${name} is not shown`);
  }
  return row;
}

function branchNames(fixture: ComponentFixture<WorkspaceComponent>): string[] {
  return Array.from(fixture.nativeElement.querySelectorAll('.branch-name'), (name) => (name.textContent ?? '').trim());
}

function rowFacts(
  fixture: ComponentFixture<WorkspaceComponent>,
  name: string,
): { changedFiles: string; ahead: string; behind: string } {
  const row = branchRow(fixture, name);
  return {
    changedFiles: row.querySelector('.changed-files')?.textContent?.trim() ?? '',
    ahead: row.querySelector('.row-ahead')?.textContent?.trim() ?? '',
    behind: row.querySelector('.row-behind')?.textContent?.trim() ?? '',
  };
}

function addWorktree(repo: string, branch: string): string {
  const worktree = join(repo, '.workspaces', branch);
  mkdirSync(join(repo, '.workspaces'), { recursive: true });
  git(repo, ['worktree', 'add', worktree, branch]);
  return worktree;
}

function branchStatus(fixture: ComponentFixture<WorkspaceComponent>, name: string): { color: string; status: string | null } {
  const swatch = branchRow(fixture, name).querySelector('[data-status]');
  if (!(swatch instanceof HTMLElement)) {
    throw new Error(`Branch ${name} has no status`);
  }
  return {
    color: swatch.style.backgroundColor,
    status: swatch.getAttribute('data-status'),
  };
}

describe('branch row', () => {
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

  it('colors a branch by whether it is local, on the remote, or gone, with no text badge', () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-status-'));
    const repo = join(root, 'billing');
    const remote = join(root, 'remote.git');
    initRepo(repo);
    execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' });
    git(repo, ['remote', 'add', 'origin', remote]);
    git(repo, ['push', '-u', 'origin', 'trunk']);
    git(repo, ['branch', 'scratch']);
    git(repo, ['branch', 'feature']);
    git(repo, ['push', '-u', 'origin', 'feature']);
    git(repo, ['branch', 'shipped']);
    git(repo, ['push', 'origin', 'shipped']);
    git(repo, ['branch', '-D', 'shipped']);
    git(repo, ['branch', 'retired']);
    git(repo, ['push', '-u', 'origin', 'retired']);
    git(repo, ['push', 'origin', '--delete', 'retired']);
    git(repo, ['checkout', '--detach']);
    fixture = renderWorkspace(repo);

    expect(branchNames(fixture)).toEqual(['feature', 'retired', 'scratch', 'shipped', 'trunk']);
    expect(branchStatus(fixture, 'scratch')).toEqual({ color: 'lightblue', status: 'local-only' });
    expect(branchStatus(fixture, 'feature')).toEqual({ color: 'green', status: 'local-and-remote' });
    expect(branchStatus(fixture, 'shipped')).toEqual({ color: 'yellow', status: 'remote-only' });
    expect(branchStatus(fixture, 'retired')).toEqual({ color: 'red', status: 'remote-deleted' });

    for (const name of ['scratch', 'feature', 'shipped', 'retired']) {
      const swatch = branchRow(fixture, name).querySelector('[data-status]');
      expect(swatch?.textContent?.trim()).toBe('');
      expect(branchRow(fixture, name).textContent ?? '').not.toMatch(/tracking|gone|local only|remote only/i);
    }
  });

  it('shows the changed-file count and the commits that branch is ahead and behind', () => {
    root = mkdtempSync(join(tmpdir(), 'git-manager-status-'));
    const repo = join(root, 'billing');
    initRepo(repo);
    git(repo, ['checkout', '-b', 'feature']);
    writeFileSync(join(repo, 'invoice.txt'), 'invoice\n');
    git(repo, ['add', 'invoice.txt']);
    git(repo, ['commit', '-m', 'add invoice']);
    writeFileSync(join(repo, 'tax.txt'), 'tax\n');
    git(repo, ['add', 'tax.txt']);
    git(repo, ['commit', '-m', 'add tax']);
    git(repo, ['checkout', 'trunk']);
    writeFileSync(join(repo, 'trunk.txt'), 'from trunk\n');
    git(repo, ['add', 'trunk.txt']);
    git(repo, ['commit', '-m', 'ship billing']);
    git(repo, ['branch', 'renamed']);
    git(repo, ['branch', 'pictures']);

    const feature = addWorktree(repo, 'feature');
    writeFileSync(join(feature, 'README'), 'changed\n');
    const renamed = addWorktree(repo, 'renamed');
    git(renamed, ['mv', 'README', 'GUIDE']);
    const pictures = addWorktree(repo, 'pictures');
    writeFileSync(join(pictures, 'logo.bin'), Buffer.from([0, 1, 2, 255]));
    git(pictures, ['add', 'logo.bin']);
    git(pictures, ['commit', '-m', 'add logo']);
    writeFileSync(join(pictures, 'logo.bin'), Buffer.from([9, 9, 9, 9]));
    fixture = renderWorkspace(repo);

    expect(rowFacts(fixture, 'feature')).toEqual({
      changedFiles: '1',
      ahead: '2 ahead',
      behind: '1 behind',
    });
    expect(rowFacts(fixture, 'renamed')).toEqual({
      changedFiles: '1',
      ahead: '0 ahead',
      behind: '0 behind',
    });
    expect(rowFacts(fixture, 'pictures')).toEqual({
      changedFiles: '1',
      ahead: '1 ahead',
      behind: '0 behind',
    });
  });
});
