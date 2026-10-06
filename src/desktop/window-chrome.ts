export type WindowAction = 'minimize' | 'maximize' | 'close' | 'drag';

export type WindowChrome = (action: WindowAction) => void;

interface WindowChromeHost {
  gitWorktreeManager?: {
    minimizeWindow?: () => void;
    maximizeWindow?: () => void;
    closeWindow?: () => void;
    dragWindow?: () => void;
  };
}

function hostWindowChrome(action: WindowAction): void {
  const gitWorktreeManager = (globalThis as WindowChromeHost).gitWorktreeManager;
  if (!gitWorktreeManager) {
    return;
  }
  if (action === 'minimize') {
    gitWorktreeManager.minimizeWindow?.();
    return;
  }
  if (action === 'maximize') {
    gitWorktreeManager.maximizeWindow?.();
    return;
  }
  if (action === 'drag') {
    gitWorktreeManager.dragWindow?.();
    return;
  }
  gitWorktreeManager.closeWindow?.();
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
