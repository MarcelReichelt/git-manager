import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { WorkspaceComponent } from '../src/desktop/workspace.component';

export interface HarnessBranch {
  name: string;
  folder: string;
}

const featureBranch: HarnessBranch = { name: 'feature', folder: 'feature' };

export function createRepository(
  prefix: string,
  branches: readonly HarnessBranch[] = [featureBranch],
): { root: string; repo: string } {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const repo = join(root, 'billing');
  mkdirSync(repo);
  execFileSync('git', ['init', '-b', 'master'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@git-worktree-manager.local'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'git-worktree-manager test'], { cwd: repo, stdio: 'ignore' });
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

export async function renderWorkspace(
  repo: string | null,
  options?: { platform?: string; tmuxInstalled?: boolean; liveRegistry?: boolean },
): Promise<ComponentFixture<WorkspaceComponent>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [WorkspaceComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(WorkspaceComponent);
  if (repo !== null) {
    fixture.componentRef.setInput('repositoryPath', repo);
  }
  if (options?.platform) {
    fixture.componentRef.setInput('platform', options.platform);
  }
  if (options?.tmuxInstalled !== undefined) {
    fixture.componentRef.setInput('tmuxInstalled', options.tmuxInstalled);
  }
  if (options?.liveRegistry) {
    fixture.componentRef.setInput('liveRegistry', true);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

export async function waitForTerminal(check: () => boolean): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    if (check()) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error('timed out waiting for the terminal');
}
