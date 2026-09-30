import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

const uiIndex = join(import.meta.dirname, 'desktop', 'browser', 'index.html');

function openWorkspaceWindow(): void {
  const workspaceWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'git-manager',
    backgroundColor: '#1c1917',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  void workspaceWindow.loadFile(uiIndex);
}

void app.whenReady().then(() => {
  openWorkspaceWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openWorkspaceWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
