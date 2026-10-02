import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain } from 'electron';
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

ipcMain.handle('window-minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle('window-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return;
  }
  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }
});

ipcMain.handle('window-close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle('copy-text', (_event, text) => {
  clipboard.writeText(typeof text === 'string' ? text : '');
});

function createWindow() {
  Menu.setApplicationMenu(null);
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'git-manager',
    frame: false,
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
