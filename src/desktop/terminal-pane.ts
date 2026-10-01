import {
  Directive,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  afterRenderEffect,
  inject,
  input,
  output,
} from '@angular/core';
import { Terminal } from '@xterm/xterm';
import { spawn, type IPty } from 'node-pty';
import { terminalEnvironment, tmuxBinary } from './tmux-sessions';

@Directive({
  selector: '[gmTerminal]',
  standalone: true,
})
export class TerminalPane implements OnInit, OnDestroy {
  readonly sessionName = input.required<string>({ alias: 'gmTerminal' });
  readonly sessionEnded = output<string>();
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private term: Terminal | null = null;
  private pty: IPty | null = null;
  private attachedSession = '';
  private generation = 0;

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
    this.generation += 1;
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
    const generation = ++this.generation;
    const pty = spawn(tmuxBinary(), ['attach-session', '-t', session], {
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
    pty.onExit(() => {
      if (generation !== this.generation) {
        return;
      }
      this.zone.run(() => this.sessionEnded.emit(session));
    });
    term.focus();
  }

  private detach(): void {
    this.generation += 1;
    try {
      this.pty?.kill();
    } catch {
      // The tmux client already exited.
    }
    this.pty = null;
    this.attachedSession = '';
  }
}
