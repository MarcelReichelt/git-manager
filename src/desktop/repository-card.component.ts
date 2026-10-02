import { Component, input, output } from '@angular/core';

export interface CardRepository {
  name: string;
  path: string | null;
}

@Component({
  selector: 'section[gmRepositoryCard]',
  standalone: true,
  host: {
    'data-testid': 'repository-card',
  },
  template: `
    <div class="card-heading">
      <h2>Repositories</h2>
      @if (registryMode()) {
        <button
          type="button"
          class="icon-button"
          data-testid="open-add-repository"
          aria-label="Add repository"
          (click)="add.emit()"
        >
          +
        </button>
      }
    </div>
    @if (registryMode() && repositories().length === 0) {
      <p data-testid="repositories-empty">A repository needs to be added.</p>
    }
    @for (repository of repositories(); track repository.name + (repository.path ?? '')) {
      <button
        type="button"
        data-testid="repository"
        [attr.data-name]="repository.name"
        (click)="chosen.emit(repository.name)"
      >
        {{ repository.name }}
      </button>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 22rem;
        padding: 16px;
        background: var(--paper, #f7f7f5);
        border: 1px solid rgba(58, 58, 56, 0.2);
        border-radius: 2px;
        color: var(--grid, #3a3a38);
        font: inherit;
      }

      button { font: inherit; color: inherit; }

      .card-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 4px;
      }

      h2 {
        margin: 0;
        color: var(--forest, #1a3c2b);
        font-family: "Space Grotesk", sans-serif;
        font-size: 20px;
        font-weight: 600;
        letter-spacing: -0.02em;
      }

      .icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 1px solid rgba(58, 58, 56, 0.2);
        border-radius: 2px;
        background: var(--paper, #f7f7f5);
        color: var(--forest, #1a3c2b);
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }

      [data-testid='repositories-empty'] {
        margin: 0;
        color: rgba(58, 58, 56, 0.75);
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 12px;
      }

      [data-testid='repository'] {
        padding: 8px 12px;
        border: 1px solid rgba(58, 58, 56, 0.2);
        border-radius: 2px;
        background: var(--paper, #f7f7f5);
        text-align: left;
        cursor: pointer;
      }

      [data-testid='repository']:hover { background: var(--surface, #ffffff); }
    `,
  ],
})
export class RepositoryCardComponent {
  readonly repositories = input.required<CardRepository[]>();
  readonly registryMode = input(false);
  readonly chosen = output<string>();
  readonly add = output<void>();
}
