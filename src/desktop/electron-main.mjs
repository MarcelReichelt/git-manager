import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import { join } from 'node:path';

ipcMain.handle('browse-for-folder', async (event) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  const options = {
    title: 'Choose repository folder',
    properties: ['openDirectory'],
  };
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
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
