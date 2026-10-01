import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, NgZone, OnInit, signal } from '@angular/core';
import { basename } from 'node:path';
import { findRepository } from '../registry.js';
import { mergeIntoMaster, updateFromMaster } from '../merge.js';
import { createWorktree, findCheckout, removeWorktree } from '../worktrees.js';
import { ShellPane } from './shell-pane';
import { TerminalPane } from './terminal-pane';
import {
  createBranchSession,
  killTmuxSession,
  nextSessionIndex,
  sessionsForBranch,
} from './tmux-sessions';
import {
  listBranches,
  readChangedFiles,
  readCommitFileDiff,
  readCommitFiles,
  readCommitsOnlyOnBranch,
  readWorkingTreeDiff,
  type BranchCommit,
  type ChangedFile,
} from '../branches.js';

type BranchStatus = 'local-only' | 'local-and-remote' | 'remote-only' | 'remote-deleted';

interface SampleFile {
  path: string;
  previousPath?: string;
  added: number | null;
  deleted: number | null;
  diff?: string;
}

interface SampleCommit {
  subject: string;
  files?: SampleFile[];
  diff?: string;
}

interface SampleBranch {
  name: string;
  status: BranchStatus;
  changedFileCount: number;
  ahead: number;
  behind: number;
  files?: SampleFile[];
  commits?: SampleCommit[];
}

const harborBranches: SampleBranch[] = [
  {
    name: 'feature/login',
    status: 'local-and-remote',
    changedFileCount: 2,
    ahead: 3,
    behind: 1,
    files: [
      { path: 'src/login.ts', added: 12, deleted: 3, diff: '+export function login' },
      { path: 'README.md', added: 4, deleted: 1 },
    ],
    commits: [
      {
        subject: 'Add the login form',
        files: [{ path: 'src/login.ts', added: 10, deleted: 0 }],
        diff: '+function login',
      },
      {
        subject: 'Wire the session',
        files: [{ path: 'src/session.ts', added: 8, deleted: 2 }],
        diff: '+export function session',
      },
    ],
  },
  { name: 'wip', status: 'local-only', changedFileCount: 0, ahead: 0, behind: 0 },
  { name: 'origin/release', status: 'remote-only', changedFileCount: 0, ahead: 4, behind: 0 },
  {
    name: 'abandoned',
    status: 'remote-deleted',
    changedFileCount: 1,
    ahead: 2,
    behind: 0,
    files: [{ path: 'assets/logo.png', added: null, deleted: null }],
  },
  {
    name: 'rename-docs',
    status: 'local-and-remote',
    changedFileCount: 1,
    ahead: 1,
    behind: 0,
    files: [{ path: 'docs/guide.md', previousPath: 'docs/old-guide.md', added: 4, deleted: 1 }],
  },
];

const branchesByRepository: Record<string, SampleBranch[]> = {
  Harbor: harborBranches,
};

@Component({
  selector: 'gm-workspace',
  standalone: true,
  imports: [NgTemplateOutlet, TerminalPane, ShellPane],
  styles: [
    `
      .start-screen {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }

      .switching-overlay {
        position: fixed;
        inset: 0;
        z-index: 2;
        background: white;
      }

      aside {
        position: relative;
        z-index: 1;
        width: 18rem;
      }

      .content-sheet {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        left: 18rem;
        overflow: auto;
      }

      [data-status='local-only'] {
        background-color: lightblue;
      }

      [data-status='local-and-remote'] {
        background-color: green;
      }

      [data-status='remote-only'] {
        background-color: yellow;
      }

      [data-status='remote-deleted'] {
        background-color: red;
      }

      .branch-actions {
        display: none;
      }

      .branch-row:hover > .branch-actions,
      .branch-actions.is-open {
        display: block;
      }

      .commit-detail {
        position: relative;
        min-height: 12rem;
      }

      .commit-files {
        position: absolute;
        top: 0;
        left: 0;
        width: 240px;
      }

      .commit-diff {
        position: absolute;
        top: 0;
        left: 256px;
      }

      .terminal-pane {
        background-color: #1e1e1e;
        min-height: 12rem;
      }
    `,
  ],
  template: `
    <ng-template #repositoryCard>
      <section data-testid="repository-card">
        <button type="button" data-testid="repository" data-name="Harbor" (click)="choose('Harbor')">
          Harbor
        </button>
        <button type="button" data-testid="repository" data-name="Atlas" (click)="choose('Atlas')">
          Atlas
        </button>
      </section>
    </ng-template>

    @if (repositoryPath() === null && selectedName() === null) {
      <div class="start-screen">
        <ng-container [ngTemplateOutlet]="repositoryCard" />
      </div>
    } @else {
      <main data-testid="workspace">
        <aside>
          <h1 data-testid="repository-name">{{ workspaceTitle() }}</h1>
          @if (repositoryPath() === null) {
            <button type="button" data-testid="switch-repository" (click)="openSwitch()">Switch</button>
          }
          <ul data-testid="branch-list">
            @for (branch of branches(); track branch.name) {
              <li
                class="branch-row"
                data-testid="branch-row"
                [attr.data-branch]="branch.name"
                [attr.data-status]="branch.status"
                (click)="selectBranch(branch.name)"
              >
                <button type="button" (click)="selectBranch(branch.name, $event)">{{ branch.name }}</button>
                <span
                  data-testid="changed-file-count"
                  [attr.aria-label]="branch.changedFileCount + ' changed files'"
                >
                  {{ branch.changedFileCount }}
                </span>
                <span data-testid="ahead" [attr.aria-label]="branch.ahead + ' commits ahead'">
                  {{ branch.ahead }}
                </span>
                <span data-testid="behind" [attr.aria-label]="branch.behind + ' commits behind'">
                  {{ branch.behind }}
                </span>
                @if (terminalCount(branch.name) > 0) {
                  <span
                    data-testid="terminal-count"
                    [attr.aria-label]="terminalCount(branch.name) + ' terminals'"
                  >
                    {{ terminalCount(branch.name) }}
                  </span>
                }
                <button
                  type="button"
                  data-testid="branch-menu"
                  [attr.aria-label]="'Branch actions for ' + branch.name"
                  (click)="openBranchMenu(branch.name, $event)"
                >
                  Branch actions
                </button>
                <div
                  data-testid="hover-menu"
                  class="branch-actions"
                  [class.is-open]="openBranch() === branch.name"
                >
                    <fieldset>
                      <legend>Merge</legend>
                      <button
                        type="button"
                        data-testid="update-from-master"
                        (click)="updateBranch(branch.name, $event)"
                      >
                        Update from master
                      </button>
                      <button
                        type="button"
                        data-testid="merge-into-master"
                        (click)="mergeBranch(branch.name, $event)"
                      >
                        Merge into master
                      </button>
                      <label>
                        Squash
                        <input data-testid="squash" type="checkbox" />
                      </label>
                    </fieldset>
                    <button
                      type="button"
                      data-testid="remove-worktree"
                      (click)="removeBranch(branch.name, $event)"
                    >
                      Remove worktree
                    </button>
                </div>
              </li>
            }
          </ul>
          <input data-testid="create-branch" (input)="setCreateBranchName($event)" />
          <button type="button" data-testid="create-worktree" (click)="createBranch()">Create</button>
          @if (workspaceError(); as message) {
            <p data-testid="workspace-error">{{ message }}</p>
          }
        </aside>
        <section class="content-sheet" data-testid="content-sheet">
          @if (selectedBranch(); as branch) {
            <ul data-testid="changed-files">
              @for (file of visibleFiles(); track file.path) {
                <li
                  data-testid="changed-file"
                  [attr.data-path]="file.path"
                  [attr.data-previous-path]="file.previousPath ?? null"
                  (click)="selectFile(file.path)"
                >
                  <button type="button" (click)="selectFile(file.path)">{{ file.path }}</button>
                  @if (file.added !== null) {
                    <span data-testid="lines-added">{{ file.added }}</span>
                  }
                  @if (file.deleted !== null) {
                    <span data-testid="lines-deleted">{{ file.deleted }}</span>
                  }
                </li>
              }
            </ul>
            <ul data-testid="branch-commits">
              @for (commit of visibleCommits(); track commit.subject) {
                <li data-testid="commit" [attr.data-subject]="commit.subject" (click)="selectCommit(commit.subject)">
                  <button type="button" (click)="selectCommit(commit.subject)">{{ commit.subject }}</button>
                </li>
              }
            </ul>
            @if (showingCommit()) {
              <div class="commit-detail">
                <ul class="commit-files" data-testid="commit-files">
                  @for (file of visibleCommitFiles(); track file.path) {
                    <li
                      data-testid="changed-file"
                      [attr.data-path]="file.path"
                      [attr.data-previous-path]="file.previousPath ?? null"
                      (click)="selectCommitFile(file.path, $event)"
                    >
                      {{ file.path }}
                      @if (file.added !== null) {
                        <span data-testid="lines-added">{{ file.added }}</span>
                      }
                      @if (file.deleted !== null) {
                        <span data-testid="lines-deleted">{{ file.deleted }}</span>
                      }
                    </li>
                  }
                </ul>
                <pre class="commit-diff" data-testid="diff">{{ visibleCommitDiff() }}</pre>
              </div>
            } @else if (selectedDiff(); as diff) {
              <pre data-testid="diff">{{ diff }}</pre>
            }
            @if (platform() === 'win32' && shellRunning() && worktreePath()) {
              <div
                class="terminal-pane"
                data-testid="terminal-pane"
                [gmShell]="worktreePath()"
                (shellEnded)="onShellEnded()"
                style="background-color: #1e1e1e"
              ></div>
            } @else if (sessions().length > 0) {
              <div class="terminal-chrome">
                <div role="tablist">
                  @for (session of sessions(); track session) {
                    <button type="button" role="tab" (click)="focusSession(session)">{{ session }}</button>
                  }
                </div>
                <button type="button" (click)="splitSession()">Split</button>
                <button type="button" (click)="newSession()">New</button>
                <button type="button" (click)="killSession()">Kill</button>
              </div>
              @for (session of visibleSessions(); track session) {
                <div
                  class="terminal-pane"
                  data-testid="terminal-pane"
                  [gmTerminal]="session"
                  (sessionEnded)="onSessionEnded(session)"
                  style="background-color: #1e1e1e"
                ></div>
              }
            }
          }
        </section>
      </main>
      @if (overlayOpen()) {
        <div class="start-screen switching-overlay" data-testid="switching-overlay">
          <ng-container [ngTemplateOutlet]="repositoryCard" />
        </div>
      }
    }
  `,
})
export class WorkspaceComponent implements OnInit {
  private readonly zone = inject(NgZone);
  readonly repositoryPath = input<string | null>(null);
  readonly platform = input(hostPlatform());
  readonly selectedName = signal<string | null>(null);
  readonly overlayOpen = signal(false);
  readonly openBranch = signal<string | null>(null);
  readonly selectedBranchName = signal<string | null>(null);
  readonly selectedFilePath = signal<string | null>(null);
  readonly selectedCommitSubject = signal<string | null>(null);
  readonly realBranches = signal<SampleBranch[]>([]);
  readonly loadedFiles = signal<ChangedFile[]>([]);
  readonly loadedCommits = signal<BranchCommit[]>([]);
  readonly loadedCommitFiles = signal<ChangedFile[]>([]);
  readonly loadedDiff = signal<string | null>(null);
  readonly createBranchName = signal('');
  readonly workspaceError = signal<string | null>(null);
  readonly worktreePath = signal('');
  readonly sessions = signal<string[]>([]);
  readonly focused = signal('');
  readonly splitView = signal(false);
  readonly shellRunning = signal(false);
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
  readonly workspaceTitle = computed(() => {
    const path = this.repositoryPath();
    if (path === null) {
      return this.selectedName();
    }
    return findRepository(path)?.displayName ?? basename(path);
  });
  readonly branches = computed(() => {
    if (this.repositoryPath() !== null) {
      return this.realBranches();
    }
    return branchesByRepository[this.selectedName() ?? ''] ?? [];
  });
  readonly selectedBranch = computed(
    () => this.branches().find((branch) => branch.name === this.selectedBranchName()) ?? null,
  );
  readonly selectedDiff = computed(() => {
    if (this.repositoryPath() !== null) {
      return this.loadedDiff();
    }
    const file = this.selectedBranch()?.files?.find((item) => item.path === this.selectedFilePath());
    return file?.diff ?? null;
  });
  readonly selectedCommit = computed(
    () => this.selectedBranch()?.commits?.find((commit) => commit.subject === this.selectedCommitSubject()) ?? null,
  );
  readonly visibleFiles = computed(() => {
    if (this.repositoryPath() !== null) {
      return this.loadedFiles();
    }
    return this.selectedBranch()?.files ?? [];
  });
  readonly visibleCommits = computed(() => {
    if (this.repositoryPath() !== null) {
      return this.loadedCommits();
    }
    return this.selectedBranch()?.commits ?? [];
  });
  readonly showingCommit = computed(() => {
    if (this.selectedCommitSubject() === null) {
      return false;
    }
    if (this.repositoryPath() !== null) {
      return true;
    }
    return this.selectedCommit() !== null;
  });
  readonly visibleCommitFiles = computed(() => {
    if (this.repositoryPath() !== null) {
      return this.loadedCommitFiles();
    }
    return this.selectedCommit()?.files ?? [];
  });
  readonly visibleCommitDiff = computed(() => {
    if (this.repositoryPath() !== null) {
      return this.loadedDiff() ?? '';
    }
    return this.selectedCommit()?.diff ?? '';
  });

  ngOnInit(): void {
    this.refreshBranches();
  }

  choose(name: string): void {
    this.selectedName.set(name);
    this.overlayOpen.set(false);
    this.openBranch.set(null);
    this.selectedBranchName.set(null);
    this.selectedFilePath.set(null);
    this.selectedCommitSubject.set(null);
  }

  selectFile(path: string): void {
    this.selectedFilePath.set(path);
    this.selectedCommitSubject.set(null);
    const repo = this.repositoryPath();
    const branch = this.selectedBranchName();
    if (!repo || !branch) {
      return;
    }
    this.loadedDiff.set(readWorkingTreeDiff(repo, branch, path));
  }

  selectCommit(subject: string): void {
    this.selectedCommitSubject.set(subject);
    this.selectedFilePath.set(null);
    const repo = this.repositoryPath();
    if (!repo) {
      return;
    }
    const commit = this.loadedCommits().find((item) => item.subject === subject);
    if (!commit) {
      this.loadedCommitFiles.set([]);
      this.loadedDiff.set(null);
      return;
    }
    const files = readCommitFiles(repo, commit.sha);
    this.loadedCommitFiles.set(files);
    const first = files[0];
    this.loadedDiff.set(first ? readCommitFileDiff(repo, commit.sha, first.path) : '');
  }

  selectCommitFile(path: string, event: Event): void {
    event.stopPropagation();
    const repo = this.repositoryPath();
    const subject = this.selectedCommitSubject();
    if (!repo || !subject) {
      return;
    }
    const commit = this.loadedCommits().find((item) => item.subject === subject);
    if (!commit) {
      return;
    }
    this.loadedDiff.set(readCommitFileDiff(repo, commit.sha, path));
  }

  openBranchMenu(name: string, event: Event): void {
    event.stopPropagation();
    this.openBranch.set(name);
  }

  selectBranch(name: string, event?: Event): void {
    event?.stopPropagation();
    this.selectedBranchName.set(name);
    this.selectedFilePath.set(null);
    this.selectedCommitSubject.set(null);
    this.loadedDiff.set(null);
    this.loadedCommitFiles.set([]);
    const path = this.repositoryPath();
    if (path === null) {
      this.loadedFiles.set([]);
      this.loadedCommits.set([]);
      return;
    }
    this.loadedFiles.set(readChangedFiles(path, name));
    this.loadedCommits.set(readCommitsOnlyOnBranch(path, name));
    this.openTerminals(name);
  }

  terminalCount(name: string): number {
    if (this.platform() === 'win32') {
      return name === this.selectedBranchName() && this.shellRunning() ? 1 : 0;
    }
    const repo = this.repositoryPath();
    if (!repo) {
      return 0;
    }
    return sessionsForBranch(repo, name).length;
  }

  focusSession(session: string): void {
    if (this.sessions().includes(session)) {
      this.focused.set(session);
    }
  }

  newSession(): void {
    const repo = this.repositoryPath();
    const branch = this.selectedBranchName();
    const cwd = this.worktreePath();
    if (!repo || !branch || !cwd || this.platform() === 'win32') {
      return;
    }
    const index = nextSessionIndex(repo, branch, this.sessions());
    const name = createBranchSession(repo, branch, cwd, index);
    this.sessions.update((sessions) => [...sessions, name]);
    this.focused.set(name);
  }

  splitSession(): void {
    const repo = this.repositoryPath();
    const branch = this.selectedBranchName();
    const cwd = this.worktreePath();
    if (!repo || !branch || !cwd || this.platform() === 'win32') {
      return;
    }
    if (this.sessions().length < 2) {
      const index = nextSessionIndex(repo, branch, this.sessions());
      const name = createBranchSession(repo, branch, cwd, index);
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

  onShellEnded(): void {
    this.shellRunning.set(false);
  }

  onSessionEnded(session: string): void {
    if (!this.sessions().includes(session)) {
      return;
    }
    const remaining = this.sessions().filter((name) => name !== session);
    this.sessions.set(remaining);
    if (remaining.length < 2) {
      this.splitView.set(false);
    }
    if (this.focused() === session) {
      this.focused.set(remaining[0] ?? '');
    }
  }

  openSwitch(): void {
    this.overlayOpen.set(true);
  }

  updateBranch(name: string, event: Event): void {
    event.stopPropagation();
    this.runBranchAction(name, () => updateFromMaster(this.repositoryPath() ?? '', name, squashChecked(event)));
  }

  mergeBranch(name: string, event: Event): void {
    event.stopPropagation();
    this.runBranchAction(name, () => mergeIntoMaster(this.repositoryPath() ?? '', name, squashChecked(event)));
  }

  removeBranch(name: string, event: Event): void {
    event.stopPropagation();
    this.runBranchAction(name, () => {
      removeWorktree(this.repositoryPath() ?? '', name);
      if (this.openBranch() === name) {
        this.openBranch.set(null);
      }
    });
  }

  setCreateBranchName(event: Event): void {
    const target = event.target as { value?: string } | null;
    this.createBranchName.set(target?.value ?? '');
  }

  async createBranch(): Promise<void> {
    const repo = this.repositoryPath();
    if (!repo) {
      return;
    }
    this.workspaceError.set(null);
    try {
      await createWorktree(repo, this.createBranchName());
      this.zone.run(() => {
        this.refreshBranches();
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.zone.run(() => {
        this.workspaceError.set(message);
      });
    }
  }

  private runBranchAction(name: string, action: () => void): void {
    if (!this.repositoryPath()) {
      return;
    }
    this.workspaceError.set(null);
    try {
      action();
      this.refreshAfterBranchChange(name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.workspaceError.set(message);
    }
  }

  private refreshAfterBranchChange(name: string): void {
    this.refreshBranches();
    if (this.selectedBranchName() === name) {
      this.selectBranch(name);
    }
  }

  private openTerminals(branch: string): void {
    const repo = this.repositoryPath();
    if (!repo) {
      this.clearTerminals();
      return;
    }
    const cwd = findCheckout(repo, branch);
    if (!cwd) {
      this.clearTerminals();
      return;
    }
    this.worktreePath.set(cwd);
    this.splitView.set(false);
    if (this.platform() === 'win32') {
      this.sessions.set([]);
      this.focused.set('');
      this.shellRunning.set(true);
      return;
    }
    this.shellRunning.set(false);
    const existing = sessionsForBranch(repo, branch);
    if (existing.length === 0) {
      const name = createBranchSession(repo, branch, cwd, 1);
      this.sessions.set([name]);
      this.focused.set(name);
      return;
    }
    if (existing.join('\n') !== this.sessions().join('\n')) {
      this.sessions.set(existing);
    }
    if (!existing.includes(this.focused())) {
      this.focused.set(existing[0] ?? '');
    }
  }

  private clearTerminals(): void {
    this.worktreePath.set('');
    this.sessions.set([]);
    this.focused.set('');
    this.splitView.set(false);
    this.shellRunning.set(false);
  }

  private refreshBranches(): void {
    const path = this.repositoryPath();
    if (path === null) {
      return;
    }
    this.realBranches.set(
      listBranches(path).map((branch) => ({
        name: branch.name,
        status: branch.status,
        changedFileCount: branch.changedFileCount,
        ahead: branch.ahead,
        behind: branch.behind,
      })),
    );
  }
}

function hostPlatform(): string {
  if (typeof process !== 'undefined' && typeof process.platform === 'string') {
    return process.platform;
  }
  return 'linux';
}

function squashChecked(event: Event): boolean {
  const current = event.currentTarget as {
    closest?: (selector: string) => { querySelector?: (selector: string) => { checked?: boolean } | null } | null;
  } | null;
  const box = current?.closest?.('[data-testid="hover-menu"]')?.querySelector?.('[data-testid="squash"]');
  return box?.checked === true;
}
