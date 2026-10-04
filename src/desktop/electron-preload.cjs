const fs = require('fs');
const path = require('path');
const Module = require('module');
const { ipcRenderer } = require('electron');
const { electronNativeAddons } = require('./electron-native-addons.cjs');
const { shellChannels } = require('./shell-channels.cjs');

window.gitManager = {
  browseForFolder() {
    return ipcRenderer.invoke('browse-for-folder');
  },
  minimizeWindow() {
    return ipcRenderer.invoke('window-minimize');
  },
  maximizeWindow() {
    return ipcRenderer.invoke('window-maximize');
  },
  closeWindow() {
    return ipcRenderer.invoke('window-close');
  },
  dragWindow() {
    return ipcRenderer.invoke('window-drag');
  },
  copyText(text) {
    return ipcRenderer.invoke('copy-text', text);
  },
  shellEnsure(id, cwd, command) {
    const message = ipcRenderer.sendSync(shellChannels.ensure, id, cwd, command);
    if (typeof message === 'string' && message.length > 0) {
      throw new Error(message);
    }
  },
  shellWrite(id, data) {
    ipcRenderer.send(shellChannels.write, id, data);
  },
  shellKill(id) {
    ipcRenderer.send(shellChannels.kill, id);
  },
  shellKillAll() {
    ipcRenderer.send(shellChannels.killAll);
  },
  shellAlive(id) {
    return ipcRenderer.sendSync(shellChannels.alive, id) === true;
  },
  shellCommand(id) {
    const command = ipcRenderer.sendSync(shellChannels.command, id);
    return typeof command === 'string' ? command : '';
  },
  shellSize(id) {
    const size = ipcRenderer.sendSync(shellChannels.size, id);
    if (!size || typeof size.cols !== 'number' || typeof size.rows !== 'number') {
      return null;
    }
    return { cols: size.cols, rows: size.rows };
  },
  shellResize(id, cols, rows) {
    ipcRenderer.sendSync(shellChannels.resize, id, cols, rows);
  },
  shellSubscribe(id, onData, onExit) {
    const onDataMessage = (_event, shellId, data) => {
      if (shellId === id && typeof data === 'string') {
        onData(data);
      }
    };
    const onExitMessage = (_event, shellId) => {
      if (shellId === id) {
        onExit();
      }
    };
    ipcRenderer.on(shellChannels.data, onDataMessage);
    ipcRenderer.on(shellChannels.exit, onExitMessage);
    ipcRenderer.send(shellChannels.subscribe, id);
    return () => {
      ipcRenderer.removeListener(shellChannels.data, onDataMessage);
      ipcRenderer.removeListener(shellChannels.exit, onExitMessage);
      ipcRenderer.send(shellChannels.unsubscribe, id);
    };
  },
};

const nativeDir = path.join(__dirname, '../../native/electron');
const electronBinaries = new Map(
  electronNativeAddons.map((addon) => [addon.binary, path.join(nativeDir, addon.binary)]),
);

const originalNodeExtension = Module._extensions['.node'];
Module._extensions['.node'] = function loadElectronNative(module, filename) {
  const electronBinary = electronBinaries.get(path.basename(filename));
  if (electronBinary && fs.existsSync(electronBinary)) {
    return originalNodeExtension(module, electronBinary);
  }
  return originalNodeExtension(module, filename);
};
