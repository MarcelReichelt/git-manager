import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';
import { Terminal } from '@xterm/xterm';
import { spawn, type IPty } from 'node-pty';
import { terminalEnvironment } from './tmux-sessions';

@Directive({
  selector: '[gmShell]',
  standalone: true,
})
export class ShellPane implements OnInit, OnDestroy {
  readonly cwd = input.required<string>({ alias: 'gmShell' });
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

    const program = shellProgram();
    const pty = spawn(program.file, program.args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: this.cwd(),
      env: terminalEnvironment(),
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
    try {
      this.pty?.kill();
    } catch {
      // The shell already exited.
    }
    this.term?.dispose();
    this.pty = null;
    this.term = null;
  }
}

function shellProgram(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return { file: 'powershell.exe', args: ['-NoLogo'] };
  }
  return { file: '/bin/bash', args: ['--noprofile', '--norc', '-i'] };
}
