import {
  Component,
  HostListener,
  Injectable,
  OnDestroy,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DialogStack {
  private readonly openIds = signal<number[]>([]);
  private nextId = 0;

  open(): number {
    const id = ++this.nextId;
    this.openIds.update((ids) => [...ids, id]);
    return id;
  }

  close(id: number): void {
    this.openIds.update((ids) => ids.filter((openId) => openId !== id));
  }

  isTop(id: number): boolean {
    return this.openIds().at(-1) === id;
  }

  anyOpen(): boolean {
    return this.openIds().length > 0;
  }

  depth(): number {
    return this.openIds().length;
  }
}

let nextHeadingId = 0;

@Component({
  selector: 'gm-dialog',
  standalone: true,
  template: `
    <div
      class="gm-dialog-backdrop"
      [attr.data-testid]="backdropTestId()"
      [style.z-index]="layer()"
      (click)="requestClose()"
    >
      <div
        class="gm-dialog-panel"
        [class.is-bare]="bare()"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="showTitle() ? headingId : null"
        [attr.aria-label]="showTitle() ? null : title()"
        (click)="$event.stopPropagation()"
      >
        @if (showTitle()) {
          <div class="gm-dialog-heading">
            <h2 [id]="headingId">{{ title() }}</h2>
            <ng-content select="[dialogActions]" />
          </div>
        }
        <ng-content />
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: contents; }

      .gm-dialog-backdrop {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(26, 60, 43, 0.2);
      }

      .gm-dialog-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 22rem;
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 32px);
        overflow: auto;
        padding: 16px;
        background: #f7f7f5;
        border: 1px solid rgba(58, 58, 56, 0.2);
        border-radius: 2px;
        color: #3a3a38;
        font-family: "General Sans", "Segoe UI", sans-serif;
        font-size: 13px;
        line-height: 1.4;
      }

      .gm-dialog-panel.is-bare {
        width: auto;
        max-height: none;
        padding: 0;
        gap: 0;
        overflow: visible;
        background: transparent;
        border: 0;
        align-items: center;
        justify-content: center;
      }

      .gm-dialog-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      h2 {
        margin: 0;
        color: #1a3c2b;
        font-family: "Space Grotesk", sans-serif;
        font-size: 20px;
        font-weight: 600;
        letter-spacing: -0.02em;
      }

      :host ::ng-deep .dialog-fields {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      :host ::ng-deep .dialog-fields label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      :host ::ng-deep .dialog-fields input {
        box-sizing: border-box;
        width: 100%;
        height: 36px;
        padding: 0 8px;
        border: 1px solid rgba(58, 58, 56, 0.2);
        border-radius: 0;
        background: #ffffff;
        color: #3a3a38;
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 12px;
        letter-spacing: 0;
        text-transform: none;
      }

      :host ::ng-deep .path-row {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      :host ::ng-deep .path-row input { flex: 1; min-width: 0; }

      :host ::ng-deep .path-row button,
      :host ::ng-deep .dialog-buttons button,
      :host ::ng-deep .icon-button {
        border: 1px solid rgba(58, 58, 56, 0.2);
        border-radius: 2px;
        background: #f7f7f5;
        color: #1a3c2b;
        cursor: pointer;
      }

      :host ::ng-deep .path-row button,
      :host ::ng-deep .dialog-buttons button {
        height: 36px;
        padding: 0 12px;
        font-family: "General Sans", "Segoe UI", sans-serif;
        font-size: 13px;
        letter-spacing: 0;
        text-transform: none;
      }

      :host ::ng-deep .icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        font-size: 18px;
        line-height: 1;
      }

      :host ::ng-deep .dialog-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      :host ::ng-deep .dialog-confirm {
        background: #1a3c2b;
        color: white;
        border-color: #1a3c2b;
      }

      :host ::ng-deep .create-note {
        margin: 0;
        color: rgba(58, 58, 56, 0.75);
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0;
        line-height: 1.4;
        text-transform: none;
      }

      :host ::ng-deep [data-testid='card-error'],
      :host ::ng-deep [data-testid='remote-error'] {
        margin: 0;
        color: #ff8c69;
        font-family: "General Sans", "Segoe UI", sans-serif;
        font-size: 13px;
        letter-spacing: 0;
        text-transform: none;
      }

      :host ::ng-deep .branch-options {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 16rem;
        margin: 0;
        padding: 0;
        overflow: auto;
        list-style: none;
      }

      :host ::ng-deep [data-testid='create-branch-option'] {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        height: 36px;
        padding: 0 8px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: #1a3c2b;
        cursor: pointer;
        text-align: left;
      }

      :host ::ng-deep [data-testid='create-branch-option']:hover {
        background: #ffffff;
      }
    `,
  ],
})
export class DialogChromeComponent implements OnInit, OnDestroy {
  private readonly stack = inject(DialogStack);
  readonly title = input.required<string>();
  readonly bare = input(false);
  readonly showTitle = input(true);
  readonly backdropTestId = input<string | null>(null);
  readonly closed = output<void>();
  readonly headingId = `gm-dialog-title-${++nextHeadingId}`;
  readonly layer = signal(30);
  private dialogId = 0;

  ngOnInit(): void {
    this.dialogId = this.stack.open();
    this.layer.set(30 + this.stack.depth());
  }

  ngOnDestroy(): void {
    if (this.dialogId !== 0) {
      this.stack.close(this.dialogId);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.stack.isTop(this.dialogId)) {
      return;
    }
    this.closed.emit();
  }

  requestClose(): void {
    if (!this.stack.isTop(this.dialogId)) {
      return;
    }
    this.closed.emit();
  }
}
