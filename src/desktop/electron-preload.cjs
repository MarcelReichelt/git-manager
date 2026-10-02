const fs = require('fs');
const path = require('path');
const Module = require('module');
const { ipcRenderer } = require('electron');
const { electronNativeAddons } = require('./electron-native-addons.cjs');

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
