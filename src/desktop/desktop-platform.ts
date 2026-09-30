import { InjectionToken } from '@angular/core';

export const DESKTOP_PLATFORM_HOST = 'gitManagerDesktopPlatform';

/** `win32` renders one in-app shell. Linux and macOS render tmux session tabs. */
export const DESKTOP_PLATFORM = new InjectionToken<string>('Desktop platform', {
  factory: () => {
    const host: unknown = Reflect.get(globalThis, DESKTOP_PLATFORM_HOST);
    if (typeof host === 'string' && host.length > 0) {
      return host;
    }
    return 'linux';
  },
});
