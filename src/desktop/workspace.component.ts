import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, NgZone, OnInit, signal } from '@angular/core';
import { basename } from 'node:path';
import { addRepository, findRepository, listRepositories, type RegisteredRepository } from '../registry.js';
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

interface CardRepository {
  name: string;
  path: string | null;
}

const sampleCard: CardRepository[] = [
  { name: 'Harbor', path: null },
  { name: 'Atlas', path: null },
];

@Component({
  selector: 'gm-workspace',
  standalone: true,
  imports: [NgTemplateOutlet, TerminalPane, ShellPane],
  styles: [
    `
:host {
  --paper: #f7f7f5;
  --surface: #ffffff;
  --forest: #1a3c2b;
  --grid: #3a3a38;
  --coral: #ff8c69;
  --mint: #9effbf;
  --gold: #f4d35e;
  --statusred: #ff5c5c;
  --statusgreen: #3ddc97;
  --statusblue: #8ecae6;
  display: block;
  min-height: 100vh;
  background: var(--forest);
  color: var(--grid);
  font-family: "General Sans", "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.4;
}

h1, h2, h3, p { margin: 0; }

button, input { font: inherit; color: inherit; }

.start-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--forest);
}

.switching-overlay {
  position: fixed;
  inset: 0;
  z-index: 4;
  background: rgba(26, 60, 43, 0.2);
}

[data-testid='repository-card'] {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 22rem;
  padding: 16px;
  background: var(--paper);
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 2px;
}

[data-testid='repository-card'] h2 {
  margin-bottom: 4px;
  color: var(--forest);
  font-family: "Space Grotesk", sans-serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

[data-testid='repository'],
[data-testid='add-repository'] {
  padding: 8px 12px;
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 2px;
  background: var(--paper);
  text-align: left;
  cursor: pointer;
}

[data-testid='repository']:hover,
[data-testid='add-repository']:hover,
[data-testid='create-worktree']:hover,
[data-testid='switch-repository']:hover {
  background: var(--surface);
}

[data-testid='add-repository'] {
  background: var(--forest);
  color: white;
  border-color: var(--forest);
}

[data-testid='repository-card'] label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

[data-testid='repository-card'] input,
.create-row input {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  padding: 0 8px;
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 0;
  background: var(--surface);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
}

aside {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 320px;
  padding: 16px 12px 12px;
  overflow: auto;
  background: var(--forest);
  color: white;
}

.sidebar-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 20px;
  padding: 0 4px;
}

h1 {
  color: white;
  font-family: "Space Grotesk", sans-serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.repo-path {
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.8);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.4;
  word-break: break-all;
}

[data-testid='switch-repository'] {
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 2px;
  background: var(--paper);
  color: var(--grid);
  padding: 4px 8px;
  cursor: pointer;
}

.branch-label {
  display: flex;
  justify-content: space-between;
  margin: 0 4px 8px;
  color: rgba(255, 255, 255, 0.7);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

ul { margin: 0; padding: 0; list-style: none; }

.branch-list,
[data-testid='branch-list'] {
  min-height: 0;
  flex: 1;
}

.branch-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  margin: 0 0 4px;
  padding: 0 8px;
  border-radius: 8px;
  color: white;
}

.branch-row:hover,
.branch-row.is-selected {
  background: var(--surface);
  color: var(--forest);
}

.status-color {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 999px;
}

[data-status='local-only'] .status-color { background-color: #8ecae6; }
[data-status='local-and-remote'] .status-color { background-color: #3ddc97; }
[data-status='remote-only'] .status-color { background-color: #f4d35e; }
[data-status='remote-deleted'] .status-color { background-color: #ff5c5c; }

.branch-name {
  flex: 1;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.branch-row.is-selected .branch-name { font-weight: 500; }

.terminal-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #3ddc97;
  color: var(--forest);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10px;
  line-height: 1;
}

.branch-stats {
  color: inherit;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10px;
  line-height: 1.2;
  text-align: right;
  white-space: nowrap;
}

.branch-stats > span { display: block; }

[data-testid='branch-menu'] {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: none;
  padding: 0;
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 8px;
  background: var(--paper);
  color: var(--grid);
  cursor: pointer;
  opacity: 0;
}

.branch-row:hover > [data-testid='branch-menu'],
.branch-row:focus-within > [data-testid='branch-menu'],
.branch-row.is-selected > [data-testid='branch-menu'] {
  opacity: 1;
}

.branch-actions { display: none; }

.branch-row:hover > .branch-actions,
.branch-actions.is-open {
  display: block;
  position: absolute;
  top: 36px;
  right: 0;
  z-index: 3;
  width: 176px;
  padding: 4px 0;
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 8px;
  background: var(--paper);
  color: var(--grid);
}

.branch-actions fieldset {
  margin: 0;
  padding: 0;
  border: 0;
}

.branch-actions legend {
  padding: 8px 12px 4px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.branch-actions button,
.branch-actions label {
  display: block;
  width: 100%;
  margin: 0;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  color: var(--grid);
  text-align: left;
  cursor: pointer;
}

.branch-actions button:hover,
.branch-actions label:hover { background: var(--surface); }

.branch-actions [data-testid='remove-worktree'] { color: var(--coral); }

.create-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.create-row input {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.create-row input::placeholder { color: rgba(255, 255, 255, 0.55); }

[data-testid='create-worktree'] {
  height: 40px;
  border: 0;
  border-radius: 8px;
  background: var(--paper);
  color: var(--forest);
  cursor: pointer;
}

.create-note {
  margin-top: 8px;
  padding: 0 4px;
  color: rgba(255, 255, 255, 0.7);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10px;
  line-height: 1.4;
}

.content-sheet {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 320px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  overflow: auto;
  background: var(--paper);
  color: var(--grid);
  border-radius: 36px 0 0 36px;
}

.branch-heading {
  padding: 16px 16px 12px;
  border-bottom: 1px solid rgba(58, 58, 56, 0.2);
}

.branch-heading h2 {
  color: var(--forest);
  font-family: "Space Grotesk", sans-serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.branch-heading p {
  margin-top: 4px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
}

.empty-sheet {
  padding: 16px;
  color: rgba(58, 58, 56, 0.7);
}

.sheet-columns {
  display: grid;
  grid-template-columns: minmax(16rem, 340px) minmax(16rem, 1fr);
  flex: 1;
  min-height: 0;
}

.sheet-columns > div {
  min-width: 0;
  padding: 12px 16px 24px;
}

.sheet-columns > div + div {
  border-left: 1px solid rgba(58, 58, 56, 0.2);
}

.sheet-columns h3 {
  margin: 12px 0 8px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

[data-testid='changed-file'],
[data-testid='commit'] {
  display: flex;
  gap: 8px;
  align-items: baseline;
  min-height: 36px;
  padding: 6px 4px;
  border-bottom: 1px solid rgba(58, 58, 56, 0.2);
  cursor: pointer;
}

[data-testid='changed-file']:hover,
[data-testid='commit']:hover { background: var(--surface); }

[data-testid='changed-file'] button,
[data-testid='commit'] button {
  padding: 0;
  border: 0;
  background: transparent;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  cursor: pointer;
}

[data-testid='lines-added'] {
  padding: 0 4px;
  border-radius: 2px;
  background: var(--mint);
  color: var(--forest);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
}

[data-testid='lines-deleted'] {
  color: var(--coral);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
}

[data-testid='diff'] {
  margin: 8px 0 0;
  padding: 8px;
  overflow: auto;
  background: transparent;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
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

.terminal-chrome {
  display: flex;
  gap: 4px;
  align-items: center;
  height: 36px;
  margin-top: auto;
  padding: 0 8px;
  background: #252526;
  color: #cccccc;
}

.terminal-chrome button {
  border: 0;
  background: transparent;
  color: #cccccc;
  cursor: pointer;
}

.terminal-pane {
  background-color: #1e1e1e;
  min-height: 12rem;
}

[data-testid='workspace-error'],
[data-testid='card-error'] { color: var(--coral); }
    `,
  ],
  template: `
    <ng-template #repositoryCard>
      <section data-testid="repository-card">
        <h2>Repositories</h2>
        @for (repository of cardRepositories(); track repository.name + (repository.path ?? '')) {
          <button
            type="button"
            data-testid="repository"
            [attr.data-name]="repository.name"
            (click)="choose(repository.name)"
          >
            {{ repository.name }}
          </button>
        }
        @if (registryMode()) {
          <label>
            Path
            <input data-testid="add-repository-path" [value]="addPath()" (input)="setAddPath($event)" />
          </label>
          <label>
            Name
            <input data-testid="add-repository-name" [value]="addName()" (input)="setAddName($event)" />
          </label>
          <button type="button" data-testid="add-repository" (click)="addRegistered()">Add repository</button>
          @if (cardError(); as message) {
            <p data-testid="card-error">{{ message }}</p>
          }
        }
      </section>
    </ng-template>

    @if (repositoryPath() === null && selectedName() === null) {
      <div class="start-screen">
        <ng-container [ngTemplateOutlet]="repositoryCard" />
      </div>
    } @else {
      <main data-testid="workspace">
        <aside>
          <div class="sidebar-head">
            <div>
              <h1 data-testid="repository-name">{{ workspaceTitle() }}</h1>
              @if (effectivePath(); as path) {
                <p class="repo-path">{{ path }}</p>
              }
            </div>
            @if (repositoryPath() === null) {
              <button type="button" data-testid="switch-repository" (click)="openSwitch()">Change</button>
            }
          </div>
          <p class="branch-label"><span>Branches</span></p>
          <ul data-testid="branch-list">
            @for (branch of branches(); track branch.name) {
              <li
                class="branch-row"
                data-testid="branch-row"
                [class.is-selected]="selectedBranchName() === branch.name"
                [attr.data-branch]="branch.name"
                [attr.data-status]="branch.status"
                (click)="selectBranch(branch.name)"
              >
                <span class="status-color" data-testid="status-color" [attr.title]="statusLabel(branch.status)"></span>
                <button type="button" class="branch-name" (click)="selectBranch(branch.name, $event)">
                  {{ branch.name }}
                </button>
                @if (terminalCount(branch.name) > 0) {
                  <span
                    class="terminal-count"
                    data-testid="terminal-count"
                    [attr.aria-label]="terminalCount(branch.name) + ' terminals'"
                  >
                    {{ terminalCount(branch.name) }}
                  </span>
                }
                <span class="branch-stats">
                  <span>
                    <span
                      data-testid="changed-file-count"
                      [attr.aria-label]="branch.changedFileCount + ' changed files'"
                    >{{ branch.changedFileCount }}</span>
                    {{ branch.changedFileCount === 1 ? 'file' : 'files' }}
                  </span>
                  <span>
                    ↑<span data-testid="ahead" [attr.aria-label]="branch.ahead + ' commits ahead'">{{ branch.ahead }}</span>
                    ↓<span data-testid="behind" [attr.aria-label]="branch.behind + ' commits behind'">{{ branch.behind }}</span>
                  </span>
                </span>
                <button
                  type="button"
                  data-testid="branch-menu"
                  [attr.aria-label]="'Branch actions for ' + branch.name"
                  (click)="openBranchMenu(branch.name, $event)"
                >
                  ···
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
          <div class="create-row">
            <input
              data-testid="create-branch"
              placeholder="Branch name"
              [value]="createBranchName()"
              (input)="setCreateBranchName($event)"
            />
            <button type="button" data-testid="create-worktree" (click)="createBranch()">Create worktree</button>
          </div>
          <p class="create-note">A remote-only branch is fetched first. Pre-create hooks run before the worktree is added. Post-create hooks run after checkout.</p>
          @if (workspaceError(); as message) {
            <p data-testid="workspace-error">{{ message }}</p>
          }
        </aside>
        <section class="content-sheet" data-testid="content-sheet">
          @if (selectedBranch(); as branch) {
            <header class="branch-heading">
              <h2>{{ branch.name }}</h2>
              <p>
                {{ visibleCommits().length }} commits only on this branch · {{ visibleFiles().length }} changed files
              </p>
            </header>
            <div class="sheet-columns">
            <div>
            <h3>Changes</h3>
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
            @if (!showingCommit()) {
              @if (selectedDiff(); as diff) {
                <pre data-testid="diff">{{ diff }}</pre>
              }
            }
            </div>
            <div>
            <h3>Commits only on this branch</h3>
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
            }
            </div>
            </div>
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
          } @else {
            <p class="empty-sheet">Select a branch</p>
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
  readonly liveRegistry = input(false);
  readonly platform = input(hostPlatform());
  readonly selectedName = signal<string | null>(null);
  readonly openedPath = signal<string | null>(null);
  readonly registered = signal<RegisteredRepository[]>([]);
  readonly addPath = signal('');
  readonly addName = signal('');
  readonly cardError = signal<string | null>(null);
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
  readonly registryMode = computed(() => this.liveRegistry() || windowReadsRegistry());
  readonly effectivePath = computed(() => this.repositoryPath() ?? this.openedPath());
  readonly cardRepositories = computed((): CardRepository[] => {
    if (!this.registryMode()) {
      return sampleCard;
    }
    return this.registered().map((repository) => ({
      name: repository.displayName,
      path: repository.path,
    }));
  });
  readonly workspaceTitle = computed(() => {
    const path = this.effectivePath();
    if (path === null) {
      return this.selectedName();
    }
    return findRepository(path)?.displayName ?? basename(path);
  });
  readonly branches = computed(() => {
    if (this.effectivePath() !== null) {
      return this.realBranches();
    }
    return branchesByRepository[this.selectedName() ?? ''] ?? [];
  });
  readonly selectedBranch = computed(
    () => this.branches().find((branch) => branch.name === this.selectedBranchName()) ?? null,
  );
  readonly selectedDiff = computed(() => {
    if (this.effectivePath() !== null) {
      return this.loadedDiff();
    }
    const file = this.selectedBranch()?.files?.find((item) => item.path === this.selectedFilePath());
    return file?.diff ?? null;
  });
  readonly selectedCommit = computed(
    () => this.selectedBranch()?.commits?.find((commit) => commit.subject === this.selectedCommitSubject()) ?? null,
  );
  readonly visibleFiles = computed(() => {
    if (this.effectivePath() !== null) {
      return this.loadedFiles();
    }
    return this.selectedBranch()?.files ?? [];
  });
  readonly visibleCommits = computed(() => {
    if (this.effectivePath() !== null) {
      return this.loadedCommits();
    }
    return this.selectedBranch()?.commits ?? [];
  });
  readonly showingCommit = computed(() => {
    if (this.selectedCommitSubject() === null) {
      return false;
    }
    if (this.effectivePath() !== null) {
      return true;
    }
    return this.selectedCommit() !== null;
  });
  readonly visibleCommitFiles = computed(() => {
    if (this.effectivePath() !== null) {
      return this.loadedCommitFiles();
    }
    return this.selectedCommit()?.files ?? [];
  });
  readonly visibleCommitDiff = computed(() => {
    if (this.effectivePath() !== null) {
      return this.loadedDiff() ?? '';
    }
    return this.selectedCommit()?.diff ?? '';
  });

  statusLabel(status: BranchStatus): string {
    switch (status) {
      case 'local-only':
        return 'Local only';
      case 'local-and-remote':
        return 'Local and remote';
      case 'remote-only':
        return 'Remote only';
      case 'remote-deleted':
        return 'Remote deleted';
    }
  }

  ngOnInit(): void {
    if (this.registryMode()) {
      this.registered.set(listRepositories());
    }
    this.refreshBranches();
  }

  choose(name: string): void {
    const entry = this.cardRepositories().find((repository) => repository.name === name);
    this.selectedName.set(name);
    this.openedPath.set(entry?.path ?? null);
    this.overlayOpen.set(false);
    this.openBranch.set(null);
    this.selectedBranchName.set(null);
    this.selectedFilePath.set(null);
    this.selectedCommitSubject.set(null);
    this.loadedFiles.set([]);
    this.loadedCommits.set([]);
    this.loadedDiff.set(null);
    this.clearTerminals();
    this.refreshBranches();
  }

  setAddPath(event: Event): void {
    this.addPath.set(inputValue(event));
  }

  setAddName(event: Event): void {
    this.addName.set(inputValue(event));
  }

  addRegistered(): void {
    this.cardError.set(null);
    try {
      addRepository(this.addPath(), this.addName());
      this.addPath.set('');
      this.addName.set('');
      this.registered.set(listRepositories());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.cardError.set(message);
    }
  }

  selectFile(path: string): void {
    this.selectedFilePath.set(path);
    this.selectedCommitSubject.set(null);
    const repo = this.effectivePath();
    const branch = this.selectedBranchName();
    if (!repo || !branch) {
      return;
    }
    this.loadedDiff.set(readWorkingTreeDiff(repo, branch, path));
  }

  selectCommit(subject: string): void {
    this.selectedCommitSubject.set(subject);
    this.selectedFilePath.set(null);
    const repo = this.effectivePath();
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
    const repo = this.effectivePath();
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
    const path = this.effectivePath();
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
    const repo = this.effectivePath();
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
    const repo = this.effectivePath();
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
    const repo = this.effectivePath();
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
    this.runBranchAction(name, () => updateFromMaster(this.effectivePath() ?? '', name, squashChecked(event)));
  }

  mergeBranch(name: string, event: Event): void {
    event.stopPropagation();
    this.runBranchAction(name, () => mergeIntoMaster(this.effectivePath() ?? '', name, squashChecked(event)));
  }

  removeBranch(name: string, event: Event): void {
    event.stopPropagation();
    this.runBranchAction(name, () => {
      removeWorktree(this.effectivePath() ?? '', name);
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
    const repo = this.effectivePath();
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
    if (!this.effectivePath()) {
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
    const repo = this.effectivePath();
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
    const path = this.effectivePath();
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

function windowReadsRegistry(): boolean {
  if (typeof location === 'undefined') {
    return false;
  }
  return new URLSearchParams(location.search).get('live') === '1';
}

function inputValue(event: Event): string {
  const target = event.target as { value?: string } | null;
  return target?.value ?? '';
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
