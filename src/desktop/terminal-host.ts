import { Component, afterRenderEffect, computed, input, output, viewChild } from '@angular/core';
import { type TerminalMode } from '../app-settings.js';
import { ensureShell, killShell, shellAlive, shellCommand as runningShellCommand } from './shell-host';
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
  const host = hostForTerminalMode(start.mode);
  if (host === 'none' || start.cwd === '') {
    return null;
  }
  if (host === 'shell') {
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
  terminalHostActions(terminal).stop();
}

export function terminalForegroundCommand(terminal: Pick<TerminalView, 'host' | 'id' | 'session'>): string {
  return terminalHostActions(terminal).command();
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
  const actions = terminalHostActions(terminal);
  if (!actions.alive()) {
    return { alive: false, command: '' };
  }
  return { alive: true, command: actions.command() };
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
  const host = hostForTerminalMode(mode);
  if (host === 'shell') {
    return Object.values(branches).some((state) =>
      state.tabs.some((tab) =>
        tab.terminals.some((terminal) => terminal.host === 'shell' && shellAlive(terminal.id)),
      ),
    );
  }
  if (host === 'tmux') {
    return appTmuxSessions().length > 0;
  }
  return false;
}

export function stopModeSessions(mode: TerminalMode): void {
  if (hostForTerminalMode(mode) !== 'tmux') {
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
  const host = hostForTerminalMode(mode);
  if (host === 'none') {
    return [];
  }
  return state.tabs.flatMap((tab) =>
    tab.terminals
      .filter((terminal) => terminal.host === host)
      .map((terminal) => ({ tabId: tab.id, terminal })),
  );
}

function hostForTerminalMode(mode: TerminalMode): 'shell' | 'tmux' | 'none' {
  if (mode === 'terminal') {
    return 'shell';
  }
  if (mode === 'tmux') {
    return 'tmux';
  }
  return 'none';
}

function terminalHostActions(terminal: Pick<TerminalView, 'host' | 'id' | 'session'>): {
  stop(): void;
  alive(): boolean;
  command(): string;
} {
  if (terminal.host === 'tmux') {
    const session = terminal.session;
    return {
      stop() {
        killTmuxSession(session);
      },
      alive() {
        return tmuxSessionAlive(session);
      },
      command() {
        return paneCommand(session);
      },
    };
  }
  const id = terminal.id;
  return {
    stop() {
      killShell(id);
    },
    alive() {
      return shellAlive(id);
    },
    command() {
      return runningShellCommand(id);
    },
  };
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
    <div
      class="terminal-pane"
      data-testid="terminal-pane"
      [attr.title]="paneTitle()"
      [gmShell]="hostedPane().cwd"
      [shellId]="hostedPane().shellId"
      [gmTerminal]="hostedPane().session"
      [background]="background()"
      [foreground]="foreground()"
      [fontFamily]="fontFamily()"
      (shellEnded)="terminalEnded.emit()"
      (sessionEnded)="terminalEnded.emit()"
      (contextmenu)="contextMenu.emit($event)"
      (pointerdown)="paneFocus.emit()"
      [attr.data-terminal-id]="terminal().id"
      [style.background-color]="background()"
      [style.height.px]="paneHeight()"
    ></div>
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
  readonly active = input(false);
  private readonly shellPane = viewChild(ShellPane);
  private readonly terminalPane = viewChild(TerminalPane);
  readonly paneTitle = computed(() => terminalHostTitle(this.terminal().host));
  constructor() {
    afterRenderEffect(() => {
      if (!this.active()) {
        return;
      }
      this.shellPane()?.focus();
      this.terminalPane()?.focus();
    });
  }

  readonly hostedPane = computed(() => {
    const terminal = this.terminal();
    if (terminal.host === 'shell') {
      return { cwd: terminal.cwd, shellId: terminal.id, session: '' };
    }
    return { cwd: '', shellId: '', session: terminal.session };
  });
}
