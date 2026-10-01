import { Component, OnInit, computed, input, signal } from '@angular/core';
import { findWorktree, listBranches } from './branches';
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
  imports: [TerminalPane],
  template: `
    <aside>
      @for (branch of branches(); track branch) {
        <button type="button" (click)="selectBranch(branch)">
          <span class="branch-name">{{ branch }}</span>
          @if (terminalCount(branch) > 0) {
            <span class="terminal-count">{{ terminalCount(branch) }}</span>
          }
        </button>
      }
    </aside>
    <section>
      @if (notice()) {
        <p>{{ notice() }}</p>
      }
      @if (sessions().length > 0) {
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
  `,
})
export class WorkspaceComponent implements OnInit {
  readonly repoPath = input.required<string>();
  readonly branches = signal<string[]>([]);
  readonly notice = signal('');
  readonly selectedBranch = signal('');
  readonly worktreePath = signal('');
  readonly sessions = signal<string[]>([]);
  readonly focused = signal('');
  readonly splitView = signal(false);
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
