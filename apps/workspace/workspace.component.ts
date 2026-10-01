import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, input, signal } from '@angular/core';
import { mergeFromMasterTree, mergeIntoMasterTree, mergeSourceIntoTarget } from '../../src/merge.js';
import { addRepository, listRepositories, type RegisteredRepository } from '../../src/registry.js';
import {
  commitsOnBranch,
  findWorktree,
  listBranches,
  primaryCheckoutBranch,
  type BranchStatus,
  type BranchRow,
} from './branches';
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
  imports: [TerminalPane, ShellPane, NgTemplateOutlet],
  styles: [
    `
      .repository-card {
        position: fixed;
        top: 50%;
        left: 50%;
        z-index: 2;
        transform: translate(-50%, -50%);
        padding: 1.5rem;
        background: #ffffff;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      }
      .branch-status {
        display: inline-block;
        width: 0.75rem;
        height: 0.75rem;
        margin-right: 0.4rem;
        border-radius: 999px;
      }
    `,
  ],
  template: `
    @if (!activeRepo()) {
      <ng-container *ngTemplateOutlet="repositoryCard" />
    } @else {
    <button type="button" (click)="openSwitcher()">Switch</button>
    <aside>
      @for (branch of branches(); track branch.name) {
        <div class="branch-row" (mouseenter)="showMenu(branch.name)" (mouseleave)="hideMenu()">
          <span
            class="branch-status"
            role="img"
            [attr.data-status]="branch.status"
            [attr.aria-label]="statusName(branch.status)"
            [style.background-color]="statusColor(branch.status)"
          ></span>
          <button type="button" (click)="selectBranch(branch.name)">
            <span class="branch-name">{{ branch.name }}</span>
            @if (terminalCount(branch.name) > 0) {
              <span class="terminal-count">{{ terminalCount(branch.name) }}</span>
            }
          </button>
          <span class="changed-files">{{ branch.changedFiles }}</span>
          <span class="row-ahead">{{ branch.ahead }} ahead</span>
          <span class="row-behind">{{ branch.behind }} behind</span>
          @if (menuBranch() === branch.name) {
            <div role="menu">
              <button type="button" (click)="openMerge('into', branch.name)">Merge into the master tree</button>
              <button type="button" (click)="openMerge('from', branch.name)">Merge from the master tree</button>
              <button type="button" (click)="openMerge('generic', branch.name)">Generic merge</button>
            </div>
          }
        </div>
      }
    </aside>
    <section>
      @if (notice()) {
        <p>{{ notice() }}</p>
      }
      @if (selectedBranch()) {
        <div class="branch-commits">
          <p class="ahead">{{ ahead() }} ahead</p>
          <p class="behind">{{ behind() }} behind</p>
          <ul aria-label="Commits only on this branch">
            @for (subject of commitsOnlyOnBranch(); track $index) {
              <li>{{ subject }}</li>
            }
          </ul>
        </div>
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
          <input aria-label="Source" [value]="mergeSource()" (input)="onMergeSource($event)" />
        </label>
        <label>
          Target
          @if (mergeTargetIsMasterTree()) {
            <span>master tree</span>
          }
          <input aria-label="Target" [value]="mergeTarget()" (input)="onMergeTarget($event)" />
        </label>
        <label>
          <input aria-label="Squash" type="checkbox" [checked]="squash()" (change)="onSquash($event)" />
          Squash
        </label>
        <button type="button" (click)="confirmMerge()">Merge</button>
      </dialog>
    }
    @if (switcherOpen()) {
      <ng-container *ngTemplateOutlet="repositoryCard" />
    }
    }
    <ng-template #repositoryCard>
      <section class="repository-card" aria-label="Repositories">
        <ul>
          @for (repo of repositories(); track repo.path) {
            <li>
              <button type="button" (click)="chooseRepository(repo.path)">{{ repo.displayName }}</button>
            </li>
          }
        </ul>
        <label>
          Path
          <input aria-label="Path" [value]="addPath()" (input)="onAddPath($event)" />
        </label>
        <label>
          Display name
          <input aria-label="Display name" [value]="addName()" (input)="onAddName($event)" />
        </label>
        <button type="button" (click)="addRegisteredRepository()">Add</button>
      </section>
    </ng-template>
  `,
})
export class WorkspaceComponent implements OnInit {
  readonly repoPath = input('');
  readonly chosenPath = signal('');
  readonly activeRepo = computed(() => this.chosenPath() || this.repoPath());
  readonly repositories = signal<RegisteredRepository[]>([]);
  readonly addPath = signal('');
  readonly addName = signal('');
  readonly switcherOpen = signal(false);
  readonly platform = input(hostPlatform());
  readonly branches = signal<BranchRow[]>([]);
  readonly notice = signal('');
  readonly selectedBranch = signal('');
  readonly ahead = signal(0);
  readonly behind = signal(0);
  readonly commitsOnlyOnBranch = signal<string[]>([]);
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
  readonly squash = signal(false);
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
    if (this.activeRepo()) {
      this.branches.set(listBranches(this.activeRepo()));
      return;
    }
    this.repositories.set(listRepositories());
  }

  onAddPath(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.addPath.set(target.value);
    }
  }

  onAddName(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.addName.set(target.value);
    }
  }

  addRegisteredRepository(): void {
    const path = this.addPath().trim();
    const displayName = this.addName().trim();
    if (!path || !displayName) {
      return;
    }
    addRepository(path, displayName);
    this.addPath.set('');
    this.addName.set('');
    this.repositories.set(listRepositories());
  }

  openSwitcher(): void {
    this.repositories.set(listRepositories());
    this.switcherOpen.set(true);
  }

  chooseRepository(path: string): void {
    this.switcherOpen.set(false);
    this.chosenPath.set(path);
    this.notice.set('');
    this.selectedBranch.set('');
    this.ahead.set(0);
    this.behind.set(0);
    this.commitsOnlyOnBranch.set([]);
    this.worktreePath.set('');
    this.sessions.set([]);
    this.focused.set('');
    this.splitView.set(false);
    this.menuBranch.set('');
    this.mergeOpen.set(false);
    this.branches.set(listBranches(path));
  }

  statusName(status: BranchStatus): string {
    if (status === 'local-only') {
      return 'Local only';
    }
    if (status === 'local-and-remote') {
      return 'On the remote';
    }
    if (status === 'remote-only') {
      return 'Remote only';
    }
    return 'Remote deleted';
  }

  statusColor(status: BranchStatus): string {
    if (status === 'local-only') {
      return 'lightblue';
    }
    if (status === 'local-and-remote') {
      return 'green';
    }
    if (status === 'remote-only') {
      return 'yellow';
    }
    return 'red';
  }

  showMenu(branch: string): void {
    this.menuBranch.set(branch);
  }

  hideMenu(): void {
    this.menuBranch.set('');
  }

  openMerge(mode: 'into' | 'from' | 'generic', branch: string): void {
    const primary = primaryCheckoutBranch(this.activeRepo());
    this.mergeMode.set(mode);
    this.mergeBranch.set(branch);
    this.squash.set(false);
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

  onMergeSource(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.mergeSource.set(target.value);
    }
  }

  onMergeTarget(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.mergeTarget.set(target.value);
    }
  }

  onSquash(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.squash.set(target.checked);
    }
  }

  confirmMerge(): void {
    const mode = this.mergeMode();
    const squash = this.squash();
    try {
      if (mode === 'into') {
        mergeIntoMasterTree(this.activeRepo(), this.mergeBranch(), squash);
      } else if (mode === 'from') {
        mergeFromMasterTree(this.activeRepo(), this.mergeBranch(), squash);
      } else {
        const source = this.mergeSource().trim();
        const target = this.mergeTarget().trim();
        if (!source || !target) {
          return;
        }
        mergeSourceIntoTarget(this.activeRepo(), source, target, squash);
      }
      this.mergeOpen.set(false);
    } catch (error) {
      this.notice.set(error instanceof Error ? error.message : String(error));
    }
  }

  selectBranch(branch: string): void {
    const commits = commitsOnBranch(this.activeRepo(), branch);
    const cwd = findWorktree(this.activeRepo(), branch);
    if (!cwd) {
      this.notice.set('This branch has no worktree.');
      this.clearTerminals();
      this.selectedBranch.set(branch);
      this.ahead.set(commits.ahead);
      this.behind.set(commits.behind);
      this.commitsOnlyOnBranch.set(commits.subjects);
      return;
    }
    this.notice.set('');
    this.selectedBranch.set(branch);
    this.ahead.set(commits.ahead);
    this.behind.set(commits.behind);
    this.commitsOnlyOnBranch.set(commits.subjects);
    this.worktreePath.set(cwd);
    this.splitView.set(false);
    if (this.platform() === 'win32') {
      this.sessions.set([]);
      this.focused.set('');
      return;
    }
    const existing = sessionsForBranch(this.activeRepo(), branch);
    if (existing.length === 0) {
      const name = createBranchSession(this.activeRepo(), branch, cwd, 1);
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
    return sessionsForBranch(this.activeRepo(), branch).length;
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
    const index = nextSessionIndex(this.activeRepo(), branch, this.sessions());
    const name = createBranchSession(this.activeRepo(), branch, cwd, index);
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
      const index = nextSessionIndex(this.activeRepo(), branch, this.sessions());
      const name = createBranchSession(this.activeRepo(), branch, cwd, index);
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
