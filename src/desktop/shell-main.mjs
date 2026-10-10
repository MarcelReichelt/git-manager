import { createRequire } from 'node:module';
import { app, ipcMain } from 'electron';
import { createJiti } from 'jiti';
import channels from './shell-channels.cjs';

const { shellChannels } = channels;

createRequire(import.meta.url)('./install-electron-natives.cjs').installElectronNatives();

const jiti = createJiti(import.meta.url);
const shellHost = jiti('./shell-host.ts');

const subscriptions = new Map();
const watchedSenders = new WeakSet();

function subscriptionKey(sender, id) {
  return `${sender.id}:${id}`;
}

function dropSender(sender) {
  const prefix = `${sender.id}:`;
  for (const [key, unsubscribe] of subscriptions) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    unsubscribe();
    subscriptions.delete(key);
  }
}

function watchSender(sender) {
  if (watchedSenders.has(sender)) {
    return;
  }
  watchedSenders.add(sender);
  sender.once('destroyed', () => dropSender(sender));
}

export function registerShellIpc() {
  ipcMain.on(shellChannels.ensure, (event, id, cwd, command) => {
    try {
      shellHost.ensureShell(String(id), String(cwd), typeof command === 'string' ? command : '');
      event.returnValue = '';
    } catch (error) {
      event.returnValue = error instanceof Error ? error.message : String(error);
    }
  });

  ipcMain.on(shellChannels.write, (_event, id, data) => {
    if (typeof data === 'string') {
      shellHost.writeShell(String(id), data);
    }
  });

  ipcMain.on(shellChannels.kill, (_event, id) => {
    shellHost.killShell(String(id));
  });

  ipcMain.on(shellChannels.killAll, () => {
    shellHost.killAllShells();
  });

  ipcMain.on(shellChannels.alive, (event, id) => {
    event.returnValue = shellHost.shellAlive(String(id));
  });

  ipcMain.on(shellChannels.command, (event, id) => {
    event.returnValue = shellHost.shellCommand(String(id));
  });

  ipcMain.on(shellChannels.size, (event, id) => {
    const pty = shellHost.shellPty(String(id));
    event.returnValue = pty ? { cols: pty.cols, rows: pty.rows } : null;
  });

  ipcMain.on(shellChannels.resize, (event, id, cols, rows) => {
    event.returnValue = null;
    const pty = shellHost.shellPty(String(id));
    if (!pty) {
      return;
    }
    try {
      pty.resize(Number(cols), Number(rows));
    } catch {
      // The process already exited.
    }
  });

  ipcMain.on(shellChannels.typeStartup, (_event, id, command) => {
    if (typeof id === 'string' && typeof command === 'string') {
      shellHost.typeStartupCommand(id, command);
    }
  });

  ipcMain.on(shellChannels.subscribe, (event, id) => {
    if (typeof id !== 'string') {
      return;
    }
    const sender = event.sender;
    watchSender(sender);
    const key = subscriptionKey(sender, id);
    subscriptions.get(key)?.();
    const unsubscribe = shellHost.subscribeShell(id, {
      onData(data) {
        if (!sender.isDestroyed()) {
          sender.send(shellChannels.data, id, data);
        }
      },
      onExit() {
        if (!sender.isDestroyed()) {
          sender.send(shellChannels.exit, id);
        }
      },
    });
    subscriptions.set(key, unsubscribe);
  });

  ipcMain.on(shellChannels.unsubscribe, (event, id) => {
    if (typeof id !== 'string') {
      return;
    }
    const key = subscriptionKey(event.sender, id);
    subscriptions.get(key)?.();
    subscriptions.delete(key);
  });

  app.on('before-quit', () => {
    shellHost.killAllShells();
  });
}
