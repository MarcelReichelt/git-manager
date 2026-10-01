import { Directive, ElementRef, OnDestroy, OnInit, afterRenderEffect, inject, input } from '@angular/core';
import { Terminal } from '@xterm/xterm';
import { spawn, type IPty } from 'node-pty';
import { TMUX, terminalEnvironment } from './tmux-sessions';

@Directive({
  selector: '[gmTerminal]',
  standalone: true,
})
export class TerminalPane implements OnInit, OnDestroy {
  readonly sessionName = input.required<string>({ alias: 'gmTerminal' });
  private readonly host = inject(ElementRef<HTMLElement>);
  private term: Terminal | null = null;
  private pty: IPty | null = null;
  private attachedSession = '';

  constructor() {
    afterRenderEffect(() => {
      const session = this.sessionName();
      if (!this.term || !session || session === this.attachedSession) {
        return;
      }
      this.attach(session);
    });
  }

  ngOnInit(): void {
    const term = new Terminal({
      cols: 80,
      rows: 24,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
      },
      fontFamily: 'monospace',
    });
    term.open(this.host.nativeElement);
    term.onData((data) => {
      this.pty?.write(data);
    });
    this.term = term;
    this.attach(this.sessionName());
  }

  ngOnDestroy(): void {
    this.detach();
    this.term?.dispose();
    this.term = null;
  }

  private attach(session: string): void {
    const term = this.term;
    if (!term) {
      return;
    }
    this.detach();
    term.reset();
    const pty = spawn(TMUX, ['attach-session', '-t', session], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      env: terminalEnvironment(),
    });
    this.pty = pty;
    this.attachedSession = session;
    pty.onData((data) => {
      term.write(data);
    });
    term.focus();
  }

  private detach(): void {
    try {
      this.pty?.kill();
    } catch {
      // The tmux client already exited.
    }
    this.pty = null;
    this.attachedSession = '';
  }
}
