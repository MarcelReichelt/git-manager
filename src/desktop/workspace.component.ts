import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, HostListener, inject, input, NgZone, OnInit, signal } from '@angular/core';
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { addRemote, removeRemote, repositoryRemotes, setRemoteUrl, type RepositoryRemote } from '../remotes.js';
import { addRepository, findRepository, listRepositories, type RegisteredRepository } from '../registry.js';
import { mergeIntoMaster, updateFromMaster } from '../merge.js';
import { createWorktree, findCheckout, removeWorktree } from '../worktrees.js';
import { copyText } from './copy-text';
import { browseForFolder } from './folder-browser';
import { requestWindowAction, type WindowAction } from './window-chrome';
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
  listRemoteBranchesWithoutWorktree,
  pinDefaultBranch,
  readChangedFiles,
  readCommitFileDiff,
  readCommitFiles,
  readCommitsOnlyOnBranch,
  readDefaultBranch,
  readRecentCommits,
  recentCommitPageSize,
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
  sha?: string;
  subject: string;
  files?: SampleFile[];
  diff?: string;
  onDefaultBranch?: boolean;
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

interface SampleBranchList {
  defaultBranch?: string;
  branches: SampleBranch[];
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
      {
        subject: 'Open the harbor',
        onDefaultBranch: true,
        files: [{ path: 'README.md', added: 1, deleted: 0 }],
        diff: '+# harbor',
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

const atlasBranches: SampleBranch[] = [
  {
    name: 'feature/login',
    status: 'local-only',
    changedFileCount: 0,
    ahead: 0,
    behind: 0,
    commits: [
      { subject: 'Sketch the login' },
      { subject: 'Open the atlas', onDefaultBranch: true },
    ],
  },
  {
    name: 'main',
    status: 'local-and-remote',
    changedFileCount: 0,
    ahead: 0,
    behind: 0,
    commits: [{ subject: 'Open the atlas' }, { subject: 'Chart the coast' }],
  },
  { name: 'wip', status: 'local-only', changedFileCount: 0, ahead: 0, behind: 0 },
];

const branchesByRepository: Record<string, SampleBranchList> = {
  Harbor: { branches: harborBranches },
  Atlas: { defaultBranch: 'main', branches: atlasBranches },
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
  styleUrl: './workspace-rail.css',
  styles: [
    `
:host {
  --paper: #f7f7f5;
  --surface: #ffffff;
  --forest: #1a3c2b;
  --grid: #3a3a38;
  --coral: #ff8c69;
  display: block;
  min-height: 100vh;
  overflow: hidden;
  background: #1a3c2b;
  border-radius: 8px;
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

.card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.card-heading h2 {
  margin: 0;
}

.card-heading [data-testid='add-repository'] {
  width: 28px;
  height: 28px;
  padding: 0;
  text-align: center;
  font-size: 18px;
  line-height: 1;
}

[data-testid='repositories-empty'] {
  margin: 0;
  color: var(--ink);
}

[data-testid='repository'],
[data-testid='add-repository'],
[data-testid='close-repository-switcher'] {
  padding: 8px 12px;
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 2px;
  background: var(--paper);
  text-align: left;
  cursor: pointer;
}

[data-testid='repository']:hover,
[data-testid='add-repository']:hover,
[data-testid='close-repository-switcher']:hover {
  background: var(--surface);
}

[data-testid='add-repository'] {
  background: var(--forest);
  color: white;
  border-color: var(--forest);
}

[data-testid='add-repository-dialog'] {
  position: fixed;
  inset: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26, 60, 43, 0.45);
}

[data-testid='add-repository-dialog'] .dialog-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 22rem;
  padding: 16px;
  background: var(--paper);
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 8px;
  color: var(--grid);
}

[data-testid='add-repository-dialog'] h2 {
  margin-bottom: 4px;
  color: var(--forest);
  font-family: "Space Grotesk", sans-serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

[data-testid='add-repository-dialog'] label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

[data-testid='add-repository-dialog'] input,
[data-testid='browse-repository-folder'],
[data-testid='confirm-add-repository'],
[data-testid='cancel-add-repository'] {
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 2px;
  background: var(--paper);
  text-align: left;
  cursor: pointer;
}

[data-testid='add-repository-dialog'] input {
  width: 100%;
  height: 36px;
  padding: 0 8px;
  border-radius: 0;
  background: var(--surface);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  cursor: text;
}

[data-testid='confirm-add-repository'] {
  background: var(--forest);
  color: white;
  border-color: var(--forest);
}

[data-testid='add-repository-path'] {
  margin: 0;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  word-break: break-all;
}

[data-testid='create-worktree-dialog'] {
  position: fixed;
  inset: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26, 60, 43, 0.45);
}

[data-testid='create-worktree-dialog'] .dialog-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 22rem;
  padding: 16px;
  background: var(--paper);
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 8px;
  color: var(--grid);
}

[data-testid='create-worktree-dialog'] h2 {
  margin-bottom: 4px;
  color: var(--forest);
  font-family: "Space Grotesk", sans-serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

[data-testid='create-worktree-dialog'] label,
[data-testid='existing-branches-heading'] {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  color: var(--grid);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.existing-branches {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

[data-testid='create-worktree-dialog'] input,
[data-testid='confirm-create-worktree'],
[data-testid='cancel-create-worktree'] {
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 2px;
  background: var(--paper);
  text-align: left;
  cursor: pointer;
}

[data-testid='create-worktree-dialog'] input {
  width: 100%;
  height: 36px;
  padding: 0 8px;
  border-radius: 0;
  background: var(--surface);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  cursor: text;
}

[data-testid='confirm-create-worktree'] {
  background: var(--forest);
  color: white;
  border-color: var(--forest);
}

[data-testid='create-worktree-note'] {
  margin: 0;
  color: var(--grid);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.4;
}

[data-testid='create-branch-options'] {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 9rem;
  overflow: auto;
  border: 1px solid rgba(58, 58, 56, 0.2);
  background: var(--surface);
}

[data-testid='create-branch-option'] {
  padding: 6px 8px;
  color: var(--grid);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
  cursor: pointer;
}

[data-testid='create-worktree-dialog'] [data-testid='workspace-error'],
[data-testid='merge-into-master-dialog'] [data-testid='workspace-error'],
[data-testid='repository-settings-dialog'] [data-testid='settings-error'] {
  color: var(--coral);
}

[data-testid='merge-into-master-dialog'] {
  position: fixed;
  inset: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26, 60, 43, 0.45);
}

[data-testid='merge-into-master-dialog'] .dialog-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 22rem;
  padding: 16px;
  background-color: var(--paper);
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 8px;
  color: var(--grid);
}

[data-testid='merge-into-master-dialog'] h2 {
  margin-bottom: 4px;
  color: var(--forest);
  font-family: "Space Grotesk", sans-serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

[data-testid='merge-into-master-dialog'] label {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
}

[data-testid='confirm-merge-into-master'],
[data-testid='cancel-merge-into-master'] {
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 2px;
  background: var(--paper);
  text-align: left;
  cursor: pointer;
}

[data-testid='confirm-merge-into-master'] {
  background: var(--forest);
  color: white;
  border-color: var(--forest);
}

[data-testid='repository-settings-dialog'] {
  position: fixed;
  inset: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26, 60, 43, 0.45);
}

[data-testid='repository-settings-dialog'] .dialog-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 22rem;
  padding: 16px;
  background-color: var(--paper);
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 8px;
  color: var(--grid);
}

[data-testid='repository-settings-dialog'] h2 {
  margin-bottom: 4px;
  color: var(--forest);
  font-family: "Space Grotesk", sans-serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

[data-testid='repository-settings-dialog'] label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

[data-testid='repository-location'],
[data-testid='remote-name'],
[data-testid='remote-url'] {
  margin: 0;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
  word-break: break-all;
}

[data-testid='remote-list'] {
  margin: 0;
  padding: 0;
  list-style: none;
}

[data-testid='remote-row'] {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

[data-testid='repository-settings-dialog'] input,
[data-testid='confirm-add-remote'],
[data-testid='confirm-change-remote'],
[data-testid='remove-remote'],
[data-testid='close-repository-settings'] {
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 2px;
  background: var(--paper);
  text-align: left;
  cursor: pointer;
}

[data-testid='repository-settings-dialog'] input {
  width: 100%;
  height: 36px;
  padding: 0 8px;
  border-radius: 0;
  background: var(--surface);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
  cursor: text;
}

[data-testid='confirm-add-remote'] {
  background: var(--forest);
  color: white;
  border-color: var(--forest);
}

.dialog-actions {
  display: flex;
  gap: 8px;
}

[data-testid='card-error'] { color: var(--coral); }
    `,
  ],
  template: `
    <ng-template #repositoryCard>
      <section data-testid="repository-card">
        <div class="card-heading">
          <h2>Repositories</h2>
          @if (registryMode()) {
            <button type="button" data-testid="add-repository" aria-label="Add repository" (click)="openAddDialog()">+</button>
          }
        </div>
        @if (registryMode() && cardRepositories().length === 0) {
          <p data-testid="repositories-empty">A repository needs to be added.</p>
        }
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
        @if (overlayOpen()) {
          <button type="button" data-testid="close-repository-switcher" (click)="closeSwitch()">Close</button>
        }
      </section>
    </ng-template>

    @if (repositoryPath() === null && selectedName() === null) {
      <div class="start-screen">
        <ng-container [ngTemplateOutlet]="repositoryCard" />
      </div>
    } @else {
      <main data-testid="workspace">
        <header class="window-bar" data-testid="window-bar" (pointerdown)="dragWindow($event)">
          <div class="window-title">
            <h1 data-testid="repository-name" [attr.title]="repositoryLocation()" (click)="copyLocation()">{{ workspaceTitle() }}</h1>
            <button type="button" data-testid="switch-repository" aria-label="Switch repository" (click)="openSwitch()">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path fill="currentColor" d="M1 3.5A1.5 1.5 0 0 1 2.5 2h4A1.5 1.5 0 0 1 8 3.5V5H6.5V3.5h-4v9h4V11H8v1.5A1.5 1.5 0 0 1 6.5 14h-4A1.5 1.5 0 0 1 1 12.5v-9zm7 0A1.5 1.5 0 0 1 9.5 2h4A1.5 1.5 0 0 1 15 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 8 12.5V11h1.5v1.5h4v-9h-4V5H8V3.5z" />
              </svg>
            </button>
            <button type="button" data-testid="repository-settings" aria-label="Repository settings" (click)="openSettings()">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path fill="currentColor" d="M8 1.2a.8.8 0 0 1 .78.6l.22.9a4.8 4.8 0 0 1 1.22.7l.82-.4a.8.8 0 0 1 1.06.3l.5.86a.8.8 0 0 1-.18 1.02l-.7.54a4.9 4.9 0 0 1 0 1.56l.7.54a.8.8 0 0 1 .18 1.02l-.5.86a.8.8 0 0 1-1.06.3l-.82-.4a4.8 4.8 0 0 1-1.22.7l-.22.9a.8.8 0 0 1-.78.6.8.8 0 0 1-.78-.6l-.22-.9a4.8 4.8 0 0 1-1.22-.7l-.82.4a.8.8 0 0 1-1.06-.3l-.5-.86a.8.8 0 0 1 .18-1.02l.7-.54a4.9 4.9 0 0 1 0-1.56l-.7-.54a.8.8 0 0 1-.18-1.02l.5-.86a.8.8 0 0 1 1.06-.3l.82.4a4.8 4.8 0 0 1 1.22-.7l.22-.9A.8.8 0 0 1 8 1.2zm0 4.3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
              </svg>
            </button>
          </div>
          <div class="window-controls">
            <button type="button" data-testid="window-minimize" aria-label="Minimize" (click)="controlWindow('minimize')">–</button>
            <button type="button" data-testid="window-maximize" aria-label="Maximize" (click)="controlWindow('maximize')">□</button>
            <button type="button" data-testid="window-close" aria-label="Close" (click)="controlWindow('close')">×</button>
          </div>
        </header>
        <aside>
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
            <button type="button" data-testid="create-worktree" (click)="openCreateDialog()">Create worktree</button>
          </div>
          @if (workspaceError(); as message) {
            @if (!createDialogOpen() && !mergeDialogBranch()) {
              <p data-testid="workspace-error">{{ message }}</p>
            }
          }
        </aside>
        <section class="content-sheet" data-testid="content-sheet">
          @if (selectedBranch(); as branch) {
            <header class="branch-heading">
              <h2>{{ branch.name }}</h2>
              <p>
                {{ summaryCommitCount() }} commits · {{ visibleFiles().length }} changed files
              </p>
            </header>
            <div class="sheet-columns" [style.grid-template-columns]="sheetColumns()">
            <div class="sheet-stack" [style.grid-template-rows]="changesPaneHeight() + 'px 8px minmax(0, 1fr)'">
            <div data-testid="changes">
            <h3>Changes</h3>
            <ul data-testid="changed-files">
              @for (file of visibleFiles(); track file.path) {
                <li
                  data-testid="changed-file"
                  [class.is-selected]="isSelectedFile(file.path)"
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
            </div>
            <div
              class="splitter"
              role="separator"
              data-testid="commits-split"
              aria-orientation="horizontal"
              tabindex="0"
              (pointerdown)="beginCommitsSplit($event)"
              (pointermove)="moveSplit($event)"
              (pointerup)="endSplit($event)"
            ></div>
            <div data-testid="commits">
            @if (branchIsDefault()) {
              <h3>Commits</h3>
              <ul data-testid="recent-commits" (scroll)="onRecentCommitsScroll($event)">
                @for (commit of visibleRecentCommits(); track commit.sha ?? commit.subject) {
                  <li
                    data-testid="commit"
                    [class.is-selected]="isSelectedCommit(commit)"
                    [attr.data-sha]="commit.sha ?? null"
                    [attr.data-subject]="commit.subject"
                    (click)="selectCommit(commit.subject, commit.sha)"
                  >
                    <button type="button" (click)="selectCommit(commit.subject, commit.sha)">{{ commit.subject }}</button>
                  </li>
                }
              </ul>
            } @else {
              <h3>Commits only on this branch</h3>
              <ul data-testid="branch-commits">
                @for (commit of visibleCommits(); track commit.sha ?? commit.subject) {
                  <li
                    data-testid="commit"
                    [class.is-selected]="isSelectedCommit(commit)"
                    [attr.data-sha]="commit.sha ?? null"
                    [attr.data-subject]="commit.subject"
                    (click)="selectCommit(commit.subject, commit.sha)"
                  >
                    <button type="button" (click)="selectCommit(commit.subject, commit.sha)">{{ commit.subject }}</button>
                  </li>
                }
              </ul>
            }
            </div>
            </div>
            @if (showDetail()) {
            <div
              class="splitter"
              role="separator"
              data-testid="changes-split"
              aria-orientation="vertical"
              tabindex="0"
              (pointerdown)="beginChangesSplit($event)"
              (pointermove)="moveSplit($event)"
              (pointerup)="endSplit($event)"
            ></div>
            @if (showingCommit() && visibleCommitFiles().length > 0) {
              <ul class="commit-files" data-testid="commit-files" [style.width.px]="commitFileWidth()">
                @for (file of visibleCommitFiles(); track file.path) {
                  <li
                    data-testid="changed-file"
                    [class.is-selected]="isSelectedFile(file.path)"
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
              <div
                class="splitter"
                role="separator"
                data-testid="commit-detail-split"
                aria-orientation="vertical"
                tabindex="0"
                (pointerdown)="beginCommitDetailSplit($event)"
                (pointermove)="moveSplit($event)"
                (pointerup)="endSplit($event)"
              ></div>
            }
            @if (diffText()) {
              <pre data-testid="diff">{{ diffText() }}</pre>
            } @else {
              <p data-testid="empty-diff">No diff for this file</p>
            }
            }
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
        <div class="start-screen switching-overlay" data-testid="switching-overlay" (click)="closeSwitchOutside($event)">
          <ng-container [ngTemplateOutlet]="repositoryCard" />
        </div>
      }
    }
    @if (createDialogOpen()) {
      <div data-testid="create-worktree-dialog" role="dialog" aria-label="Create worktree" (click)="dismissCreateFromBackdrop($event)">
        <section class="dialog-panel" (click)="$event.stopPropagation()">
          <h2>Create worktree</h2>
          <label>
            New branch
            <input
              data-testid="create-branch"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="create-branch-options"
              placeholder="New branch name"
              [value]="createBranchName()"
              (input)="setCreateBranchName($event)"
            />
          </label>
          @if (createBranchOptions().length > 0) {
            <div class="existing-branches">
              <h3 id="existing-branches-heading" data-testid="existing-branches-heading">Existing branches</h3>
              <ul
                id="create-branch-options"
                data-testid="create-branch-options"
                role="listbox"
                aria-labelledby="existing-branches-heading"
              >
                @for (name of createBranchOptions(); track name) {
                  <li
                    data-testid="create-branch-option"
                    role="option"
                    [attr.data-branch]="name"
                    (click)="chooseCreateBranch(name)"
                  >{{ name }}</li>
                }
              </ul>
            </div>
          }
          <p data-testid="create-worktree-note">
            A remote-only branch is fetched first. Pre-create hooks run before the worktree is added. Post-create hooks run after checkout.
          </p>
          @if (workspaceError(); as message) {
            <p data-testid="workspace-error">{{ message }}</p>
          }
          <div class="dialog-actions">
            <button type="button" data-testid="confirm-create-worktree" (click)="createBranch()">Create worktree</button>
            <button type="button" data-testid="cancel-create-worktree" (click)="cancelCreate()">Cancel</button>
          </div>
        </section>
      </div>
    }
    @if (mergeDialogBranch()) {
      <div data-testid="merge-into-master-dialog" role="dialog" aria-label="Merge into master" (click)="dismissMergeFromBackdrop($event)">
        <section class="dialog-panel" (click)="$event.stopPropagation()">
          <h2>Merge into master</h2>
          <label>
            Squash
            <input
              data-testid="squash"
              type="checkbox"
              [checked]="mergeSquash()"
              (change)="setMergeSquash($event)"
            />
          </label>
          @if (workspaceError(); as message) {
            <p data-testid="workspace-error">{{ message }}</p>
          }
          <div class="dialog-actions">
            <button type="button" data-testid="confirm-merge-into-master" (click)="confirmMerge()">Merge into master</button>
            <button type="button" data-testid="cancel-merge-into-master" (click)="cancelMerge()">Cancel</button>
          </div>
        </section>
      </div>
    }
    @if (settingsOpen()) {
      <div data-testid="repository-settings-dialog" role="dialog" aria-label="Repository settings" (click)="dismissSettingsFromBackdrop($event)">
        <section class="dialog-panel" (click)="$event.stopPropagation()">
          <h2>Repository settings</h2>
          <label>
            Location
            <p data-testid="repository-location">{{ repositoryLocation() }}</p>
          </label>
          <ul data-testid="remote-list">
            @for (remote of remotes(); track remote.name) {
              <li data-testid="remote-row" [attr.data-name]="remote.name">
                <span data-testid="remote-name">{{ remote.name }}</span>
                <span data-testid="remote-url">{{ remote.url }}</span>
                <input
                  data-testid="remote-url-field"
                  [value]="remoteDraft(remote.name)"
                  (input)="setRemoteDraft(remote.name, $event)"
                />
                <button type="button" data-testid="confirm-change-remote" (click)="confirmChangeRemote(remote.name)">Change URL</button>
                <button type="button" data-testid="remove-remote" (click)="confirmRemoveRemote(remote.name)">Remove</button>
              </li>
            }
          </ul>
          <label>
            Remote name
            <input data-testid="add-remote-name" [value]="addRemoteName()" (input)="setAddRemoteName($event)" />
          </label>
          <label>
            Remote URL
            <input data-testid="add-remote-url" [value]="addRemoteUrl()" (input)="setAddRemoteUrl($event)" />
          </label>
          @if (settingsError(); as message) {
            <p data-testid="settings-error">{{ message }}</p>
          }
          <div class="dialog-actions">
            <button type="button" data-testid="confirm-add-remote" (click)="confirmAddRemote()">Add remote</button>
            <button type="button" data-testid="close-repository-settings" (click)="closeSettings()">Close</button>
          </div>
        </section>
      </div>
    }
    @if (addDialogOpen()) {
      <div data-testid="add-repository-dialog" role="dialog" aria-label="Add repository" (click)="dismissAddFromBackdrop($event)">
        <section class="dialog-panel" (click)="$event.stopPropagation()">
          <h2>Add repository</h2>
          <label>
            Location
            <button type="button" data-testid="browse-repository-folder" (click)="browseFolder()">Choose folder</button>
          </label>
          @if (addPath()) {
            <p data-testid="add-repository-path">{{ addPath() }}</p>
          }
          <label>
            Display name
            <input data-testid="add-repository-name" [value]="addName()" (input)="setAddName($event)" />
          </label>
          @if (cardError(); as message) {
            <p data-testid="card-error">{{ message }}</p>
          }
          <div class="dialog-actions">
            <button type="button" data-testid="confirm-add-repository" (click)="addRegistered()">Add repository</button>
            <button type="button" data-testid="cancel-add-repository" (click)="cancelAdd()">Cancel</button>
          </div>
        </section>
      </div>
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
  readonly addDialogOpen = signal(false);
  readonly addPath = signal('');
  readonly addName = signal('');
  readonly addNameTouched = signal(false);
  readonly cardError = signal<string | null>(null);
  readonly overlayOpen = signal(false);
  readonly openBranch = signal<string | null>(null);
  readonly selectedBranchName = signal<string | null>(null);
  readonly selectedFilePath = signal<string | null>(null);
  readonly selectedCommitSubject = signal<string | null>(null);
  readonly realBranches = signal<SampleBranch[]>([]);
  readonly loadedFiles = signal<ChangedFile[]>([]);
  readonly loadedCommits = signal<BranchCommit[]>([]);
  readonly loadedRecentCommits = signal<BranchCommit[]>([]);
  readonly recentHistoryComplete = signal(false);
  readonly loadedCommitFiles = signal<ChangedFile[]>([]);
  readonly loadedDiff = signal<string | null>(null);
  readonly settingsOpen = signal(false);
  readonly remotes = signal<RepositoryRemote[]>([]);
  readonly addRemoteName = signal('');
  readonly addRemoteUrl = signal('');
  readonly remoteDrafts = signal<Record<string, string>>({});
  readonly settingsError = signal<string | null>(null);
  readonly createDialogOpen = signal(false);
  readonly createBranchName = signal('');
  readonly createBranchOptions = signal<string[]>([]);
  readonly mergeDialogBranch = signal<string | null>(null);
  readonly mergeSquash = signal(false);
  readonly workspaceError = signal<string | null>(null);
  readonly worktreePath = signal('');
  readonly sessions = signal<string[]>([]);
  readonly focused = signal('');
  readonly splitView = signal(false);
  readonly shellRunning = signal(false);
  readonly changesFileWidth = signal(240);
  readonly changesPaneHeight = signal(280);
  readonly commitFileWidth = signal(240);
  private splitDrag: {
    pointerId: number;
    axis: 'x' | 'y';
    start: number;
    origin: number;
    limit: number | undefined;
    apply: (value: number) => void;
  } | null = null;
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
  readonly registryMode = computed(() => this.liveRegistry() || liveQueryFlag());
  readonly effectivePath = computed(() => this.repositoryPath() ?? this.openedPath());
  readonly repositoryLocation = computed(() => this.effectivePath() ?? '');
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
    const sample = branchesByRepository[this.selectedName() ?? ''];
    if (!sample) {
      return [];
    }
    return pinDefaultBranch(sample.branches, sample.defaultBranch);
  });
  readonly selectedBranch = computed(
    () => this.branches().find((branch) => branch.name === this.selectedBranchName()) ?? null,
  );
  readonly defaultBranchName = computed(() => {
    const path = this.effectivePath();
    if (path !== null) {
      return readDefaultBranch(path);
    }
    return branchesByRepository[this.selectedName() ?? '']?.defaultBranch;
  });
  readonly branchIsDefault = computed(() => {
    const name = this.selectedBranchName();
    const base = this.defaultBranchName();
    return name !== null && base !== undefined && name === base;
  });
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
  readonly visibleRecentCommits = computed(() => {
    if (this.effectivePath() !== null) {
      return this.loadedRecentCommits();
    }
    return this.selectedBranch()?.commits ?? [];
  });
  readonly visibleCommits = computed(() => {
    if (this.effectivePath() !== null) {
      return this.loadedCommits();
    }
    return (this.selectedBranch()?.commits ?? []).filter((commit) => !commit.onDefaultBranch);
  });
  readonly summaryCommitCount = computed(() =>
    this.branchIsDefault() ? this.visibleRecentCommits().length : this.visibleCommits().length,
  );
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
    this.loadedRecentCommits.set([]);
    this.recentHistoryComplete.set(true);
    this.loadedDiff.set(null);
    this.clearTerminals();
    this.refreshBranches();
  }

  openAddDialog(): void {
    this.cardError.set(null);
    this.addPath.set('');
    this.addName.set('');
    this.addNameTouched.set(false);
    this.addDialogOpen.set(true);
  }

  setAddName(event: Event): void {
    this.addNameTouched.set(true);
    this.addName.set(inputValue(event));
  }

  async browseFolder(): Promise<void> {
    const chosen = await browseForFolder();
    this.zone.run(() => {
      if (!chosen) {
        return;
      }
      this.addPath.set(chosen);
      if (!this.addNameTouched()) {
        this.addName.set(suggestedRepositoryName(chosen));
      }
    });
  }

  cancelAdd(): void {
    this.cardError.set(null);
    this.addPath.set('');
    this.addName.set('');
    this.addNameTouched.set(false);
    this.addDialogOpen.set(false);
  }

  dismissAddFromBackdrop(event: Event): void {
    if (event.target === event.currentTarget) {
      this.cancelAdd();
    }
  }

  addRegistered(): void {
    this.cardError.set(null);
    if (this.addPath().trim() === '') {
      this.cardError.set('Choose a repository folder');
      return;
    }
    const displayName = this.addName().trim();
    if (displayName === '') {
      this.cardError.set('Enter a display name');
      return;
    }
    try {
      addRepository(this.addPath(), displayName);
      this.addPath.set('');
      this.addName.set('');
      this.addNameTouched.set(false);
      this.addDialogOpen.set(false);
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

  selectCommit(subject: string, sha?: string): void {
    this.selectedCommitSubject.set(sha ?? subject);
    const repo = this.effectivePath();
    if (!repo) {
      this.selectedFilePath.set(this.selectedCommit()?.files?.[0]?.path ?? null);
      return;
    }
    const commit = this.commitByIdentity(subject, sha);
    if (!commit) {
      this.selectedFilePath.set(null);
      this.loadedCommitFiles.set([]);
      this.loadedDiff.set(null);
      return;
    }
    const files = readCommitFiles(repo, commit.sha);
    this.loadedCommitFiles.set(files);
    const first = files[0];
    this.selectedFilePath.set(first?.path ?? null);
    this.loadedDiff.set(first ? readCommitFileDiff(repo, commit.sha, first.path) : '');
  }

  selectCommitFile(path: string, event: Event): void {
    event.stopPropagation();
    this.selectedFilePath.set(path);
    const repo = this.effectivePath();
    const identity = this.selectedCommitSubject();
    if (!repo || !identity) {
      return;
    }
    const commit = this.commitByIdentity(identity, identity);
    if (!commit) {
      return;
    }
    this.loadedDiff.set(readCommitFileDiff(repo, commit.sha, path));
  }

  isSelectedCommit(commit: { sha?: string; subject: string }): boolean {
    const selected = this.selectedCommitSubject();
    return selected !== null && (selected === commit.sha || selected === commit.subject);
  }

  isSelectedFile(path: string): boolean {
    return this.selectedFilePath() === path;
  }

  private commitByIdentity(subject: string, sha?: string): BranchCommit | undefined {
    const recent = this.loadedRecentCommits();
    const only = this.loadedCommits();
    if (sha) {
      return recent.find((item) => item.sha === sha) ?? only.find((item) => item.sha === sha);
    }
    return recent.find((item) => item.subject === subject) ?? only.find((item) => item.subject === subject);
  }

  openBranchMenu(name: string, event: Event): void {
    event.stopPropagation();
    this.openBranch.set(this.openBranch() === name ? null : name);
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
      this.loadedRecentCommits.set([]);
      this.recentHistoryComplete.set(true);
      return;
    }
    this.loadedFiles.set(readChangedFiles(path, name));
    if (this.branchIsDefault()) {
      this.loadedCommits.set([]);
      const page = readRecentCommits(path, name);
      this.loadedRecentCommits.set(page);
      this.recentHistoryComplete.set(page.length < recentCommitPageSize);
    } else {
      this.loadedRecentCommits.set([]);
      this.recentHistoryComplete.set(true);
      this.loadedCommits.set(readCommitsOnlyOnBranch(path, name));
    }
    this.openTerminals(name);
  }

  onRecentCommitsScroll(event: Event): void {
    const list = event.currentTarget as HTMLElement;
    if (list.scrollTop + list.clientHeight < list.scrollHeight) {
      return;
    }
    if (this.recentHistoryComplete()) {
      return;
    }
    const path = this.effectivePath();
    const branch = this.selectedBranchName();
    if (!path || !branch) {
      return;
    }
    const page = readRecentCommits(path, branch, this.loadedRecentCommits().length);
    this.loadedRecentCommits.update((current) => [...current, ...page]);
    if (page.length < recentCommitPageSize) {
      this.recentHistoryComplete.set(true);
    }
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

  controlWindow(action: WindowAction): void {
    requestWindowAction(action);
  }

  beginChangesSplit(event: PointerEvent): void {
    this.beginSplit(event, 'x', this.changesFileWidth(), (value) => this.changesFileWidth.set(value));
  }

  beginCommitsSplit(event: PointerEvent): void {
    this.beginSplit(event, 'y', this.changesPaneHeight(), (value) => this.changesPaneHeight.set(value));
  }

  beginCommitDetailSplit(event: PointerEvent): void {
    this.beginSplit(
      event,
      'x',
      this.commitFileWidth(),
      (value) => this.commitFileWidth.set(value),
      this.changesFileWidth() + 8,
    );
  }

  sheetColumns(): string {
    if (!this.showDetail()) {
      return 'minmax(0, 1fr)';
    }
    const history = `${this.changesFileWidth()}px 8px`;
    if (this.showingCommit() && this.visibleCommitFiles().length > 0) {
      return `${history} ${this.commitFileWidth()}px 8px minmax(0, 1fr)`;
    }
    return `${history} minmax(0, 1fr)`;
  }

  showDetail(): boolean {
    return this.showingCommit() || this.selectedFilePath() !== null;
  }

  paneDiff(): string {
    if (this.showingCommit()) {
      return this.visibleCommitDiff();
    }
    return this.selectedDiff() ?? '';
  }

  diffText(): string {
    return this.paneDiff().trim();
  }

  moveSplit(event: PointerEvent): void {
    const drag = this.splitDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const point = drag.axis === 'x' ? event.clientX : event.clientY;
    drag.apply(clampSplit(drag.origin + (point - drag.start), drag.limit));
  }

  endSplit(event: PointerEvent): void {
    if (this.splitDrag?.pointerId === event.pointerId) {
      this.splitDrag = null;
    }
  }

  private beginSplit(
    event: PointerEvent,
    axis: 'x' | 'y',
    origin: number,
    apply: (value: number) => void,
    occupied = 0,
  ): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    this.captureSplit(event);
    const parent = (event.currentTarget as HTMLElement | null)?.parentElement ?? null;
    const span = parent === null ? 0 : axis === 'x' ? parent.clientWidth : parent.clientHeight;
    const room = span - 8 - 80 - occupied;
    this.splitDrag = {
      pointerId: event.pointerId,
      axis,
      start: axis === 'x' ? event.clientX : event.clientY,
      origin,
      limit: room >= 80 ? room : undefined,
      apply,
    };
  }

  private captureSplit(event: PointerEvent): void {
    const handle = event.currentTarget;
    if (!(handle instanceof HTMLElement)) {
      return;
    }
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in some test environments.
    }
  }

  dragWindow(event: PointerEvent): void {
    const target = event.target;
    const element = target instanceof Element ? target : null;
    if (
      element?.closest(
        '[data-testid="repository-name"], [data-testid="switch-repository"], [data-testid="repository-settings"], [data-testid="window-minimize"], [data-testid="window-maximize"], [data-testid="window-close"]',
      )
    ) {
      return;
    }
    requestWindowAction('drag');
  }

  copyLocation(): void {
    copyText(this.repositoryLocation());
  }

  openSwitch(): void {
    this.overlayOpen.set(true);
  }

  closeSwitch(): void {
    this.overlayOpen.set(false);
  }

  closeSwitchOutside(event: Event): void {
    if (event.target === event.currentTarget) {
      this.closeSwitch();
    }
  }

  @HostListener('document:click', ['$event'])
  closeBranchMenuOutside(event: Event): void {
    const name = this.openBranch();
    if (name === null) {
      return;
    }
    const target = event.target;
    const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
    const menu = element?.closest('[data-testid="hover-menu"]');
    const branch = menu?.closest('[data-branch]')?.getAttribute('data-branch');
    if (branch === name) {
      return;
    }
    this.openBranch.set(null);
  }

  @HostListener('document:keydown', ['$event'])
  closeSwitchOnEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }
    if (this.addDialogOpen()) {
      this.cancelAdd();
      return;
    }
    if (this.settingsOpen()) {
      this.closeSettings();
      return;
    }
    if (this.mergeDialogBranch()) {
      this.cancelMerge();
      return;
    }
    if (this.createDialogOpen()) {
      this.cancelCreate();
      return;
    }
    if (this.overlayOpen()) {
      this.closeSwitch();
      return;
    }
    if (this.openBranch() !== null) {
      this.openBranch.set(null);
    }
  }

  openSettings(): void {
    this.settingsError.set(null);
    this.addRemoteName.set('');
    this.addRemoteUrl.set('');
    this.loadRemotes();
    this.settingsOpen.set(true);
  }

  closeSettings(): void {
    this.settingsError.set(null);
    this.settingsOpen.set(false);
  }

  dismissSettingsFromBackdrop(event: Event): void {
    if (event.target === event.currentTarget) {
      this.closeSettings();
    }
  }

  remoteDraft(name: string): string {
    return this.remoteDrafts()[name] ?? '';
  }

  setRemoteDraft(name: string, event: Event): void {
    const value = inputValue(event);
    this.remoteDrafts.update((drafts) => ({ ...drafts, [name]: value }));
  }

  confirmChangeRemote(name: string): void {
    this.editRemotes(() => {
      setRemoteUrl(this.effectivePath() ?? '', name, this.remoteDraft(name));
    });
  }

  confirmRemoveRemote(name: string): void {
    this.editRemotes(() => {
      removeRemote(this.effectivePath() ?? '', name);
    });
  }

  setAddRemoteName(event: Event): void {
    this.addRemoteName.set(inputValue(event));
  }

  setAddRemoteUrl(event: Event): void {
    this.addRemoteUrl.set(inputValue(event));
  }

  confirmAddRemote(): void {
    this.editRemotes(() => {
      addRemote(this.effectivePath() ?? '', this.addRemoteName(), this.addRemoteUrl());
      this.addRemoteName.set('');
      this.addRemoteUrl.set('');
    });
  }

  private editRemotes(action: () => void): void {
    if (!this.effectivePath()) {
      return;
    }
    this.settingsError.set(null);
    try {
      action();
      this.loadRemotes();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.settingsError.set(message);
    }
  }

  private loadRemotes(): void {
    const path = this.effectivePath();
    if (!path) {
      this.remotes.set([]);
      this.remoteDrafts.set({});
      return;
    }
    const remotes = repositoryRemotes(path);
    this.remotes.set(remotes);
    this.remoteDrafts.set(Object.fromEntries(remotes.map((remote) => [remote.name, remote.url])));
  }

  updateBranch(name: string, event: Event): void {
    event.stopPropagation();
    this.runBranchAction(name, () => updateFromMaster(this.effectivePath() ?? '', name, false));
  }

  mergeBranch(name: string, event: Event): void {
    event.stopPropagation();
    this.workspaceError.set(null);
    this.mergeSquash.set(false);
    this.mergeDialogBranch.set(name);
  }

  setMergeSquash(event: Event): void {
    const target = event.target as { checked?: boolean } | null;
    this.mergeSquash.set(target?.checked === true);
  }

  cancelMerge(): void {
    this.workspaceError.set(null);
    this.mergeSquash.set(false);
    this.mergeDialogBranch.set(null);
  }

  dismissMergeFromBackdrop(event: Event): void {
    if (event.target === event.currentTarget) {
      this.cancelMerge();
    }
  }

  confirmMerge(): void {
    const name = this.mergeDialogBranch();
    if (!name) {
      return;
    }
    this.runBranchAction(name, () => mergeIntoMaster(this.effectivePath() ?? '', name, this.mergeSquash()));
    if (this.workspaceError() === null) {
      this.mergeSquash.set(false);
      this.mergeDialogBranch.set(null);
    }
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

  openCreateDialog(): void {
    this.workspaceError.set(null);
    this.createBranchName.set('');
    const path = this.effectivePath();
    this.createBranchOptions.set(path === null ? [] : listRemoteBranchesWithoutWorktree(path));
    this.createDialogOpen.set(true);
  }

  cancelCreate(): void {
    this.workspaceError.set(null);
    this.createBranchName.set('');
    this.createDialogOpen.set(false);
  }

  dismissCreateFromBackdrop(event: Event): void {
    if (event.target === event.currentTarget) {
      this.cancelCreate();
    }
  }

  setCreateBranchName(event: Event): void {
    this.createBranchName.set(inputValue(event));
  }

  chooseCreateBranch(name: string): void {
    this.createBranchName.set(name);
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
        this.createDialogOpen.set(false);
        this.createBranchName.set('');
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

function liveQueryFlag(): boolean {
  if (typeof location === 'undefined') {
    return false;
  }
  return new URLSearchParams(location.search).get('live') === '1';
}

function inputValue(event: Event): string {
  const target = event.target as { value?: string } | null;
  return target?.value ?? '';
}

function clampSplit(value: number, limit: number | undefined): number {
  const floored = Math.max(80, value);
  if (limit === undefined) {
    return floored;
  }
  return Math.min(floored, limit);
}

function suggestedRepositoryName(repoPath: string): string {
  const folder = basename(repoPath);
  try {
    const branch = execFileSync('git', ['-C', repoPath, 'branch', '--show-current'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return branch === '' ? folder : branch;
  } catch {
    return folder;
  }
}

function hostPlatform(): string {
  if (typeof process !== 'undefined' && typeof process.platform === 'string') {
    return process.platform;
  }
  return 'linux';
}
