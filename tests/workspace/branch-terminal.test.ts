// @vitest-environment jsdom

import './setup';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceComponent } from '../../apps/workspace/workspace.component';

const TMUX = '/usr/bin/tmux';

function tmuxEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TMUX;
  delete env.TMUX_PANE;
  return env;
}

function listSessions(): string[] {
  try {
    const output = execFileSync(TMUX, ['list-sessions', '-F', '#{session_name}'], {
      encoding: 'utf8',
      env: tmuxEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function capturePane(session: string): string {
  return execFileSync(TMUX, ['capture-pane', '-t', session, '-p'], {
    encoding: 'utf8',
    env: tmuxEnv(),
  });
}

function createRepo(): { root: string; repo: string } {
  const root = mkdtempSync(join(tmpdir(), 'git-manager-workspace-'));
  const repo = join(root, 'billing');
  mkdirSync(repo);
  execFileSync('git', ['init', '-b', 'main'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@git-manager.local'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'git-manager test'], { cwd: repo, stdio: 'ignore' });
  writeFileSync(join(repo, 'README'), 'hi\n');
  execFileSync('git', ['add', 'README'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['branch', 'feature'], { cwd: repo, stdio: 'ignore' });
  const worktree = join(repo, '.workspaces', 'feature');
  mkdirSync(join(repo, '.workspaces'));
  execFileSync('git', ['worktree', 'add', worktree, 'feature'], { cwd: repo, stdio: 'ignore' });
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

function clickBranch(fixture: ComponentFixture<WorkspaceComponent>, name: string): void {
  const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
  const button = buttons.find((candidate) => candidate.textContent?.trim() === name);
  if (!button) {
    throw new Error(`Branch ${name} is not shown`);
  }
  button.click();
  fixture.detectChanges();
}

function paneText(fixture: ComponentFixture<WorkspaceComponent>): string {
  const pane = fixture.nativeElement.querySelector('.terminal-pane');
  return pane?.textContent ?? '';
}

function keyEvent(type: string, key: string, keyCode: number, charCode = 0): KeyboardEvent {
  const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'keyCode', { get: () => keyCode });
  Object.defineProperty(event, 'which', { get: () => (charCode || keyCode) });
  Object.defineProperty(event, 'charCode', { get: () => charCode });
  return event;
}

function submitCommand(root: HTMLElement, command: string): void {
  const textarea = root.querySelector('.terminal-pane textarea');
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error('The terminal pane is not accepting input');
  }
  textarea.focus();
  for (const char of command) {
    const keyCode = char === ' ' ? 32 : char === '-' ? 189 : char.toUpperCase().charCodeAt(0);
    textarea.dispatchEvent(keyEvent('keydown', char, keyCode));
    if (char === ' ') {
      textarea.dispatchEvent(keyEvent('keypress', char, 32, 32));
    }
  }
  textarea.dispatchEvent(keyEvent('keydown', 'Enter', 13));
}

async function waitFor(check: () => boolean): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out waiting for the terminal');
}

describe('branch terminal', () => {
  let root = '';
  let before: string[] = [];
  let fixture: ComponentFixture<WorkspaceComponent> | undefined;

  afterEach(() => {
    fixture?.destroy();
    for (const name of listSessions()) {
      if (!before.includes(name) && name.startsWith('gm_')) {
        try {
          execFileSync(TMUX, ['kill-session', '-t', name], { stdio: 'ignore', env: tmuxEnv() });
        } catch {
          // The session already exited.
        }
      }
    }
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs a command in the worktree tmux session and that session is visible outside', async () => {
    const repo = createRepo();
    root = repo.root;
    before = listSessions();
    fixture = renderWorkspace(repo.repo);

    clickBranch(fixture, 'feature');

    await waitFor(() => /[$#%]/.test(paneText(fixture!)));

    const started = listSessions().filter((name) => !before.includes(name));
    expect(started).toEqual([expect.stringMatching(/^gm_[0-9a-f]{8}_feature_1$/)]);

    submitCommand(fixture.nativeElement, 'echo marker-from-pane');

    await waitFor(() => paneText(fixture!).includes('marker-from-pane'));
    await waitFor(() => capturePane(started[0]).includes('marker-from-pane'));

    const pane = fixture.nativeElement.querySelector('.terminal-pane') as HTMLElement;
    expect(pane.getAttribute('style')).toContain('background-color: #1e1e1e');
  });
});
