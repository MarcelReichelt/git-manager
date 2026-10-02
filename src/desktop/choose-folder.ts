type FolderChooser = () => Promise<string | null> | string | null;

interface ElectronModule {
  ipcRenderer?: {
    invoke?: (channel: string) => Promise<unknown>;
  };
}

interface GmGlobals {
  gmChooseRepositoryFolder?: FolderChooser;
  require?: (id: string) => ElectronModule;
}

export async function chooseRepositoryFolder(): Promise<string | null> {
  const globals = globalThis as GmGlobals;
  if (typeof globals.gmChooseRepositoryFolder === 'function') {
    return chosenPath(await globals.gmChooseRepositoryFolder());
  }
  if (typeof process === 'undefined' || process.versions?.electron === undefined) {
    return null;
  }
  if (typeof globals.require !== 'function') {
    return null;
  }
  try {
    const invoke = globals.require('electron').ipcRenderer?.invoke;
    if (typeof invoke !== 'function') {
      return null;
    }
    return chosenPath(await invoke('choose-repository-folder'));
  } catch {
    return null;
  }
}

function chosenPath(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}
