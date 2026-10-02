import { Component, NgZone, OnInit, inject, input, output, signal } from '@angular/core';
import {
  addRemote,
  changeRemote,
  listRemotes,
  removeRemote,
  type GitRemote,
} from '../remotes.js';
import { DialogChromeComponent } from './dialog-chrome.component';
import { RemoteFormDialogComponent, type RemoteDraft } from './remote-form-dialog.component';

@Component({
  selector: 'gm-remotes-dialog',
  standalone: true,
  imports: [DialogChromeComponent, RemoteFormDialogComponent],
  template: `
    <gm-dialog title="Remotes" (closed)="dismissed.emit()">
      <button
        dialogActions
        type="button"
        class="icon-button"
        data-testid="open-add-remote"
        aria-label="Add remote"
        (click)="openAdd()"
      >
        +
      </button>
      <ul class="remote-list">
        @for (remote of remotes(); track remote.name) {
          <li data-testid="remote" [attr.data-name]="remote.name">
            <span class="remote-name">{{ remote.name }}</span>
            <span data-testid="remote-fetch">{{ remote.fetchUrl }}</span>
            @if (remote.pushUrl !== remote.fetchUrl) {
              <span data-testid="remote-push">{{ remote.pushUrl }}</span>
            }
            <div class="remote-actions">
              <button type="button" data-testid="change-remote" (click)="openChange(remote)">Change</button>
              <button type="button" data-testid="remove-remote" (click)="remove(remote.name)">Remove</button>
            </div>
          </li>
        }
      </ul>
      @if (listError(); as message) {
        <p data-testid="remote-error">{{ message }}</p>
      }
    </gm-dialog>
    @if (addOpen()) {
      <gm-remote-form-dialog
        title="Add remote"
        confirmTestId="confirm-add-remote"
        confirmLabel="Add remote"
        [error]="formError()"
        (confirmed)="confirmAdd($event)"
        (dismissed)="closeForm()"
      />
    }
    @if (editing(); as remote) {
      <gm-remote-form-dialog
        title="Change remote"
        confirmTestId="confirm-change-remote"
        confirmLabel="Change remote"
        [error]="formError()"
        [initialName]="remote.name"
        [initialFetch]="remote.fetchUrl"
        [initialPush]="remote.pushUrl === remote.fetchUrl ? '' : remote.pushUrl"
        (confirmed)="confirmChange(remote.name, $event)"
        (dismissed)="closeForm()"
      />
    }
  `,
  styles: [
    `
      .remote-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      [data-testid='remote'] {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(58, 58, 56, 0.2);
      }

      .remote-name {
        color: #1a3c2b;
        font-family: "Space Grotesk", sans-serif;
        font-size: 14px;
        font-weight: 600;
      }

      [data-testid='remote-fetch'],
      [data-testid='remote-push'] {
        color: #3a3a38;
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 12px;
        word-break: break-all;
      }

      .remote-actions {
        display: flex;
        gap: 8px;
      }

      .remote-actions button {
        padding: 4px 8px;
        border: 1px solid rgba(58, 58, 56, 0.2);
        border-radius: 2px;
        background: #f7f7f5;
        color: #1a3c2b;
        cursor: pointer;
      }
    `,
  ],
})
export class RemotesDialogComponent implements OnInit {
  private readonly zone = inject(NgZone);
  readonly repoPath = input.required<string>();
  readonly dismissed = output<void>();
  readonly remotes = signal<GitRemote[]>([]);
  readonly listError = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly addOpen = signal(false);
  readonly editing = signal<GitRemote | null>(null);

  ngOnInit(): void {
    this.reload();
  }

  openAdd(): void {
    this.editing.set(null);
    this.formError.set(null);
    this.addOpen.set(true);
  }

  openChange(remote: GitRemote): void {
    this.addOpen.set(false);
    this.formError.set(null);
    this.editing.set(remote);
  }

  closeForm(): void {
    this.addOpen.set(false);
    this.editing.set(null);
    this.formError.set(null);
  }

  confirmAdd(draft: RemoteDraft): void {
    this.writeForm(() => {
      addRemote(this.repoPath(), draft.name, draft.fetchUrl, emptyToUndefined(draft.pushUrl));
      this.addOpen.set(false);
    });
  }

  confirmChange(currentName: string, draft: RemoteDraft): void {
    this.writeForm(() => {
      changeRemote(
        this.repoPath(),
        currentName,
        draft.name,
        draft.fetchUrl,
        emptyToUndefined(draft.pushUrl),
      );
      this.editing.set(null);
    });
  }

  remove(name: string): void {
    this.listError.set(null);
    try {
      removeRemote(this.repoPath(), name);
      this.reload();
    } catch (error) {
      this.listError.set(messageOf(error));
    }
  }

  private writeForm(action: () => void): void {
    this.formError.set(null);
    try {
      action();
      this.zone.run(() => {
        this.formError.set(null);
        this.reload();
      });
    } catch (error) {
      const message = messageOf(error);
      this.zone.run(() => {
        this.formError.set(message);
      });
    }
  }

  private reload(): void {
    try {
      this.remotes.set(listRemotes(this.repoPath()));
      this.listError.set(null);
    } catch (error) {
      this.listError.set(messageOf(error));
    }
  }
}

function emptyToUndefined(value: string): string | undefined {
  return value === '' ? undefined : value;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
