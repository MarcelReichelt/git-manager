import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'git-manager',
  });
  window.loadFile(join(import.meta.dirname, '../../dist/desktop-app/index.html'));
}

app.whenReady().then(() => {
  createWindow();
});
