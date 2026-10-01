import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';
import { Terminal } from '@xterm/xterm';
import { spawn, type IPty } from 'node-pty';
import { TMUX, tmuxEnvironment } from './tmux-sessions';

@Directive({
  selector: '[gmTerminal]',
  standalone: true,
})
export class TerminalPane implements OnInit, OnDestroy {
  readonly sessionName = input.required<string>({ alias: 'gmTerminal' });
  private readonly host = inject(ElementRef<HTMLElement>);
  private term: Terminal | null = null;
  private pty: IPty | null = null;

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
    this.term = term;

    const pty = spawn(TMUX, ['attach-session', '-t', this.sessionName()], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: this.host.nativeElement.dataset['cwd'],
      env: tmuxEnvironment(),
    });
    this.pty = pty;
    pty.onData((data) => {
      term.write(data);
    });
    term.onData((data) => {
      pty.write(data);
    });
    term.focus();
  }

  ngOnDestroy(): void {
    this.pty?.kill();
    this.term?.dispose();
    this.pty = null;
    this.term = null;
  }
}
