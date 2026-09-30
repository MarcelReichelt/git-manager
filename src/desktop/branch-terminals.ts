import { InjectionToken } from '@angular/core';

export const BRANCH_TERMINALS_HOST = 'gitManagerBranchTerminals';

/** One in-app shell. It is not a tmux session and cannot be attached from outside the app. */
export interface BranchTerminalShell {
  readonly processes: readonly [{ readonly cwd: string }];
  readonly usesTmux: false;
}

export interface BranchTerminals {
  sessions(repositoryPath: string, branch: string): readonly string[];
  create(repositoryPath: string, branch: string): string;
  kill(repositoryPath: string, branch: string, session: string): void;
  split(repositoryPath: string, branch: string, session: string): void;
  shell(repositoryPath: string, branch: string): BranchTerminalShell | null;
}

export const BRANCH_TERMINALS = new InjectionToken<BranchTerminals>('Branch terminals', {
  factory: () => {
    const host: unknown = Reflect.get(globalThis, BRANCH_TERMINALS_HOST);
    if (!isBranchTerminals(host)) {
      throw new Error('Branch terminals are unavailable');
    }
    return host;
  },
});

function isBranchTerminals(host: unknown): host is BranchTerminals {
  return (
    typeof host === 'object' &&
    host !== null &&
    'sessions' in host &&
    typeof host.sessions === 'function' &&
    'create' in host &&
    typeof host.create === 'function' &&
    'kill' in host &&
    typeof host.kill === 'function' &&
    'split' in host &&
    typeof host.split === 'function' &&
    'shell' in host &&
    typeof host.shell === 'function'
  );
}
