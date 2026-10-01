import { Component, OnInit, input, signal } from '@angular/core';
import { findWorktree, listBranches } from './branches';
import { TerminalPane } from './terminal-pane';
import { ensureBranchSession } from './tmux-sessions';

@Component({
  selector: 'gm-workspace',
  standalone: true,
  imports: [TerminalPane],
  template: `
    <aside>
      @for (branch of branches(); track branch) {
        <button type="button" (click)="selectBranch(branch)">{{ branch }}</button>
      }
    </aside>
    <section>
      @if (notice()) {
        <p>{{ notice() }}</p>
      }
      @if (sessionName(); as name) {
        <div
          class="terminal-pane"
          [attr.data-cwd]="worktreePath()"
          [gmTerminal]="name"
          style="background-color: #1e1e1e"
        ></div>
      }
    </section>
  `,
})
export class WorkspaceComponent implements OnInit {
  readonly repoPath = input.required<string>();
  readonly branches = signal<string[]>([]);
  readonly notice = signal('');
  readonly sessionName = signal('');
  readonly worktreePath = signal('');

  ngOnInit(): void {
    this.branches.set(listBranches(this.repoPath()));
  }

  selectBranch(branch: string): void {
    const cwd = findWorktree(this.repoPath(), branch);
    if (!cwd) {
      this.notice.set('This branch has no worktree.');
      this.sessionName.set('');
      this.worktreePath.set('');
      return;
    }
    this.notice.set('');
    this.worktreePath.set(cwd);
    this.sessionName.set(ensureBranchSession(this.repoPath(), branch, cwd));
  }
}
