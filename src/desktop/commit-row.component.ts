import { Component, input, output } from '@angular/core';

@Component({
  selector: 'li[gmCommitRow]',
  standalone: true,
  host: {
    'data-testid': 'commit',
    '[attr.data-subject]': 'subject()',
    '(click)': 'chosen.emit(subject())',
  },
  template: `
    <button type="button" (click)="choose($event)">{{ subject() }}</button>
  `,
  styles: [
    `
      :host {
        display: flex;
        gap: 8px;
        align-items: baseline;
        min-height: 36px;
        padding: 6px 4px;
        border-bottom: 1px solid rgba(58, 58, 56, 0.2);
        cursor: pointer;
      }

      :host(:hover) { background: var(--surface, #ffffff); }

      button {
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 12px;
        cursor: pointer;
      }
    `,
  ],
})
export class CommitRowComponent {
  readonly subject = input.required<string>();
  readonly chosen = output<string>();

  choose(event: Event): void {
    event.stopPropagation();
    this.chosen.emit(this.subject());
  }
}
