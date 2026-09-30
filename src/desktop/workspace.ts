import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  SAMPLE_REGISTERED_REPOSITORIES,
  type SampleRegisteredRepository,
} from './sample-registered-repositories.js';

@Component({
  selector: 'git-manager-workspace',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="content-sheet" aria-label="Workspace">
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
  protected readonly selected = signal<SampleRegisteredRepository | null>(null);
  private readonly repositoryListOpen = signal(false);
  protected readonly showRepositoryCard = computed(
    () => this.selected() === null || this.repositoryListOpen(),
  );

  protected choose(repository: SampleRegisteredRepository): void {
    this.selected.set(repository);
    this.repositoryListOpen.set(false);
  }

  protected openRepositoryList(): void {
    this.repositoryListOpen.set(true);
  }
}
