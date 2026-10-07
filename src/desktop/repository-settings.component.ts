import { Component, TemplateRef, computed, input, output, signal, viewChild } from '@angular/core';
import {
  clearRepositorySidebarColor,
  clearRepositorySidebarText,
  createLayoutForRepository,
  formatCreateLayout,
  readAppSettings,
  readRepositoryAppearance,
  saveRepositoryLayoutMode,
  saveRepositorySidebarColor,
  saveRepositorySidebarText,
  type SidebarText,
} from '../app-settings.js';
import { sidebarSwatches } from './color-swatches';
import { findRepository, renameRepository } from '../registry.js';
import {
  addRemote,
  changeRemote,
  listRemotes,
  removeRemote,
  repositoryRemotes,
  type RepositoryRemote,
} from '../remotes.js';
import { copyText } from './copy-text';
import { OverlayScroll } from './overlay-scrollbar';

@Component({
  selector: 'gm-repository-settings',
  standalone: true,
  imports: [OverlayScroll],
  styles: [
    `
:host {
  display: inline-flex;
  align-items: center;
  -webkit-app-region: no-drag;
}

h2, h3, p { margin: 0; }

button, input { font: inherit; color: inherit; }

[data-testid='repository-settings'] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

[data-testid='repository-settings']:hover {
  background: rgba(255, 255, 255, 0.12);
}

[data-testid='repository-settings'] svg {
  display: block;
}

[data-testid='repository-settings-dialog'] [data-testid='settings-error'] {
  color: var(--coral);
}

[data-testid='repository-settings-dialog'] {
  position: fixed;
  inset: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26, 60, 43, 0.45);
}

[data-testid='repository-settings-dialog'] .dialog-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 28rem;
  padding: 16px;
  background-color: var(--paper);
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 8px;
  color: var(--grid);
}

[data-testid='repository-settings-dialog'] h2 {
  margin-bottom: 4px;
  color: var(--forest);
  font-family: "Space Grotesk", sans-serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

[data-testid='repository-settings-dialog'] label,
[data-testid='remotes-heading'],
[data-testid='worktree-mode-heading'],
[data-testid='repository-sidebar-heading'] {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

[data-testid='repository-settings-dialog'] label.worktree-mode,
[data-testid='repository-settings-dialog'] label.sidebar-text {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
}

[data-testid='remotes-heading'],
[data-testid='worktree-mode-heading'],
[data-testid='repository-sidebar-heading'] {
  margin-top: 8px;
}

[data-testid='repository-settings-dialog'] .color-choice {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  color: var(--grid);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
}

[data-testid='repository-settings-dialog'] .color-swatches,
[data-testid='repository-settings-dialog'] .sidebar-text-choices {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

[data-testid='repository-settings-dialog'] .sidebar-text-choices {
  gap: 16px;
}

[data-testid='repository-settings-dialog'] .color-swatches button {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid rgba(58, 58, 56, 0.35);
  border-radius: 999px;
  cursor: pointer;
}

[data-testid='repository-settings-dialog'] .color-swatches button.is-selected {
  outline: 2px solid var(--grid);
  outline-offset: 2px;
}

[data-testid='repository-settings-dialog'] .custom-color {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 2px;
}

[data-testid='repository-settings-dialog'] input[type='color'] {
  width: 28px;
  height: 22px;
  padding: 0;
  border: 1px solid rgba(58, 58, 56, 0.2);
  background-color: var(--paper);
  cursor: pointer;
}

.remotes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}

.remotes-header [data-testid='remotes-heading'] {
  margin-top: 0;
}

[data-testid='repository-settings-dialog'] [data-testid='open-add-remote'] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  padding: 0;
  text-align: center;
  font-size: 18px;
  line-height: 1;
}

[data-testid='repository-location'],
[data-testid='worktree-mode-source'],
[data-testid='remote-name'] {
  margin: 0;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
  word-break: break-all;
}

[data-testid='repository-location'] {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

[data-testid='repository-display-name'] {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  padding: 0 8px;
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 0;
  background: var(--surface);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
}

[data-testid='display-name-error'] {
  margin: 0;
  color: var(--coral);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
}

[data-testid='copy-location-icon'] {
  flex: none;
  opacity: 0;
}

[data-testid='repository-location']:hover [data-testid='copy-location-icon'],
[data-testid='repository-location']:focus-visible [data-testid='copy-location-icon'] {
  opacity: 1;
}

[data-testid='remote-list'] {
  margin: 0;
  padding: 0;
  list-style: none;
}

[data-testid='remote-row'] {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  min-width: 0;
  overflow: hidden;
}

[data-testid='remote-name'] {
  flex: none;
}

[data-testid='remote-row'] [data-testid='remote-url'] {
  flex: 1 1 auto;
  min-width: 0;
}

[data-testid='remote-row'] [data-testid='change-remote'] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  padding: 0;
  margin-right: -36px;
  border: 1px solid transparent;
  border-radius: 2px;
  background: transparent;
  color: var(--forest);
  cursor: pointer;
  opacity: 0;
  transform: translateX(16px);
  transition:
    margin-right 180ms ease,
    opacity 180ms ease,
    transform 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
}

[data-testid='remote-row']:hover [data-testid='change-remote'],
[data-testid='remote-row']:focus-within [data-testid='change-remote'] {
  margin-right: 0;
  opacity: 1;
  transform: translateX(0);
  border-color: rgba(58, 58, 56, 0.2);
  background-color: var(--paper);
}

@media (prefers-reduced-motion: reduce) {
  [data-testid='remote-row'] [data-testid='change-remote'] {
    transition: none;
  }
}

[data-testid='repository-settings-dialog'] input:not([type='radio']):not([type='color']),
[data-testid='open-add-remote'],
[data-testid='remove-remote'],
[data-testid='close-repository-settings'] {
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 2px;
  background-color: var(--paper);
  text-align: left;
  cursor: pointer;
}

[data-testid='repository-settings-dialog'] input:not([type='radio']):not([type='color']) {
  width: 100%;
  height: 36px;
  padding: 0 8px;
  border-radius: 0;
  background: var(--surface);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
  cursor: text;
}

[data-testid='open-add-remote'],
[data-testid='confirm-add-remote'],
[data-testid='confirm-change-remote'] {
  background-color: var(--forest);
  color: white;
  border-color: var(--forest);
}

[data-testid='add-remote-dialog'],
[data-testid='change-remote-dialog'] {
  position: fixed;
  inset: 0;
  z-index: 7;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26, 60, 43, 0.45);
}

[data-testid='add-remote-dialog'] .dialog-panel,
[data-testid='change-remote-dialog'] .dialog-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 22rem;
  padding: 16px;
  background-color: var(--paper);
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 8px;
  color: var(--grid);
}

[data-testid='add-remote-dialog'] h2,
[data-testid='change-remote-dialog'] h2 {
  margin-bottom: 4px;
  color: var(--forest);
  font-family: "Space Grotesk", sans-serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

[data-testid='add-remote-dialog'] label,
[data-testid='change-remote-dialog'] label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

[data-testid='add-remote-dialog'] input,
[data-testid='change-remote-dialog'] input,
[data-testid='confirm-add-remote'],
[data-testid='confirm-change-remote'],
[data-testid='cancel-add-remote'],
[data-testid='cancel-change-remote'] {
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid rgba(58, 58, 56, 0.2);
  border-radius: 2px;
  background-color: var(--paper);
  text-align: left;
  cursor: pointer;
}

[data-testid='add-remote-dialog'] input,
[data-testid='change-remote-dialog'] input {
  width: 100%;
  height: 36px;
  padding: 0 8px;
  border-radius: 0;
  background: var(--surface);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
  cursor: text;
}

[data-testid='add-remote-dialog'] [data-testid='confirm-add-remote'],
[data-testid='change-remote-dialog'] [data-testid='confirm-change-remote'] {
  background-color: var(--forest);
  color: #ffffff;
  border-color: var(--forest);
}

[data-testid='remote-form-error'] {
  margin: 0;
  color: var(--coral);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
}

.dialog-actions {
  display: flex;
  gap: 8px;
}
    `,
  ],
  template: `
    <button type="button" data-testid="repository-settings" aria-label="Repository settings" (click)="openSettings()">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path fill="currentColor" d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z" />
      </svg>
    </button>
    <ng-template #settingsDialog>
    @if (settingsOpen()) {
      <div data-testid="repository-settings-dialog" role="dialog" aria-label="Repository settings" (click)="dismissSettingsFromBackdrop($event)">
        <section class="dialog-panel" gmOverlayScroll (click)="$event.stopPropagation()">
          <h2>Repository settings</h2>
          <label>
            Location
            <button type="button" data-testid="repository-location" title="Copy location" (click)="copyLocation()">{{ repositoryLocation() }}<svg data-testid="copy-location-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" /><path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" /></svg></button>
          </label>
          @if (canRename()) {
            <label>
              Display name
              <input data-testid="repository-display-name" [value]="displayName()" (input)="setDisplayName($event)" />
            </label>
            @if (displayNameError(); as message) {
              <p data-testid="display-name-error">{{ message }}</p>
            }
          }
          <h3 data-testid="worktree-mode-heading">Worktree mode</h3>
          <p data-testid="worktree-mode-source">{{ createLayoutLine() }}</p>
          <label class="worktree-mode">
            <input
              type="radio"
              name="worktree-mode"
              data-testid="worktree-mode-workspaces"
              value="workspaces"
              [checked]="repositoryWorktreeMode() === 'workspaces'"
              (change)="chooseRepositoryLayout('workspaces', $event)"
            />
            Workspaces
          </label>
          <label class="worktree-mode">
            <input
              type="radio"
              name="worktree-mode"
              data-testid="worktree-mode-sibling"
              value="sibling"
              [checked]="repositoryWorktreeMode() === 'sibling'"
              (change)="chooseRepositoryLayout('sibling', $event)"
            />
            Sibling
          </label>
          <h3 data-testid="repository-sidebar-heading">Sidebar</h3>
          <div class="color-choice">
            <span>Color</span>
            <div class="color-swatches">
              @for (swatch of sidebarColorSwatches; track swatch.color) {
                <button
                  type="button"
                  data-testid="repository-sidebar-swatch"
                  [attr.data-color]="swatch.color"
                  [attr.aria-label]="swatch.name"
                  [class.is-selected]="isSelectedColor(shownSidebarColor(), swatch.color)"
                  [style.background-color]="swatch.color"
                  (click)="chooseRepositorySidebarColor(swatch.color)"
                ></button>
              }
              <span class="custom-color">
                Custom
                <input
                  type="color"
                  data-testid="repository-sidebar-color"
                  aria-label="Custom sidebar color"
                  [value]="shownSidebarColor()"
                  (input)="chooseRepositorySidebarColorFromInput($event)"
                  (change)="chooseRepositorySidebarColorFromInput($event)"
                />
              </span>
            </div>
            <button type="button" data-testid="use-app-sidebar-color" (click)="useAppSidebarColor()">Use app settings</button>
          </div>
          <div class="color-choice">
            <span>Text</span>
            <div class="sidebar-text-choices">
              <label class="sidebar-text">
                <input
                  type="radio"
                  name="repository-sidebar-text"
                  data-testid="repository-sidebar-text-white"
                  [checked]="shownSidebarText() === 'white'"
                  (click)="chooseRepositorySidebarText('white', $event)"
                />
                White
              </label>
              <label class="sidebar-text">
                <input
                  type="radio"
                  name="repository-sidebar-text"
                  data-testid="repository-sidebar-text-black"
                  [checked]="shownSidebarText() === 'black'"
                  (click)="chooseRepositorySidebarText('black', $event)"
                />
                Black
              </label>
            </div>
            <button type="button" data-testid="use-app-sidebar-text" (click)="useAppSidebarText()">Use app settings</button>
          </div>
          <div class="remotes-header">
            <h3 id="remotes-heading" data-testid="remotes-heading">Remotes</h3>
            <button type="button" data-testid="open-add-remote" aria-label="Add remote" (click)="openAddRemote()">+</button>
          </div>
          <ul data-testid="remote-list" aria-labelledby="remotes-heading">
            @for (remote of remotes(); track remote.name) {
              <li data-testid="remote-row" [attr.data-name]="remote.name">
                <span data-testid="remote-name">{{ remote.name }}</span>
                <input
                  data-testid="remote-url"
                  readonly
                  [value]="remote.url"
                  [attr.aria-label]="remote.name + ' URL'"
                />
                <button
                  type="button"
                  data-testid="change-remote"
                  aria-label="Edit remote"
                  title="Edit remote"
                  (click)="openChangeRemote(remote.name)"
                >
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                    <path fill="currentColor" d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25a1.75 1.75 0 0 1 .445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064l6.286-6.286Z" />
                  </svg>
                </button>
              </li>
            }
          </ul>
          @if (settingsError(); as message) {
            <p data-testid="settings-error">{{ message }}</p>
          }
          <div class="dialog-actions">
            <button type="button" data-testid="close-repository-settings" (click)="closeSettings()">Close</button>
          </div>
        </section>
      </div>
    }
    @if (addRemoteOpen()) {
      <div data-testid="add-remote-dialog" role="dialog" aria-label="Add remote" (click)="dismissAddRemoteFromBackdrop($event)">
        <section class="dialog-panel" gmOverlayScroll (click)="$event.stopPropagation()">
          <h2>Add remote</h2>
          <label>
            Name
            <input data-testid="add-remote-name" [value]="remoteFormName()" (input)="setRemoteFormName($event)" />
          </label>
          <label>
            URL
            <input data-testid="add-remote-url" [value]="remoteFormUrl()" (input)="setRemoteFormUrl($event)" />
          </label>
          @if (remoteFormError(); as message) {
            <p data-testid="remote-form-error">{{ message }}</p>
          }
          <div class="dialog-actions">
            <button type="button" data-testid="confirm-add-remote" (click)="confirmAddRemote()">Add remote</button>
            <button type="button" data-testid="cancel-add-remote" (click)="cancelAddRemote()">Cancel</button>
          </div>
        </section>
      </div>
    }
    @if (editingRemote()) {
      <div data-testid="change-remote-dialog" role="dialog" aria-label="Edit remote" (click)="dismissChangeRemoteFromBackdrop($event)">
        <section class="dialog-panel" gmOverlayScroll (click)="$event.stopPropagation()">
          <h2>Edit remote</h2>
          <label>
            Name
            <input data-testid="change-remote-name" [value]="remoteFormName()" (input)="setRemoteFormName($event)" />
          </label>
          <label>
            URL
            <input data-testid="change-remote-url" [value]="remoteFormUrl()" (input)="setRemoteFormUrl($event)" />
          </label>
          @if (remoteFormError(); as message) {
            <p data-testid="remote-form-error">{{ message }}</p>
          }
          <div class="dialog-actions">
            <button type="button" data-testid="confirm-change-remote" (click)="confirmChangeRemote()">Change remote</button>
            <button type="button" data-testid="remove-remote" (click)="confirmRemoveRemote()">Remove</button>
            <button type="button" data-testid="cancel-change-remote" (click)="cancelChangeRemote()">Cancel</button>
          </div>
        </section>
      </div>
    }
    </ng-template>
  `,
})
export class RepositorySettings {
  readonly settingsDialog = viewChild<TemplateRef<unknown>>('settingsDialog');
  readonly repositoryPath = input<string | null>(null);
  readonly appearanceChanged = output<void>();
  readonly displayNameChanged = output<{ path: string; displayName: string }>();
  readonly sidebarColorSwatches = sidebarSwatches;
  private readonly explicitPath = signal<string | null>(null);
  readonly displayName = signal('');
  readonly displayNameError = signal<string | null>(null);
  readonly canRename = computed(() => this.activeRepositoryPath() !== null);
  readonly repositoryLocation = computed(() => this.activeRepositoryPath() ?? '');
  private readonly ownSidebarColor = signal<string | null>(null);
  private readonly ownSidebarText = signal<SidebarText | null>(null);
  readonly settingsOpen = signal(false);
  readonly remotes = signal<RepositoryRemote[]>([]);
  readonly addRemoteOpen = signal(false);
  readonly editingRemote = signal<string | null>(null);
  readonly remoteFormName = signal('');
  readonly remoteFormUrl = signal('');
  readonly remoteFormError = signal<string | null>(null);
  readonly settingsError = signal<string | null>(null);

  closeOnEscape(): boolean {
    if (this.addRemoteOpen()) {
      this.cancelAddRemote();
      return true;
    }
    if (this.editingRemote()) {
      this.cancelChangeRemote();
      return true;
    }
    if (this.settingsOpen()) {
      this.closeSettings();
      return true;
    }
    return false;
  }

  copyLocation(): void {
    copyText(this.repositoryLocation());
  }

  createLayoutLine(): string {
    return formatCreateLayout(this.activeRepositoryPath());
  }

  repositoryWorktreeMode(): 'workspaces' | 'sibling' | null {
    const path = this.activeRepositoryPath();
    if (path === null) {
      return readAppSettings().defaultLayout;
    }
    const layout = createLayoutForRepository(path);
    if (!layout.supported) {
      return null;
    }
    return layout.label === 'Sibling' ? 'sibling' : 'workspaces';
  }

  chooseRepositoryLayout(mode: 'workspaces' | 'sibling', event: Event): void {
    const path = this.activeRepositoryPath();
    if (path === null) {
      this.keepWorktreeModeRadios(event);
      return;
    }
    saveRepositoryLayoutMode(path, mode);
  }

  shownSidebarColor(): string {
    return this.ownSidebarColor() ?? readAppSettings().sidebarColor;
  }

  shownSidebarText(): SidebarText {
    return this.ownSidebarText() ?? readAppSettings().sidebarText;
  }

  isSelectedColor(current: string, swatch: string): boolean {
    return current.toLowerCase() === swatch.toLowerCase();
  }

  chooseRepositorySidebarColor(color: string): void {
    const path = this.activeRepositoryPath();
    if (path === null) {
      return;
    }
    saveRepositorySidebarColor(path, color);
    this.ownSidebarColor.set(color);
    this.appearanceChanged.emit();
  }

  chooseRepositorySidebarColorFromInput(event: Event): void {
    this.chooseRepositorySidebarColor(inputValue(event));
  }

  chooseRepositorySidebarText(text: SidebarText, event: Event): void {
    const path = this.activeRepositoryPath();
    if (path === null) {
      this.keepSidebarTextRadios(event);
      return;
    }
    saveRepositorySidebarText(path, text);
    this.ownSidebarText.set(text);
    this.appearanceChanged.emit();
  }

  useAppSidebarColor(): void {
    const path = this.activeRepositoryPath();
    if (path === null) {
      return;
    }
    clearRepositorySidebarColor(path);
    this.ownSidebarColor.set(null);
    this.appearanceChanged.emit();
  }

  useAppSidebarText(): void {
    const path = this.activeRepositoryPath();
    if (path === null) {
      return;
    }
    clearRepositorySidebarText(path);
    this.ownSidebarText.set(null);
    this.appearanceChanged.emit();
  }

  openSettings(): void {
    this.explicitPath.set(null);
    this.presentSettings();
  }

  openForPath(path: string): void {
    this.explicitPath.set(path);
    this.presentSettings();
  }

  closeSettings(): void {
    this.settingsError.set(null);
    this.cancelAddRemote();
    this.cancelChangeRemote();
    this.explicitPath.set(null);
    this.settingsOpen.set(false);
  }

  setDisplayName(event: Event): void {
    const name = inputValue(event);
    this.displayName.set(name);
    const path = this.activeRepositoryPath();
    if (path === null) {
      return;
    }
    const trimmed = name.trim();
    if (trimmed === '') {
      this.displayNameError.set('Enter a display name');
      return;
    }
    try {
      renameRepository(path, trimmed);
      this.displayNameError.set(null);
      this.displayNameChanged.emit({ path, displayName: trimmed });
    } catch (error) {
      this.displayNameError.set(error instanceof Error ? error.message : String(error));
    }
  }

  private presentSettings(): void {
    this.settingsError.set(null);
    this.displayNameError.set(null);
    this.cancelAddRemote();
    this.cancelChangeRemote();
    this.loadDisplayName();
    this.loadAppearance();
    this.loadRemotes();
    this.settingsOpen.set(true);
  }

  private loadDisplayName(): void {
    const path = this.activeRepositoryPath();
    this.displayName.set(path === null ? '' : findRepository(path)?.displayName ?? '');
  }

  private activeRepositoryPath(): string | null {
    return this.explicitPath() ?? this.repositoryPath();
  }

  dismissSettingsFromBackdrop(event: Event): void {
    if (event.target === event.currentTarget) {
      this.closeSettings();
    }
  }

  openAddRemote(): void {
    this.remoteFormError.set(null);
    this.remoteFormName.set('');
    this.remoteFormUrl.set('');
    this.editingRemote.set(null);
    this.addRemoteOpen.set(true);
  }

  cancelAddRemote(): void {
    this.remoteFormError.set(null);
    this.addRemoteOpen.set(false);
  }

  dismissAddRemoteFromBackdrop(event: Event): void {
    if (event.target === event.currentTarget) {
      this.cancelAddRemote();
    }
  }

  openChangeRemote(name: string): void {
    const remote = this.remotes().find((item) => item.name === name);
    if (!remote) {
      return;
    }
    this.remoteFormError.set(null);
    this.remoteFormName.set(remote.name);
    this.remoteFormUrl.set(remote.url);
    this.addRemoteOpen.set(false);
    this.editingRemote.set(name);
  }

  cancelChangeRemote(): void {
    this.remoteFormError.set(null);
    this.editingRemote.set(null);
  }

  dismissChangeRemoteFromBackdrop(event: Event): void {
    if (event.target === event.currentTarget) {
      this.cancelChangeRemote();
    }
  }

  setRemoteFormName(event: Event): void {
    this.remoteFormName.set(inputValue(event));
  }

  setRemoteFormUrl(event: Event): void {
    this.remoteFormUrl.set(inputValue(event));
  }

  confirmChangeRemote(): void {
    const currentName = this.editingRemote();
    const path = this.activeRepositoryPath();
    if (!currentName || !path) {
      return;
    }
    this.remoteFormError.set(null);
    try {
      const existing = listRemotes(path).find((remote) => remote.name === currentName);
      const pushUrl = existing && existing.pushUrl !== existing.fetchUrl ? existing.pushUrl : undefined;
      changeRemote(path, currentName, this.remoteFormName().trim(), this.remoteFormUrl().trim(), pushUrl);
      this.editingRemote.set(null);
      this.loadRemotes();
    } catch (error) {
      this.remoteFormError.set(error instanceof Error ? error.message : String(error));
    }
  }

  confirmRemoveRemote(): void {
    const name = this.editingRemote();
    const path = this.activeRepositoryPath();
    if (!name || !path) {
      return;
    }
    this.remoteFormError.set(null);
    try {
      removeRemote(path, name);
      this.editingRemote.set(null);
      this.loadRemotes();
    } catch (error) {
      this.remoteFormError.set(error instanceof Error ? error.message : String(error));
    }
  }

  confirmAddRemote(): void {
    const path = this.activeRepositoryPath();
    if (!path) {
      return;
    }
    this.remoteFormError.set(null);
    try {
      addRemote(path, this.remoteFormName().trim(), this.remoteFormUrl().trim());
      this.addRemoteOpen.set(false);
      this.loadRemotes();
    } catch (error) {
      this.remoteFormError.set(error instanceof Error ? error.message : String(error));
    }
  }

  private keepWorktreeModeRadios(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const selected = this.repositoryWorktreeMode();
    const dialog = input.closest('[data-testid="repository-settings-dialog"]');
    if (!(dialog instanceof HTMLElement)) {
      return;
    }
    for (const radio of dialog.querySelectorAll<HTMLInputElement>('input[name="worktree-mode"]')) {
      radio.checked = radio.value === selected;
    }
  }

  private loadAppearance(): void {
    const path = this.activeRepositoryPath();
    if (path === null) {
      this.ownSidebarColor.set(null);
      this.ownSidebarText.set(null);
      return;
    }
    const appearance = readRepositoryAppearance(path);
    this.ownSidebarColor.set(appearance.sidebarColor ?? null);
    this.ownSidebarText.set(appearance.sidebarText ?? null);
  }

  private keepSidebarTextRadios(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const selected = this.shownSidebarText();
    const dialog = input.closest('[data-testid="repository-settings-dialog"]');
    if (!(dialog instanceof HTMLElement)) {
      return;
    }
    for (const radio of dialog.querySelectorAll<HTMLInputElement>('input[name="repository-sidebar-text"]')) {
      radio.checked =
        radio.getAttribute('data-testid') ===
        (selected === 'black' ? 'repository-sidebar-text-black' : 'repository-sidebar-text-white');
    }
  }

  private loadRemotes(): void {
    const path = this.activeRepositoryPath();
    if (!path) {
      this.remotes.set([]);
      return;
    }
    this.remotes.set(repositoryRemotes(path));
  }
}

function inputValue(event: Event): string {
  const target = event.target as { value?: string } | null;
  return target?.value ?? '';
}
