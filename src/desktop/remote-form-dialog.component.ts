import { Component, OnInit, input, output, signal } from '@angular/core';
import { DialogChromeComponent } from './dialog-chrome.component';
import { inputValue } from './input-value';

export interface RemoteDraft {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

@Component({
  selector: 'gm-remote-form-dialog',
  standalone: true,
  imports: [DialogChromeComponent],
  template: `
    <gm-dialog [title]="title()" (closed)="dismissed.emit()">
      <div class="dialog-fields">
        <label>
          Name
          <input data-testid="remote-name" [value]="name()" (input)="name.set(inputValue($event))" />
        </label>
        <label>
          Fetch URL
          <input data-testid="remote-fetch-url" [value]="fetchUrl()" (input)="fetchUrl.set(inputValue($event))" />
        </label>
        <label>
          Push URL
          <input
            data-testid="remote-push-url"
            placeholder="Same as fetch"
            [value]="pushUrl()"
            (input)="pushUrl.set(inputValue($event))"
          />
        </label>
        @if (error(); as message) {
          <p data-testid="remote-error">{{ message }}</p>
        }
        <div class="dialog-buttons">
          <button type="button" data-testid="cancel-remote" (click)="dismissed.emit()">Cancel</button>
          <button type="button" class="dialog-confirm" [attr.data-testid]="confirmTestId()" (click)="submit()">
            {{ confirmLabel() }}
          </button>
        </div>
      </div>
    </gm-dialog>
  `,
})
export class RemoteFormDialogComponent implements OnInit {
  readonly title = input.required<string>();
  readonly confirmTestId = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly error = input<string | null>(null);
  readonly initialName = input('');
  readonly initialFetch = input('');
  readonly initialPush = input('');
  readonly confirmed = output<RemoteDraft>();
  readonly dismissed = output<void>();
  readonly name = signal('');
  readonly fetchUrl = signal('');
  readonly pushUrl = signal('');
  protected readonly inputValue = inputValue;

  ngOnInit(): void {
    this.name.set(this.initialName());
    this.fetchUrl.set(this.initialFetch());
    this.pushUrl.set(this.initialPush());
  }

  submit(): void {
    this.confirmed.emit({
      name: this.name().trim(),
      fetchUrl: this.fetchUrl().trim(),
      pushUrl: this.pushUrl().trim(),
    });
  }
}
