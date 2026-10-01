import { Component, OnInit, computed, input, signal } from '@angular/core';
import { mergeFromMasterTree, mergeIntoMasterTree } from '../../src/merge.js';
import { findWorktree, listBranches, primaryCheckoutBranch } from './branches';
import { ShellPane } from './shell-pane';
import { TerminalPane } from './terminal-pane';
import {
  createBranchSession,
  killTmuxSession,
  nextSessionIndex,
  sessionsForBranch,
} from './tmux-sessions';

@Component({
  selector: 'gm-workspace',
  standalone: true,
  imports: [TerminalPane, ShellPane],
  template: `
    <aside>
      @for (branch of branches(); track branch) {
        <div class="branch-row" (mouseenter)="showMenu(branch)" (mouseleave)="hideMenu()">
          <button type="button" (click)="selectBranch(branch)">
            <span class="branch-name">{{ branch }}</span>
            @if (terminalCount(branch) > 0) {
              <span class="terminal-count">{{ terminalCount(branch) }}</span>
            }
          </button>
          @if (menuBranch() === branch) {
            <div role="menu">
              <button type="button" (click)="openMerge('into', branch)">Merge into the master tree</button>
              <button type="button" (click)="openMerge('from', branch)">Merge from the master tree</button>
              <button type="button" (click)="openMerge('generic', branch)">Generic merge</button>
            </div>
          }
        </div>
      }
    </aside>
    <section>
      @if (notice()) {
        <p>{{ notice() }}</p>
      }
      @if (platform() === 'win32' && worktreePath()) {
        <div class="terminal-pane" [gmShell]="worktreePath()" style="background-color: #1e1e1e"></div>
      } @else if (sessions().length > 0) {
        <div class="terminal-chrome">
          <div role="tablist">
            @for (session of sessions(); track session) {
              <button type="button" role="tab" (click)="focusSession(session)">{{ session }}</button>
            }
          </div>
          <button type="button" (click)="split()">Split</button>
          <button type="button" (click)="newSession()">New</button>
          <button type="button" (click)="killSession()">Kill</button>
        </div>
        @for (session of visibleSessions(); track $index) {
          <div class="terminal-pane" [gmTerminal]="session" style="background-color: #1e1e1e"></div>
        }
      }
    </section>
    @if (mergeOpen()) {
      <dialog open>
        <label>
          Source
          @if (mergeSourceIsMasterTree()) {
            <span>master tree</span>
          }
          <input aria-label="Source" [value]="mergeSource()" />
        </label>
        <label>
          Target
          @if (mergeTargetIsMasterTree()) {
            <span>master tree</span>
          }
          <input aria-label="Target" [value]="mergeTarget()" />
        </label>
        <button type="button" (click)="confirmMerge()">Merge</button>
      </dialog>
    }
  `,
})
export class WorkspaceComponent implements OnInit {
  readonly repoPath = input.required<string>();
  readonly platform = input(hostPlatform());
  readonly branches = signal<string[]>([]);
  readonly notice = signal('');
  readonly selectedBranch = signal('');
  readonly worktreePath = signal('');
  readonly sessions = signal<string[]>([]);
  readonly focused = signal('');
  readonly splitView = signal(false);
  readonly menuBranch = signal('');
  readonly mergeOpen = signal(false);
  readonly mergeSource = signal('');
  readonly mergeTarget = signal('');
  readonly mergeSourceIsMasterTree = signal(false);
  readonly mergeTargetIsMasterTree = signal(false);
  readonly mergeMode = signal<'into' | 'from' | 'generic'>('generic');
  readonly mergeBranch = signal('');
  readonly visibleSessions = computed(() => {
    const focused = this.focused();
    const sessions = this.sessions();
    if (!focused) {
      return [];
    }
    if (!this.splitView() || sessions.length < 2) {
      return [focused];
    }
    const other = sessions.find((session) => session !== focused) ?? focused;
    return [focused, other];
  });

  ngOnInit(): void {
    this.branches.set(listBranches(this.repoPath()));
  }

  showMenu(branch: string): void {
    this.menuBranch.set(branch);
  }

  hideMenu(): void {
    this.menuBranch.set('');
  }

  openMerge(mode: 'into' | 'from' | 'generic', branch: string): void {
    const primary = primaryCheckoutBranch(this.repoPath());
    this.mergeMode.set(mode);
    this.mergeBranch.set(branch);
    if (mode === 'into') {
      this.mergeSource.set(branch);
      this.mergeTarget.set(primary);
      this.mergeSourceIsMasterTree.set(false);
      this.mergeTargetIsMasterTree.set(true);
    } else if (mode === 'from') {
      this.mergeSource.set(primary);
      this.mergeTarget.set(branch);
      this.mergeSourceIsMasterTree.set(true);
      this.mergeTargetIsMasterTree.set(false);
    } else {
      this.mergeSource.set('');
      this.mergeTarget.set('');
      this.mergeSourceIsMasterTree.set(false);
      this.mergeTargetIsMasterTree.set(false);
    }
    this.mergeOpen.set(true);
  }

  confirmMerge(): void {
    const mode = this.mergeMode();
    if (mode === 'generic') {
      return;
    }
    try {
      if (mode === 'into') {
        mergeIntoMasterTree(this.repoPath(), this.mergeBranch(), false);
      } else {
        mergeFromMasterTree(this.repoPath(), this.mergeBranch(), false);
      }
      this.mergeOpen.set(false);
    } catch (error) {
      this.notice.set(error instanceof Error ? error.message : String(error));
    }
  }

  selectBranch(branch: string): void {
    const cwd = findWorktree(this.repoPath(), branch);
    if (!cwd) {
      this.notice.set('This branch has no worktree.');
      this.clearTerminals();
      return;
    }
    this.notice.set('');
    this.selectedBranch.set(branch);
    this.worktreePath.set(cwd);
    this.splitView.set(false);
    if (this.platform() === 'win32') {
      this.sessions.set([]);
      this.focused.set('');
      return;
    }
    const existing = sessionsForBranch(this.repoPath(), branch);
    if (existing.length === 0) {
      const name = createBranchSession(this.repoPath(), branch, cwd, 1);
      this.sessions.set([name]);
      this.focused.set(name);
      return;
    }
    this.sessions.set(existing);
    this.focused.set(existing[0]);
  }

  terminalCount(branch: string): number {
    if (this.platform() === 'win32') {
      return branch === this.selectedBranch() && this.worktreePath().length > 0 ? 1 : 0;
    }
    if (branch === this.selectedBranch()) {
      return this.sessions().length;
    }
    return sessionsForBranch(this.repoPath(), branch).length;
  }

  focusSession(session: string): void {
    if (this.sessions().includes(session)) {
      this.focused.set(session);
    }
  }

  newSession(): void {
    const branch = this.selectedBranch();
    const cwd = this.worktreePath();
    if (!branch || !cwd) {
      return;
    }
    const index = nextSessionIndex(this.repoPath(), branch, this.sessions());
    const name = createBranchSession(this.repoPath(), branch, cwd, index);
    this.sessions.update((sessions) => [...sessions, name]);
    this.focused.set(name);
  }

  split(): void {
    const branch = this.selectedBranch();
    const cwd = this.worktreePath();
    if (!branch || !cwd) {
      return;
    }
    if (this.sessions().length < 2) {
      const index = nextSessionIndex(this.repoPath(), branch, this.sessions());
      const name = createBranchSession(this.repoPath(), branch, cwd, index);
      this.sessions.update((sessions) => [...sessions, name]);
    }
    this.splitView.set(true);
  }

  killSession(): void {
    const current = this.focused();
    if (!current) {
      return;
    }
    killTmuxSession(current);
    const remaining = this.sessions().filter((session) => session !== current);
    this.sessions.set(remaining);
    if (remaining.length < 2) {
      this.splitView.set(false);
    }
    this.focused.set(remaining[0] ?? '');
  }

  private clearTerminals(): void {
    this.selectedBranch.set('');
    this.worktreePath.set('');
    this.sessions.set([]);
    this.focused.set('');
    this.splitView.set(false);
  }
}

function hostPlatform(): string {
  if (typeof process !== 'undefined' && typeof process.platform === 'string') {
    return process.platform;
  }
  return 'linux';
}
