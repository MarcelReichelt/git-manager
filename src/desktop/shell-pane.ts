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
import { applyTerminalAppearance } from './terminal-appearance';
import { fitTerminalGrid, watchTerminalBox } from './terminal-fit';
import { terminalEnvironment } from './tmux-sessions';

@Directive({
  selector: '[gmShell]',
  standalone: true,
})
export class ShellPane implements OnInit, OnDestroy {
  readonly cwd = input.required<string>({ alias: 'gmShell' });
  readonly background = input('#1e1e1e');
  readonly foreground = input('#d4d4d4');
  readonly fontFamily = input('UbuntuMono Nerd Font Mono, monospace');
  readonly shellEnded = output<void>();
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private term: Terminal | null = null;
  private pty: IPty | null = null;
  private currentCwd = '';
  private generation = 0;
  private stopWatchingSize: (() => void) | null = null;

  constructor() {
    afterRenderEffect(() => {
      const cwd = this.cwd();
      if (!this.term || cwd === this.currentCwd) {
        return;
      }
      this.spawnShell(cwd);
    });
    afterRenderEffect(() => {
      this.applyAppearance(this.background(), this.foreground(), this.fontFamily());
    });
  }

  ngOnInit(): void {
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
    this.term = term;
    term.onData((data) => {
      this.pty?.write(data);
    });
    this.stopWatchingSize = watchTerminalBox(this.host.nativeElement, () => this.fitPane());
    this.spawnShell(this.cwd());
  }

  ngOnDestroy(): void {
    this.generation += 1;
    this.stopWatchingSize?.();
    this.stopWatchingSize = null;
    this.stopShell();
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

  private spawnShell(cwd: string): void {
    const term = this.term;
    if (!term) {
      return;
    }
    this.stopShell();
    term.reset();
    this.currentCwd = cwd;
    const generation = ++this.generation;
    const program = shellProgram();
    const pty = spawn(program.file, program.args, {
      name: 'xterm-256color',
      cols: term.cols,
      rows: term.rows,
      cwd,
      env: terminalEnvironment(),
    });
    this.pty = pty;
    pty.onData((data) => {
      term.write(data);
    });
    pty.onExit(() => {
      if (generation !== this.generation) {
        return;
      }
      this.zone.run(() => this.shellEnded.emit());
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

  private stopShell(): void {
    this.generation += 1;
    try {
      this.pty?.kill();
    } catch {
      // The shell already exited.
    }
    this.pty = null;
  }
}

function shellProgram(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return { file: 'powershell.exe', args: ['-NoLogo'] };
  }
  return { file: '/bin/bash', args: ['--noprofile', '--norc', '-i'] };
}
