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
import '@xterm/xterm/css/xterm.css';
import { spawn, type IPty } from 'node-pty';
import { applyTerminalAppearance } from './terminal-appearance';
import { fitTerminalGrid, watchTerminalBox } from './terminal-fit';
import { terminalEnvironment, tmuxBinary } from './tmux-sessions';

@Directive({
  selector: '[gmTerminal]',
  standalone: true,
})
export class TerminalPane implements OnInit, OnDestroy {
  readonly sessionName = input.required<string>({ alias: 'gmTerminal' });
  readonly background = input('#1e1e1e');
  readonly foreground = input('#d4d4d4');
  readonly fontFamily = input('UbuntuMono Nerd Font Mono, monospace');
  readonly sessionEnded = output<string>();
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private term: Terminal | null = null;
  private pty: IPty | null = null;
  private attachedSession = '';
  private generation = 0;
  private stopWatchingSize: (() => void) | null = null;

  constructor() {
    afterRenderEffect(() => {
      const session = this.sessionName();
      if (!this.term || !session || session === this.attachedSession) {
        return;
      }
      this.attach(session);
    });
    afterRenderEffect(() => {
      this.applyAppearance(this.background(), this.foreground(), this.fontFamily());
    });
  }

  ngOnInit(): void {
    if (this.sessionName().length === 0) {
      return;
    }
    const term = new Terminal({
      cols: 80,
      rows: 24,
      theme: {
        background: this.background(),
        foreground: this.foreground(),
      },
      fontFamily: this.fontFamily(),
    });
    term.open(this.host.nativeElement);
    term.onData((data) => {
      this.pty?.write(data);
    });
    this.term = term;
    this.stopWatchingSize = watchTerminalBox(this.host.nativeElement, () => this.fitPane());
    this.attach(this.sessionName());
  }

  ngOnDestroy(): void {
    this.generation += 1;
    this.stopWatchingSize?.();
    this.stopWatchingSize = null;
    this.detach();
    this.term?.dispose();
    this.term = null;
  }

  private applyAppearance(background: string, foreground: string, fontFamily: string): void {
    const term = this.term;
    if (!term) {
      return;
    }
    applyTerminalAppearance(term, background, foreground, fontFamily);
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
      cols: term.cols,
      rows: term.rows,
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
    this.fitPane();
  }

  private fitPane(): void {
    const term = this.term;
    if (!term) {
      return;
    }
    fitTerminalGrid(this.host.nativeElement, term, this.pty);
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
