import { Component, input, output, signal } from '@angular/core';
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { chooseRepositoryFolder } from './choose-folder';
import { DialogChromeComponent } from './dialog-chrome.component';
import { inputValue } from './input-value';

@Component({
  selector: 'gm-add-repository-dialog',
  standalone: true,
  imports: [DialogChromeComponent],
  template: `
    <gm-dialog title="Add repository" (closed)="dismissed.emit()">
      <div class="dialog-fields">
        <label>
          Path
          <span class="path-row">
            <input data-testid="add-repository-path" [value]="path()" (input)="onPath($event)" />
            <button type="button" data-testid="browse-repository" (click)="browse()">Browse</button>
          </span>
        </label>
        <label>
          Name
          <input data-testid="add-repository-name" [value]="name()" (input)="onName($event)" />
        </label>
        @if (error(); as message) {
          <p data-testid="card-error">{{ message }}</p>
        }
        <div class="dialog-buttons">
          <button type="button" data-testid="cancel-add-repository" (click)="dismissed.emit()">Cancel</button>
          <button type="button" class="dialog-confirm" data-testid="add-repository" (click)="confirm()">
            Add repository
          </button>
        </div>
      </div>
    </gm-dialog>
  `,
})
export class AddRepositoryDialogComponent {
  readonly error = input<string | null>(null);
  readonly confirmed = output<{ path: string; name: string }>();
  readonly dismissed = output<void>();
  readonly path = signal('');
  readonly name = signal('');
  private readonly nameTouched = signal(false);

  onPath(event: Event): void {
    const path = inputValue(event);
    this.path.set(path);
    this.applySuggestedName(path);
  }

  onName(event: Event): void {
    this.nameTouched.set(true);
    this.name.set(inputValue(event));
  }

  async browse(): Promise<void> {
    const chosen = await chooseRepositoryFolder();
    if (chosen === null) {
      return;
    }
    this.path.set(chosen);
    this.applySuggestedName(chosen);
  }

  confirm(): void {
    this.confirmed.emit({ path: this.path(), name: this.name() });
  }

  private applySuggestedName(path: string): void {
    if (this.nameTouched()) {
      return;
    }
    const trimmed = path.trim();
    this.name.set(trimmed === '' ? '' : suggestedRepositoryName(trimmed));
  }
}

function suggestedRepositoryName(repoPath: string): string {
  const folder = basename(repoPath);
  try {
    const branch = execFileSync('git', ['-C', repoPath, 'branch', '--show-current'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return branch === '' ? folder : branch;
  } catch {
    return folder;
  }
}
