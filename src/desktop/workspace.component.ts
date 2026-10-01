import { Component, signal } from '@angular/core';

@Component({
  selector: 'gm-workspace',
  standalone: true,
  styles: [
    `
      .start-screen {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }
    `,
  ],
  template: `
    @if (selectedName() === null) {
      <div class="start-screen">
        <section data-testid="repository-card">
          <button type="button" data-testid="repository" data-name="Harbor" (click)="choose('Harbor')">
            Harbor
          </button>
          <button type="button" data-testid="repository" data-name="Atlas" (click)="choose('Atlas')">
            Atlas
          </button>
        </section>
      </div>
    } @else {
      <main data-testid="workspace">
        <h1 data-testid="repository-name">{{ selectedName() }}</h1>
      </main>
    }
  `,
})
export class WorkspaceComponent {
  readonly selectedName = signal<string | null>(null);

  choose(name: string): void {
    this.selectedName.set(name);
  }
}
