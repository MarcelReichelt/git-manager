import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, signal } from '@angular/core';

type BranchStatus = 'local-only' | 'local-and-remote' | 'remote-only' | 'remote-deleted';

interface SampleFile {
  path: string;
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
  terminalCount?: number;
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
    terminalCount: 2,
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
      { subject: 'Wire the session' },
    ],
  },
  { name: 'wip', status: 'local-only', changedFileCount: 0, ahead: 0, behind: 0 },
  { name: 'origin/release', status: 'remote-only', changedFileCount: 0, ahead: 4, behind: 0 },
  { name: 'abandoned', status: 'remote-deleted', changedFileCount: 1, ahead: 2, behind: 0 },
  { name: 'rename-docs', status: 'local-and-remote', changedFileCount: 1, ahead: 1, behind: 0 },
];

const branchesByRepository: Record<string, SampleBranch[]> = {
  Harbor: harborBranches,
};

@Component({
  selector: 'gm-workspace',
  standalone: true,
  imports: [NgTemplateOutlet],
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
      }

      .content-sheet {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
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

    @if (selectedName() === null) {
      <div class="start-screen">
        <ng-container [ngTemplateOutlet]="repositoryCard" />
      </div>
    } @else {
      <main data-testid="workspace">
        <aside>
          <h1 data-testid="repository-name">{{ selectedName() }}</h1>
          <button type="button" data-testid="switch-repository" (click)="openSwitch()">Switch</button>
          <ul data-testid="branch-list">
            @for (branch of branches(); track branch.name) {
              <li
                data-testid="branch-row"
                [attr.data-branch]="branch.name"
                [attr.data-status]="branch.status"
                (click)="selectBranch(branch.name)"
              >
                <button type="button" (click)="selectBranch(branch.name)">{{ branch.name }}</button>
                <span data-testid="changed-file-count">{{ branch.changedFileCount }}</span>
                <span data-testid="ahead">{{ branch.ahead }}</span>
                <span data-testid="behind">{{ branch.behind }}</span>
                @if (branch.terminalCount) {
                  <span data-testid="terminal-count">{{ branch.terminalCount }}</span>
                }
                <button
                  type="button"
                  data-testid="branch-menu"
                  [attr.aria-label]="'Branch actions for ' + branch.name"
                  (click)="openBranchMenu(branch.name, $event)"
                >
                  Branch actions
                </button>
                @if (openBranch() === branch.name) {
                  <div data-testid="hover-menu">
                    <fieldset>
                      <legend>Merge</legend>
                      <button type="button" data-testid="update-from-master">Update from master</button>
                      <button type="button" data-testid="merge-into-master">Merge into master</button>
                      <label>
                        Squash
                        <input data-testid="squash" type="checkbox" />
                      </label>
                    </fieldset>
                    <button type="button" data-testid="remove-worktree">Remove worktree</button>
                  </div>
                }
              </li>
            }
          </ul>
          <button type="button" data-testid="create-worktree">Create</button>
        </aside>
        <section class="content-sheet" data-testid="content-sheet">
          @if (selectedBranch(); as branch) {
            <ul data-testid="changed-files">
              @for (file of branch.files ?? []; track file.path) {
                <li
                  data-testid="changed-file"
                  [attr.data-path]="file.path"
                  (click)="selectFile(file.path)"
                >
                  <button type="button" (click)="selectFile(file.path)">{{ file.path }}</button>
                  <span data-testid="lines-added">{{ file.added }}</span>
                  <span data-testid="lines-deleted">{{ file.deleted }}</span>
                </li>
              }
            </ul>
            <ul data-testid="branch-commits">
              @for (commit of branch.commits ?? []; track commit.subject) {
                <li data-testid="commit" [attr.data-subject]="commit.subject" (click)="selectCommit(commit.subject)">
                  <button type="button" (click)="selectCommit(commit.subject)">{{ commit.subject }}</button>
                </li>
              }
            </ul>
            @if (selectedCommit(); as commit) {
              <div class="commit-detail">
                <ul class="commit-files" data-testid="commit-files">
                  @for (file of commit.files ?? []; track file.path) {
                    <li data-testid="changed-file" [attr.data-path]="file.path">
                      {{ file.path }}
                      <span data-testid="lines-added">{{ file.added }}</span>
                      <span data-testid="lines-deleted">{{ file.deleted }}</span>
                    </li>
                  }
                </ul>
                <pre class="commit-diff" data-testid="diff">{{ commit.diff }}</pre>
              </div>
            } @else if (selectedDiff(); as diff) {
              <pre data-testid="diff">{{ diff }}</pre>
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
export class WorkspaceComponent {
  readonly selectedName = signal<string | null>(null);
  readonly overlayOpen = signal(false);
  readonly openBranch = signal<string | null>(null);
  readonly selectedBranchName = signal<string | null>(null);
  readonly selectedFilePath = signal<string | null>(null);
  readonly selectedCommitSubject = signal<string | null>(null);
  readonly branches = computed(() => branchesByRepository[this.selectedName() ?? ''] ?? []);
  readonly selectedBranch = computed(
    () => this.branches().find((branch) => branch.name === this.selectedBranchName()) ?? null,
  );
  readonly selectedDiff = computed(() => {
    const file = this.selectedBranch()?.files?.find((item) => item.path === this.selectedFilePath());
    return file?.diff ?? null;
  });
  readonly selectedCommit = computed(
    () => this.selectedBranch()?.commits?.find((commit) => commit.subject === this.selectedCommitSubject()) ?? null,
  );

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
  }

  selectCommit(subject: string): void {
    this.selectedCommitSubject.set(subject);
    this.selectedFilePath.set(null);
  }

  openBranchMenu(name: string, event: Event): void {
    event.stopPropagation();
    this.openBranch.set(name);
  }

  selectBranch(name: string): void {
    this.selectedBranchName.set(name);
    this.selectedFilePath.set(null);
    this.selectedCommitSubject.set(null);
  }

  openSwitch(): void {
    this.overlayOpen.set(true);
  }
}
