export type WindowAction = 'minimize' | 'maximize' | 'close';

export type WindowChrome = (action: WindowAction) => void;

interface WindowChromeHost {
  gitManager?: {
    minimizeWindow?: () => void;
    maximizeWindow?: () => void;
    closeWindow?: () => void;
  };
}

function hostWindowChrome(action: WindowAction): void {
  const gitManager = (globalThis as WindowChromeHost).gitManager;
  if (!gitManager) {
    return;
  }
  if (action === 'minimize') {
    gitManager.minimizeWindow?.();
    return;
  }
  if (action === 'maximize') {
    gitManager.maximizeWindow?.();
    return;
  }
  gitManager.closeWindow?.();
}

let windowChrome: WindowChrome = hostWindowChrome;

export function setWindowChrome(chrome: WindowChrome): void {
  windowChrome = chrome;
}

export function resetWindowChrome(): void {
  windowChrome = hostWindowChrome;
}

export function requestWindowAction(action: WindowAction): void {
  windowChrome(action);
}
