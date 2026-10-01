import { app, BrowserWindow, Menu } from 'electron';
import { join } from 'node:path';

function createWindow() {
  Menu.setApplicationMenu(null);
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'git-manager',
    webPreferences: {
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
