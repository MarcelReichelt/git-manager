const fs = require('fs');
const path = require('path');
const Module = require('module');
const { ipcRenderer } = require('electron');
const { electronNativeAddons } = require('./electron-native-addons.cjs');

window.gitManager = {
  browseForFolder() {
    return ipcRenderer.invoke('browse-for-folder');
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
