export type FolderBrowser = () => Promise<string | null>;

interface FolderBrowserHost {
  gitWorktreeManager?: {
    browseForFolder?: () => Promise<string | null>;
  };
}

async function hostFolderBrowser(): Promise<string | null> {
  const browse = (globalThis as FolderBrowserHost).gitWorktreeManager?.browseForFolder;
  if (!browse) {
    return null;
  }
  const chosen = await browse();
  if (!chosen) {
    return null;
  }
  return chosen;
}

let folderBrowser: FolderBrowser = hostFolderBrowser;

export function setFolderBrowser(browser: FolderBrowser): void {
  folderBrowser = browser;
}

export function resetFolderBrowser(): void {
  folderBrowser = hostFolderBrowser;
}

export function browseForFolder(): Promise<string | null> {
  return folderBrowser();
}
