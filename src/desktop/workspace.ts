import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BRANCH_TERMINALS, type BranchTerminalShell } from './branch-terminals.js';
import { DESKTOP_PLATFORM } from './desktop-platform.js';
import { REPOSITORY_BRANCH_SOURCE } from './repository-branch-source.js';
import { type Branch, type ListedBranch } from './repository-branches.js';
import { REPOSITORY_BRANCH_MERGE } from './repository-branch-merge.js';
import { REPOSITORY_WORKTREE_CREATE } from './repository-worktree-create.js';
import { REPOSITORY_WORKTREE_REMOVE } from './repository-worktree-remove.js';
import {
  REGISTERED_REPOSITORY_REGISTRY,
  type RegisteredRepository,
} from './registered-repository-registry.js';

function isListedBranch(branch: Branch): branch is ListedBranch {
  return branch.detached === false;
}

@Component({
  selector: 'git-manager-workspace',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (selected(); as repository) {
      <aside class="branch-sidebar" aria-label="Branches">
        <h2>{{ repository.displayName }}</h2>
        <ul class="branch-list">
          @for (branch of branches(); track branch.name) {
            <li
              class="branch-row"
              (click)="selectBranch(branch.name)"
              (mouseenter)="hoverBranch(branch.name)"
              (mouseleave)="leaveBranch()"
            >
              <span class="status" [class]="statusClass(branch)"></span>
              <span class="branch-name">{{ branch.name }}</span>
              <span class="branch-counts">
                @if (branch.hasWorktree) {
                  <span class="checked-out">Checked out</span>
                }
                <span class="changed-file-count">{{ changedFileCount(branch) }} changed</span>
                <span class="commits-ahead">{{ commitsAhead(branch) }} ahead</span>
                <span class="commits-behind">{{ commitsBehind(branch) }} behind</span>
                @if (branch.runningTerminals > 0) {
                  <span class="running-terminals">{{ branch.runningTerminals }} terminals</span>
                }
              </span>
              @if (hoveredBranch() === branch.name) {
                <div class="branch-menu" role="menu" aria-label="Branch actions" (click)="$event.stopPropagation()">
                  <label class="squash-merge">
                    <input type="checkbox" [checked]="squashMerge()" (change)="setSquashMerge($event)" />
                    Squash
                  </label>
                  <button type="button" role="menuitem" (click)="updateFromMaster(branch.name)">
                    Update from master
                  </button>
                  <button type="button" role="menuitem" (click)="mergeIntoMaster(branch.name)">
                    Merge into master
                  </button>
                  <button type="button" role="menuitem" (click)="removeWorktree(branch.name)">
                    Remove
                  </button>
                </div>
              }
            </li>
          }
        </ul>
        <form class="create-worktree" (submit)="createWorktree($event)">
          <label>
            Branch
            <input [value]="branchDraft()" (input)="setBranchDraft($event)" />
          </label>
          <button type="submit" class="create-branch">Create</button>
        </form>
        @if (mergeError(); as message) {
          <p class="merge-error" role="alert">{{ message }}</p>
        }
        @if (removeError(); as message) {
          <p class="remove-error" role="alert">{{ message }}</p>
        }
        @if (createError(); as message) {
          <p class="create-error" role="alert">{{ message }}</p>
        }
      </aside>
    }
    <section class="content-sheet" [class.has-sidebar]="selected() !== null" aria-label="Workspace">
      @if (selected(); as repository) {
        <h1>{{ repository.displayName }}</h1>
        <button type="button" (click)="openRepositoryList()">Switch repository</button>
        @if (selectedBranch(); as branch) {
          <section aria-label="Branch">
            <h2>{{ branch.name }}</h2>
            <ul class="changed-files branch-files" aria-label="Changed files">
              @for (change of branch.changes; track change.path) {
                <li class="changed-file">
                  <button type="button" (click)="selectChange(change.path)">
                    <span class="changed-file-path">{{ change.path }}</span>
                    @if (change.kind !== 'binary') {
                      <span class="lines-added">+{{ change.linesAdded }}</span>
                      <span class="lines-deleted">-{{ change.linesDeleted }}</span>
                    }
                  </button>
                </li>
              }
            </ul>
            @if (selectedChange(); as change) {
              @if (change.kind !== 'binary') {
                <pre class="file-diff" aria-label="Diff">{{ change.diff }}</pre>
              }
            }
            <ul class="branch-commits" aria-label="Commits only on this branch">
              @for (commit of branch.commitsAhead; track commit.id) {
                <li class="branch-commit">
                  <button type="button" (click)="selectCommit(commit.id)">{{ commit.subject }}</button>
                </li>
              }
            </ul>
            @if (selectedCommit(); as commit) {
              <div class="commit-view">
                <ul class="commit-files" aria-label="Commit files">
                  @for (file of commit.files; track file.path) {
                    <li class="commit-file">
                      <button type="button" (click)="selectCommitFile(file.path)">
                        <span class="commit-file-path">{{ file.path }}</span>
                        @if (file.kind !== 'binary') {
                          <span class="lines-added">+{{ file.linesAdded }}</span>
                          <span class="lines-deleted">-{{ file.linesDeleted }}</span>
                        }
                      </button>
                    </li>
                  }
                </ul>
                @if (selectedCommitFile(); as file) {
                  @if (file.kind !== 'binary') {
                    <pre class="commit-diff" aria-label="Commit diff">{{ file.diff }}</pre>
                  }
                }
              </div>
            }
            @if (branch.hasWorktree) {
              @if (tmuxTerminal) {
                <section class="branch-terminal" aria-label="Terminal">
                  <div class="terminal-sessions" role="tablist" aria-label="Terminal sessions">
                    @for (session of terminalSessions(); track session) {
                      <button
                        type="button"
                        role="tab"
                        [attr.aria-selected]="session === selectedTerminal()"
                        (click)="selectTerminal(session)"
                      >
                        {{ session }}
                      </button>
                    }
                  </div>
                  <div class="terminal-actions">
                    <button type="button" (click)="newTerminal()">New</button>
                    <button type="button" (click)="splitTerminal()">Split</button>
                    <button type="button" (click)="killTerminal()">Kill</button>
                  </div>
                  <pre class="terminal-pane" aria-label="Terminal pane"></pre>
                  @if (terminalError(); as message) {
                    <p class="terminal-error" role="alert">{{ message }}</p>
                  }
                </section>
              } @else if (terminalShell(); as shell) {
                <section class="branch-terminal" aria-label="Terminal">
                  <p class="terminal-shell">Shell</p>
                  <p class="terminal-cwd">{{ shellDirectory(shell) }}</p>
                </section>
              }
            }
          </section>
        }
      }
    </section>
    @if (showRepositoryCard()) {
      <div class="repository-card-layer">
        <section class="repository-card" aria-label="Registered repositories">
          <h2>Registered repositories</h2>
          <ul>
            @for (repository of repositories(); track repository.path) {
              <li [attr.data-registered-repository]="repository.displayName">
                <button type="button" (click)="choose(repository)">{{ repository.displayName }}</button>
                <span class="repository-path">{{ repository.path }}</span>
                <button type="button" (click)="unregister(repository)">Unregister</button>
              </li>
            }
          </ul>
          <form (submit)="addRepository($event)">
            <label>
              Repository path
              <input [value]="pathDraft()" (input)="setPathDraft($event)" />
            </label>
            <label>
              Display name
              <input [value]="displayNameDraft()" (input)="setDisplayNameDraft($event)" />
            </label>
            <button type="submit">Add</button>
          </form>
          @if (addError(); as message) {
            <p role="alert">{{ message }}</p>
          }
        </section>
      </div>
    }
  `,
  styles: `
    .branch-sidebar {
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      width: 16rem;
      margin: 0;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      background: #292524;
      color: #f5f5f4;
      padding: 16px;
    }

    .branch-sidebar h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .branch-list {
      list-style: none;
      margin: 16px 0 0;
      padding: 0;
      overflow: auto;
      flex: 1 1 auto;
      min-height: 0;
    }

    .create-worktree {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .create-worktree label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.85rem;
    }

    .create-worktree input {
      font: inherit;
      color: inherit;
      background: #1c1917;
      border: 1px solid #78716c;
      border-radius: 8px;
      padding: 6px 8px;
    }

    .create-branch {
      background: transparent;
      color: inherit;
      border: 1px solid #78716c;
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
    }

    .create-error {
      margin: 8px 0 0;
      color: #fecaca;
    }

    .branch-menu {
      grid-column: 1 / -1;
      display: flex;
      gap: 8px;
    }

    .branch-menu button {
      background: #44403c;
      color: inherit;
      border: 0;
      border-radius: 6px;
      padding: 4px 8px;
      cursor: pointer;
    }

    .squash-merge {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.8rem;
    }

    .merge-error,
    .remove-error {
      margin: 8px 0 0;
      color: #fecaca;
    }

    .branch-row {
      display: grid;
      grid-template-columns: auto 1fr;
      column-gap: 8px;
      row-gap: 2px;
      align-items: center;
      padding: 6px 0;
    }

    .branch-name {
      grid-column: 2;
    }

    .branch-counts {
      grid-column: 2;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      color: #a8a29e;
      font-size: 0.8rem;
    }

    .status {
      grid-row: 1 / span 2;
      width: 0.75rem;
      height: 0.75rem;
      border-radius: 999px;
    }

    .status-local-only {
      background: #7dd3fc;
    }

    .status-local-and-remote {
      background: #22c55e;
    }

    .status-remote-only {
      background: #facc15;
    }

    .status-remote-deleted {
      background: #ef4444;
    }

    .content-sheet {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      margin: 0;
      background: #1c1917;
      color: #f5f5f4;
      box-sizing: border-box;
      padding: 24px;
    }

    .content-sheet.has-sidebar {
      left: 16rem;
    }

    .content-sheet h1 {
      margin: 0 0 16px;
      font-size: 1.5rem;
      font-weight: 600;
    }

    .branch-files,
    .branch-commits {
      list-style: none;
      margin: 16px 0 0;
      padding: 0;
    }

    .file-diff {
      margin: 16px 0 0;
      white-space: pre-wrap;
    }

    .commit-view {
      display: grid;
      grid-template-columns: 16rem 1fr;
      column-gap: 16px;
      align-items: start;
    }

    .commit-files {
      grid-column-start: 1;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .commit-diff {
      grid-column-start: 2;
      margin: 0;
      white-space: pre-wrap;
    }

    .branch-terminal {
      margin-top: 16px;
    }

    .terminal-sessions,
    .terminal-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .terminal-pane {
      margin: 8px 0 0;
      min-height: 8rem;
      background: #0c0a09;
      color: #e7e5e4;
    }

    .terminal-shell,
    .terminal-cwd {
      margin: 0;
    }

    .terminal-error {
      margin: 8px 0 0;
      color: #fecaca;
    }

    .content-sheet button {
      background: transparent;
      color: inherit;
      border: 1px solid #78716c;
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
    }

    .repository-card-layer {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
    }

    .repository-card {
      background: #f7f4ef;
      color: #1c1917;
      border: 1px solid #d6d3d1;
      border-radius: 12px;
      padding: 24px 28px;
      min-width: 280px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
    }

    .repository-card h2 {
      margin: 0 0 12px;
      font-size: 0.95rem;
      font-weight: 600;
    }

    .repository-card ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .repository-path {
      display: block;
      margin: 0 4px 8px;
      color: #78716c;
      font-size: 0.8rem;
    }

    .repository-card button {
      width: 100%;
      text-align: left;
      background: transparent;
      border: 0;
      color: inherit;
      font: inherit;
      padding: 8px 4px;
      cursor: pointer;
    }

    .repository-card form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 16px;
    }

    .repository-card label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.85rem;
    }

    .repository-card input {
      font: inherit;
      padding: 6px 8px;
      border: 1px solid #d6d3d1;
      border-radius: 8px;
    }

    .repository-card form button {
      text-align: center;
      border: 1px solid #78716c;
      border-radius: 8px;
      padding: 8px 12px;
    }

    .repository-card [role='alert'] {
      margin: 8px 0 0;
      color: #b91c1c;
    }
  `,
})
export class Workspace {
  private readonly registry = inject(REGISTERED_REPOSITORY_REGISTRY);
  protected readonly repositories = signal(this.registry.list());
  private readonly branchSource = inject(REPOSITORY_BRANCH_SOURCE);
  private readonly worktreeCreate = inject(REPOSITORY_WORKTREE_CREATE);
  private readonly worktreeRemove = inject(REPOSITORY_WORKTREE_REMOVE);
  private readonly branchMerge = inject(REPOSITORY_BRANCH_MERGE);
  private readonly terminals = inject(BRANCH_TERMINALS);
  private readonly platform = inject(DESKTOP_PLATFORM);
  protected readonly tmuxTerminal = this.platform !== 'win32';
  protected readonly terminalSessions = signal<readonly string[]>([]);
  protected readonly selectedTerminal = signal<string | null>(null);
  protected readonly terminalShell = signal<BranchTerminalShell | null>(null);
  protected readonly terminalError = signal<string | null>(null);
  protected readonly selected = signal<RegisteredRepository | null>(null);
  protected readonly branchDraft = signal('');
  protected readonly createError = signal<string | null>(null);
  private readonly branchList = signal<readonly Branch[]>([]);
  protected readonly branches = computed(() => this.branchList().filter(isListedBranch));
  private readonly repositoryListOpen = signal(false);
  protected readonly pathDraft = signal('');
  protected readonly displayNameDraft = signal('');
  protected readonly addError = signal<string | null>(null);
  protected readonly hoveredBranch = signal<string | null>(null);
  protected readonly squashMerge = signal(false);
  protected readonly mergeError = signal<string | null>(null);
  protected readonly removeError = signal<string | null>(null);
  private readonly selectedBranchName = signal<string | null>(null);
  protected readonly selectedBranch = computed(() => {
    const name = this.selectedBranchName();
    return this.branches().find((branch) => branch.name === name) ?? null;
  });
  private readonly selectedChangePath = signal<string | null>(null);
  protected readonly selectedChange = computed(() => {
    const path = this.selectedChangePath();
    return this.selectedBranch()?.changes.find((change) => change.path === path) ?? null;
  });
  private readonly selectedCommitId = signal<string | null>(null);
  protected readonly selectedCommit = computed(() => {
    const id = this.selectedCommitId();
    return this.selectedBranch()?.commitsAhead.find((commit) => commit.id === id) ?? null;
  });
  private readonly selectedCommitFilePath = signal<string | null>(null);
  protected readonly selectedCommitFile = computed(() => {
    const path = this.selectedCommitFilePath();
    return this.selectedCommit()?.files.find((file) => file.path === path) ?? null;
  });
  protected readonly showRepositoryCard = computed(
    () => this.selected() === null || this.repositoryListOpen(),
  );

  protected changedFileCount(branch: ListedBranch): number {
    return branch.changes.length;
  }

  protected commitsAhead(branch: ListedBranch): number {
    return branch.commitsAhead.length;
  }

  protected commitsBehind(branch: ListedBranch): number {
    return branch.commitsBehind.length;
  }

  protected statusClass(branch: ListedBranch): string {
    switch (branch.tracking) {
      case 'local-only':
        return 'status status-local-only';
      case 'local-and-remote':
        return 'status status-local-and-remote';
      case 'remote-only':
        return 'status status-remote-only';
      case 'remote-deleted':
        return 'status status-remote-deleted';
    }
  }

  protected choose(repository: RegisteredRepository): void {
    this.selected.set(repository);
    this.repositoryListOpen.set(false);
    this.selectedBranchName.set(null);
    this.branchDraft.set('');
    this.createError.set(null);
    this.mergeError.set(null);
    this.removeError.set(null);
    this.clearBranchDetail();
    this.branchList.set(this.branchSource.list(repository.path));
  }

  protected setBranchDraft(event: Event): void {
    this.branchDraft.set(inputValue(event));
  }

  protected createWorktree(event: Event): void {
    event.preventDefault();
    const repository = this.selected();
    const branch = this.branchDraft().trim();
    if (!repository || branch === '') {
      return;
    }
    try {
      this.worktreeCreate.create(repository.path, branch);
      this.branchDraft.set('');
      this.createError.set(null);
    } catch (error) {
      this.createError.set(error instanceof Error ? error.message : 'Could not create worktree');
    }
    this.branchList.set(this.branchSource.list(repository.path));
  }

  protected selectBranch(name: string): void {
    this.selectedBranchName.set(name);
    this.clearBranchDetail();
    this.loadTerminal(name);
  }

  protected selectTerminal(session: string): void {
    this.selectedTerminal.set(session);
  }

  protected shellDirectory(shell: BranchTerminalShell): string {
    return shell.processes[0].cwd;
  }

  protected newTerminal(): void {
    const target = this.terminalTarget();
    if (!target) {
      return;
    }
    try {
      const session = this.terminals.create(target.repositoryPath, target.branch);
      this.terminalError.set(null);
      this.refreshBranches(target.repositoryPath);
      this.refreshTerminalSessions(target.repositoryPath, target.branch, session);
    } catch (error) {
      this.terminalError.set(error instanceof Error ? error.message : 'Could not open a terminal');
    }
  }

  protected splitTerminal(): void {
    const target = this.terminalTarget();
    const session = this.selectedTerminal();
    if (!target || !session) {
      return;
    }
    try {
      this.terminals.split(target.repositoryPath, target.branch, session);
      this.terminalError.set(null);
    } catch (error) {
      this.terminalError.set(error instanceof Error ? error.message : 'Could not split the terminal');
    }
  }

  protected killTerminal(): void {
    const target = this.terminalTarget();
    const session = this.selectedTerminal();
    if (!target || !session) {
      return;
    }
    try {
      this.terminals.kill(target.repositoryPath, target.branch, session);
      this.terminalError.set(null);
      this.refreshBranches(target.repositoryPath);
      this.refreshTerminalSessions(target.repositoryPath, target.branch, null);
    } catch (error) {
      this.terminalError.set(error instanceof Error ? error.message : 'Could not close the terminal');
    }
  }

  protected selectChange(path: string): void {
    this.selectedChangePath.set(path);
  }

  protected selectCommit(id: string): void {
    this.selectedCommitId.set(id);
    this.selectedCommitFilePath.set(null);
  }

  protected selectCommitFile(path: string): void {
    this.selectedCommitFilePath.set(path);
  }

  private clearBranchDetail(): void {
    this.selectedChangePath.set(null);
    this.selectedCommitId.set(null);
    this.selectedCommitFilePath.set(null);
  }

  private loadTerminal(name: string): void {
    this.terminalSessions.set([]);
    this.selectedTerminal.set(null);
    this.terminalShell.set(null);
    this.terminalError.set(null);
    const repository = this.selected();
    const branch = this.branches().find((candidate) => candidate.name === name);
    if (!repository || !branch?.hasWorktree) {
      return;
    }
    if (!this.tmuxTerminal) {
      this.terminalShell.set(this.terminals.shell(repository.path, name));
      return;
    }
    this.refreshTerminalSessions(repository.path, name, null);
  }

  private refreshTerminalSessions(repositoryPath: string, branch: string, select: string | null): void {
    const sessions = this.terminals.sessions(repositoryPath, branch);
    this.terminalSessions.set(sessions);
    if (select && sessions.includes(select)) {
      this.selectedTerminal.set(select);
      return;
    }
    this.selectedTerminal.set(sessions.at(-1) ?? null);
  }

  private refreshBranches(repositoryPath: string): void {
    this.branchList.set(this.branchSource.list(repositoryPath));
  }

  private terminalTarget(): { readonly repositoryPath: string; readonly branch: string } | null {
    const repository = this.selected();
    const branch = this.selectedBranch();
    if (!repository || !branch?.hasWorktree || !this.tmuxTerminal) {
      return null;
    }
    return { repositoryPath: repository.path, branch: branch.name };
  }

  protected openRepositoryList(): void {
    this.repositoryListOpen.set(true);
  }

  protected setPathDraft(event: Event): void {
    this.pathDraft.set(inputValue(event));
  }

  protected setDisplayNameDraft(event: Event): void {
    this.displayNameDraft.set(inputValue(event));
  }

  protected addRepository(event: Event): void {
    event.preventDefault();
    try {
      this.registry.add(this.pathDraft(), this.displayNameDraft());
      this.pathDraft.set('');
      this.displayNameDraft.set('');
      this.addError.set(null);
      this.reload();
    } catch (error) {
      this.addError.set(error instanceof Error ? error.message : 'Could not add repository');
    }
  }

  protected unregister(repository: RegisteredRepository): void {
    this.registry.unregister(repository.path);
    if (this.selected()?.path === repository.path) {
      this.selected.set(null);
      this.selectedBranchName.set(null);
      this.clearBranchDetail();
      this.branchList.set([]);
    }
    this.reload();
  }

  protected setSquashMerge(event: Event): void {
    const target: unknown = event.target;
    if (typeof target !== 'object' || target === null || !('checked' in target)) {
      this.squashMerge.set(false);
      return;
    }
    this.squashMerge.set(target.checked === true);
  }

  protected updateFromMaster(branch: string): void {
    this.mergeBranch(branch, 'update-from-master');
  }

  protected mergeIntoMaster(branch: string): void {
    this.mergeBranch(branch, 'into-master');
  }

  protected removeWorktree(branch: string): void {
    const repository = this.selected();
    if (!repository) {
      return;
    }
    try {
      this.worktreeRemove.remove(repository.path, branch);
      this.removeError.set(null);
    } catch (error) {
      this.removeError.set(error instanceof Error ? error.message : 'Could not remove worktree');
      return;
    }
    this.branchList.set(this.branchSource.list(repository.path));
  }

  private mergeBranch(branch: string, direction: 'update-from-master' | 'into-master'): void {
    const repository = this.selected();
    if (!repository) {
      return;
    }
    try {
      this.branchMerge.merge(repository.path, branch, direction, this.squashMerge());
      this.mergeError.set(null);
    } catch (error) {
      this.mergeError.set(error instanceof Error ? error.message : 'Could not merge');
      return;
    }
    this.branchList.set(this.branchSource.list(repository.path));
  }

  protected hoverBranch(name: string): void {
    this.hoveredBranch.set(name);
  }

  protected leaveBranch(): void {
    this.hoveredBranch.set(null);
  }

  private reload(): void {
    this.repositories.set(this.registry.list());
  }
}

function inputValue(event: Event): string {
  const target: unknown = event.target;
  if (typeof target !== 'object' || target === null || !('value' in target)) {
    return '';
  }
  const value = target.value;
  return typeof value === 'string' ? value : '';
}
