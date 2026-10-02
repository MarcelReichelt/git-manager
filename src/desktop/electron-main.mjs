import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import { join } from 'node:path';

ipcMain.handle('choose-repository-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

function createWindow() {
  Menu.setApplicationMenu(null);
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'git-manager',
    webPreferences: {
      preload: join(import.meta.dirname, 'electron-preload.cjs'),
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
  });
  window.loadFile(join(import.meta.dirname, '../../dist/desktop-app/index.html'), {
    query: { live: '1' },
  });
}

app.whenReady().then(() => {
  createWindow();
});
