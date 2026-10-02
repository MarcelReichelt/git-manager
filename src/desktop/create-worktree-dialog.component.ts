import { Component, input, output, signal } from '@angular/core';
import type { AvailableBranch } from '../branches.js';
import { BranchLabelComponent } from './branch-label.component';
import { DialogChromeComponent } from './dialog-chrome.component';
import { inputValue } from './input-value';

@Component({
  selector: 'gm-create-worktree-dialog',
  standalone: true,
  imports: [DialogChromeComponent, BranchLabelComponent],
  template: `
    <gm-dialog title="Create worktree" (closed)="dismissed.emit()">
      <div class="dialog-fields">
        <label>
          Branch
          <input
            data-testid="create-branch"
            placeholder="Branch name"
            [value]="branchName()"
            (input)="setBranchName($event)"
          />
        </label>
        <ul class="branch-options">
          @for (branch of branches(); track branch.name) {
            <li>
              <button
                type="button"
                data-testid="create-branch-option"
                [attr.data-branch]="branch.name"
                (click)="pick(branch.name)"
              >
                <gm-branch-label [name]="branch.name" [status]="branch.status" />
              </button>
            </li>
          }
        </ul>
        <p class="create-note">A remote-only branch is fetched first. Pre-create hooks run before the worktree is added. Post-create hooks run after checkout.</p>
        <div class="dialog-buttons">
          <button type="button" data-testid="cancel-create-worktree" (click)="dismissed.emit()">Cancel</button>
          <button
            type="button"
            class="dialog-confirm"
            data-testid="confirm-create-worktree"
            (click)="confirm()"
          >
            Create worktree
          </button>
        </div>
      </div>
    </gm-dialog>
  `,
})
export class CreateWorktreeDialogComponent {
  readonly branches = input.required<AvailableBranch[]>();
  readonly confirmed = output<string>();
  readonly dismissed = output<void>();
  readonly branchName = signal('');

  setBranchName(event: Event): void {
    this.branchName.set(inputValue(event));
  }

  pick(name: string): void {
    this.branchName.set(name);
  }

  confirm(): void {
    this.confirmed.emit(this.branchName());
  }
}
