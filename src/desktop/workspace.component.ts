import { NgTemplateOutlet } from '@angular/common';
import { Component, signal } from '@angular/core';

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
        <h1 data-testid="repository-name">{{ selectedName() }}</h1>
        <button type="button" data-testid="switch-repository" (click)="openSwitch()">Switch</button>
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

  choose(name: string): void {
    this.selectedName.set(name);
    this.overlayOpen.set(false);
  }

  openSwitch(): void {
    this.overlayOpen.set(true);
  }
}
