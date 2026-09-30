import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { type Branch, type ListedBranch } from './repository-branches.js';
import {
  REGISTERED_REPOSITORY_REGISTRY,
  type RegisteredRepository,
} from './registered-repository-registry.js';
import { REPOSITORY_BRANCHES } from './sample-branches.js';

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
                <span class="changed-file-count">{{ changedFileCount(branch) }} changed</span>
                <span class="commits-ahead">{{ commitsAhead(branch) }} ahead</span>
                <span class="commits-behind">{{ commitsBehind(branch) }} behind</span>
                @if (branch.runningTerminals > 0) {
                  <span class="running-terminals">{{ branch.runningTerminals }} terminals</span>
                }
              </span>
              @if (hoveredBranch() === branch.name) {
                <div class="branch-menu" role="menu" aria-label="Branch actions" (click)="$event.stopPropagation()">
                  <button type="button" role="menuitem">Merge</button>
                  <button type="button" role="menuitem">Remove</button>
                </div>
              }
            </li>
          }
        </ul>
        <button type="button" class="create-branch">Create</button>
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

    .create-branch {
      margin-top: auto;
      background: transparent;
      color: inherit;
      border: 1px solid #78716c;
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
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
  private readonly repositoryBranches = inject(REPOSITORY_BRANCHES);
  protected readonly selected = signal<RegisteredRepository | null>(null);
  protected readonly branches = computed(() => {
    const repository = this.selected();
    if (!repository) {
      return [];
    }
    const list = this.repositoryBranches.find((entry) => entry.repositoryPath === repository.path);
    return (list?.branches ?? []).filter(isListedBranch);
  });
  private readonly repositoryListOpen = signal(false);
  protected readonly pathDraft = signal('');
  protected readonly displayNameDraft = signal('');
  protected readonly addError = signal<string | null>(null);
  protected readonly hoveredBranch = signal<string | null>(null);
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
    this.clearBranchDetail();
  }

  protected selectBranch(name: string): void {
    this.selectedBranchName.set(name);
    this.clearBranchDetail();
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
    }
    this.reload();
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
