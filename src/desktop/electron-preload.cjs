const fs = require('fs');
const path = require('path');
const Module = require('module');

const nativeDir = path.join(__dirname, '../../native/electron');
const electronBinaries = new Map([
  ['better_sqlite3.node', path.join(nativeDir, 'better_sqlite3.node')],
  ['pty.node', path.join(nativeDir, 'pty.node')],
]);

const originalNodeExtension = Module._extensions['.node'];
Module._extensions['.node'] = function loadElectronNative(module, filename) {
  const electronBinary = electronBinaries.get(path.basename(filename));
  if (electronBinary && fs.existsSync(electronBinary)) {
    return originalNodeExtension(module, electronBinary);
  }
  return originalNodeExtension(module, filename);
};
