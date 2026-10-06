const fs = require('fs');
const path = require('path');
const Module = require('module');

const nativeDir = path.join(__dirname, '..', '..', 'native', 'electron');

function electronNativeFile(filename, directory = nativeDir, existsSync = fs.existsSync) {
  const candidate = path.join(directory, path.basename(filename));
  if (path.resolve(candidate) === path.resolve(filename)) {
    return null;
  }
  const unpacked = candidate.replaceAll('app.asar', 'app.asar.unpacked');
  if (unpacked !== candidate && existsSync(unpacked)) {
    return unpacked;
  }
  if (existsSync(candidate)) {
    return candidate;
  }
  return null;
}

function installElectronNatives(directory = nativeDir) {
  const current = Module._extensions['.node'];
  if (current && current.gitWorktreeManagerElectronNatives) {
    return;
  }
  function loadElectronNative(module, filename) {
    const electronBinary = electronNativeFile(filename, directory);
    if (electronBinary) {
      return current(module, electronBinary);
    }
    return current(module, filename);
  }
  loadElectronNative.gitWorktreeManagerElectronNatives = true;
  Module._extensions['.node'] = loadElectronNative;
}

module.exports = {
  electronNativeFile,
  installElectronNatives,
};
