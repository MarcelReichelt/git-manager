import { Component, input } from '@angular/core';
import type { BranchStatus } from '../branches.js';

@Component({
  selector: 'gm-branch-label',
  standalone: true,
  host: {
    '[attr.data-status]': 'status()',
    '[class.is-selected]': 'selected()',
  },
  template: `
    <span class="status-color" data-testid="status-color" [attr.title]="statusText()"></span>
    <span class="branch-name">{{ name() }}</span>
  `,
  styles: [
    `
      :host {
        display: contents;
        --gold: #f4d35e;
        --statusred: #ff5c5c;
        --statusgreen: #3ddc97;
        --statusblue: #8ecae6;
      }

      .status-color {
        width: 8px;
        height: 8px;
        flex: none;
        border-radius: 999px;
      }

      :host([data-status='local-only']) .status-color { background-color: var(--statusblue); }
      :host([data-status='local-and-remote']) .status-color { background-color: var(--statusgreen); }
      :host([data-status='remote-only']) .status-color { background-color: var(--gold); }
      :host([data-status='remote-deleted']) .status-color { background-color: var(--statusred); }

      .branch-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        color: inherit;
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 12px;
        text-align: left;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      :host(.is-selected) .branch-name { font-weight: 500; }
    `,
  ],
})
export class BranchLabelComponent {
  readonly name = input.required<string>();
  readonly status = input.required<BranchStatus>();
  readonly selected = input(false);

  statusText(): string {
    switch (this.status()) {
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
}
