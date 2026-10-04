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
import { applyTerminalAppearance } from './terminal-appearance';
import { fitTerminalGrid, watchTerminalBox } from './terminal-fit';
import { ensureShell, shellPty, subscribeShell, writeShell } from './shell-host';

@Directive({
  selector: '[gmShell]',
  standalone: true,
})
export class ShellPane implements OnInit, OnDestroy {
  readonly cwd = input.required<string>({ alias: 'gmShell' });
  readonly shellId = input.required<string>();
  readonly background = input('#1e1e1e');
  readonly foreground = input('#d4d4d4');
  readonly fontFamily = input('UbuntuMono Nerd Font Mono, monospace');
  readonly shellEnded = output<void>();
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private term: Terminal | null = null;
  private attachedId = '';
  private unsubscribe: (() => void) | null = null;
  private stopWatchingSize: (() => void) | null = null;

  constructor() {
    afterRenderEffect(() => {
      const id = this.shellId();
      const cwd = this.cwd();
      if (!this.term) {
        return;
      }
      this.attachShell(id, cwd);
    });
    afterRenderEffect(() => {
      this.applyAppearance(this.background(), this.foreground(), this.fontFamily());
    });
  }

  ngOnInit(): void {
    if (this.shellId().length === 0) {
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
    this.term = term;
    term.onData((data) => {
      writeShell(this.shellId(), data);
    });
    this.stopWatchingSize = watchTerminalBox(this.host.nativeElement, () => this.fitPane());
    this.attachShell(this.shellId(), this.cwd());
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.attachedId = '';
    this.stopWatchingSize?.();
    this.stopWatchingSize = null;
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

  private attachShell(id: string, cwd: string): void {
    const term = this.term;
    if (!term || !id || id === this.attachedId) {
      return;
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    term.reset();
    ensureShell(id, cwd);
    this.attachedId = id;
    this.unsubscribe = subscribeShell(id, {
      onData: (data) => {
        this.term?.write(data);
      },
      onExit: () => {
        this.zone.run(() => this.shellEnded.emit());
      },
    });
    term.focus();
    this.fitPane();
  }

  private fitPane(): void {
    const term = this.term;
    if (!term) {
      return;
    }
    fitTerminalGrid(this.host.nativeElement, term, shellPty(this.shellId()));
  }
}
