import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, signal } from '@angular/core';

type BranchStatus = 'local-only' | 'local-and-remote' | 'remote-only' | 'remote-deleted';

interface SampleBranch {
  name: string;
  status: BranchStatus;
  changedFileCount: number;
  ahead: number;
  behind: number;
  terminalCount?: number;
}

const harborBranches: SampleBranch[] = [
  {
    name: 'feature/login',
    status: 'local-and-remote',
    changedFileCount: 2,
    ahead: 3,
    behind: 1,
    terminalCount: 2,
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
              >
                <span>{{ branch.name }}</span>
                <span data-testid="changed-file-count">{{ branch.changedFileCount }}</span>
                <span data-testid="ahead">{{ branch.ahead }}</span>
                <span data-testid="behind">{{ branch.behind }}</span>
                @if (branch.terminalCount) {
                  <span data-testid="terminal-count">{{ branch.terminalCount }}</span>
                }
              </li>
            }
          </ul>
        </aside>
        <section class="content-sheet" data-testid="content-sheet"></section>
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
  readonly branches = computed(() => branchesByRepository[this.selectedName() ?? ''] ?? []);

  choose(name: string): void {
    this.selectedName.set(name);
    this.overlayOpen.set(false);
  }

  openSwitch(): void {
    this.overlayOpen.set(true);
  }
}
