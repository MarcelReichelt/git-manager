import { Component, computed, input, output } from '@angular/core';
import { type TerminalMode } from '../app-settings.js';
import { ensureShell, killAllShells, killShell, shellAlive, shellCommand as runningShellCommand } from './shell-host';
import { ShellPane } from './shell-pane';
import { terminalHostTitle, type TerminalView, type WorktreeTerminalView } from './terminal-tabs';
import { TerminalPane } from './terminal-pane';
import {
  appTmuxSessions,
  createBranchSession,
  killTmuxSession,
  nextSessionIndex,
  paneCommand,
  sessionsForBranch,
  tmuxSessionAlive,
} from './tmux-sessions';

export interface TerminalStart {
  id: string;
  mode: TerminalMode;
  repo: string;
  branch: string;
  cwd: string;
  shellCommand: string;
  knownSessions: string[];
}

export interface LiveTerminal {
  alive: boolean;
  command: string;
}

export function startTerminal(start: TerminalStart): TerminalView | null {
  if (start.mode === 'none' || start.cwd === '') {
    return null;
  }
  if (start.mode === 'terminal') {
    ensureShell(start.id, start.cwd, start.shellCommand);
    return {
      id: start.id,
      host: 'shell',
      cwd: start.cwd,
      session: '',
      customName: '',
      command: runningShellCommand(start.id),
    };
  }
  const known = [...sessionsForBranch(start.repo, start.branch), ...start.knownSessions];
  const session = createBranchSession(
    start.repo,
    start.branch,
    start.cwd,
    nextSessionIndex(start.repo, start.branch, known),
  );
  return {
    id: start.id,
    host: 'tmux',
    cwd: start.cwd,
    session,
    customName: '',
    command: paneCommand(session),
  };
}

export function stopTerminal(terminal: Pick<TerminalView, 'host' | 'id' | 'session'>): void {
  if (terminal.host === 'tmux') {
    killTmuxSession(terminal.session);
    return;
  }
  killShell(terminal.id);
}

export function terminalForegroundCommand(terminal: Pick<TerminalView, 'host' | 'id' | 'session'>): string {
  if (terminal.host === 'tmux') {
    return paneCommand(terminal.session);
  }
  return runningShellCommand(terminal.id);
}

export function adoptedTmuxTerminal(id: string, cwd: string, session: string): TerminalView {
  return {
    id,
    host: 'tmux',
    cwd,
    session,
    customName: '',
    command: terminalForegroundCommand({ host: 'tmux', id, session }),
  };
}

export function liveTerminal(terminal: Pick<TerminalView, 'host' | 'id' | 'session'>): LiveTerminal {
  if (terminal.host === 'tmux') {
    if (!tmuxSessionAlive(terminal.session)) {
      return { alive: false, command: '' };
    }
    return { alive: true, command: terminalForegroundCommand(terminal) };
  }
  if (!shellAlive(terminal.id)) {
    return { alive: false, command: '' };
  }
  return { alive: true, command: terminalForegroundCommand(terminal) };
}

export function stopAllShells(): void {
  killAllShells();
}

export function stopShellTerminals(branches: Record<string, WorktreeTerminalView>): void {
  for (const state of Object.values(branches)) {
    for (const tab of state.tabs) {
      for (const terminal of tab.terminals) {
        if (terminal.host === 'shell') {
          stopTerminal(terminal);
        }
      }
    }
  }
}

export function modeHasRunningTerminals(
  mode: TerminalMode,
  branches: Record<string, WorktreeTerminalView>,
): boolean {
  if (mode === 'terminal') {
    return Object.values(branches).some((state) =>
      state.tabs.some((tab) =>
        tab.terminals.some((terminal) => terminal.host === 'shell' && shellAlive(terminal.id)),
      ),
    );
  }
  if (mode === 'tmux') {
    return appTmuxSessions().length > 0;
  }
  return false;
}

export function stopModeSessions(mode: TerminalMode): void {
  if (mode !== 'tmux') {
    return;
  }
  for (const name of appTmuxSessions()) {
    killTmuxSession(name);
  }
}

export function terminalsForMode(
  mode: TerminalMode,
  state: WorktreeTerminalView,
): { tabId: string; terminal: TerminalView }[] {
  if (mode === 'none') {
    return [];
  }
  const host = mode === 'terminal' ? 'shell' : 'tmux';
  return state.tabs.flatMap((tab) =>
    tab.terminals
      .filter((terminal) => terminal.host === host)
      .map((terminal) => ({ tabId: tab.id, terminal })),
  );
}

@Component({
  selector: 'gm-terminal-host',
  standalone: true,
  imports: [ShellPane, TerminalPane],
  styles: [
    `
:host {
  display: contents;
}

.terminal-pane {
  background-color: #1e1e1e;
  flex: 1;
  min-height: 0;
}
`,
  ],
  template: `
    @if (terminal().host === 'shell') {
      <div
        class="terminal-pane"
        data-testid="terminal-pane"
        [attr.title]="paneTitle()"
        [gmShell]="terminal().cwd"
        [shellId]="terminal().id"
        [background]="background()"
        [foreground]="foreground()"
        [fontFamily]="fontFamily()"
        (shellEnded)="terminalEnded.emit()"
        (contextmenu)="contextMenu.emit($event)"
        (pointerdown)="paneFocus.emit()"
        [style.background-color]="background()"
        [style.height.px]="paneHeight()"
      ></div>
    } @else {
      <div
        class="terminal-pane"
        data-testid="terminal-pane"
        [attr.title]="paneTitle()"
        [gmTerminal]="terminal().session"
        [background]="background()"
        [foreground]="foreground()"
        [fontFamily]="fontFamily()"
        (sessionEnded)="terminalEnded.emit()"
        (contextmenu)="contextMenu.emit($event)"
        (pointerdown)="paneFocus.emit()"
        [style.background-color]="background()"
        [style.height.px]="paneHeight()"
      ></div>
    }
  `,
})
export class TerminalHost {
  readonly terminal = input.required<TerminalView>();
  readonly background = input('#1e1e1e');
  readonly foreground = input('#d4d4d4');
  readonly fontFamily = input('UbuntuMono Nerd Font Mono, monospace');
  readonly paneHeight = input(0);
  readonly terminalEnded = output<void>();
  readonly contextMenu = output<MouseEvent>();
  readonly paneFocus = output<void>();
  readonly paneTitle = computed(() => terminalHostTitle(this.terminal().host));
}
