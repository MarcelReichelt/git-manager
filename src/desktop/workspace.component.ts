import { Component } from '@angular/core';

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
    <div class="start-screen">
      <section data-testid="repository-card">
        <button type="button" data-testid="repository" data-name="Harbor">Harbor</button>
        <button type="button" data-testid="repository" data-name="Atlas">Atlas</button>
      </section>
    </div>
  `,
})
export class WorkspaceComponent {}
