import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { type Branch, type ListedBranch } from './repository-branches.js';
import { REPOSITORY_BRANCHES } from './sample-branches.js';
import {
  SAMPLE_REGISTERED_REPOSITORIES,
  type SampleRegisteredRepository,
} from './sample-registered-repositories.js';

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
              (mouseenter)="hoverBranch(branch.name)"
              (mouseleave)="leaveBranch()"
            >
              <span class="status" [class]="statusClass(branch)"></span>
              <span class="branch-name">{{ branch.name }}</span>
              <span class="changed-file-count">{{ changedFileCount(branch) }} changed</span>
              <span class="commits-ahead">{{ commitsAhead(branch) }} ahead</span>
              <span class="commits-behind">{{ commitsBehind(branch) }} behind</span>
              @if (branch.runningTerminals > 0) {
                <span class="running-terminals">{{ branch.runningTerminals }} terminals</span>
              }
              @if (hoveredBranch() === branch.name) {
                <div class="branch-menu" role="menu" aria-label="Branch actions">
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
      }
    </section>
    @if (showRepositoryCard()) {
      <div class="repository-card-layer">
        <section class="repository-card" aria-label="Registered repositories">
          <h2>Registered repositories</h2>
          <ul>
            @for (repository of repositories; track repository.path) {
              <li>
                <button type="button" (click)="choose(repository)">{{ repository.displayName }}</button>
              </li>
            }
          </ul>
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
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
    }

    .status {
      flex: 0 0 auto;
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
  `,
})
export class Workspace {
  protected readonly repositories = inject(SAMPLE_REGISTERED_REPOSITORIES);
  private readonly repositoryBranches = inject(REPOSITORY_BRANCHES);
  protected readonly selected = signal<SampleRegisteredRepository | null>(null);
  protected readonly branches = computed(() => {
    const repository = this.selected();
    if (!repository) {
      return [];
    }
    const list = this.repositoryBranches.find((entry) => entry.repositoryPath === repository.path);
    return (list?.branches ?? []).filter(isListedBranch);
  });
  private readonly repositoryListOpen = signal(false);
  protected readonly hoveredBranch = signal<string | null>(null);
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

  protected choose(repository: SampleRegisteredRepository): void {
    this.selected.set(repository);
    this.repositoryListOpen.set(false);
  }

  protected openRepositoryList(): void {
    this.repositoryListOpen.set(true);
  }

  protected hoverBranch(name: string): void {
    this.hoveredBranch.set(name);
  }

  protected leaveBranch(): void {
    this.hoveredBranch.set(null);
  }
}
