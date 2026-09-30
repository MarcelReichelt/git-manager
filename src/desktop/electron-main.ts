import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { createRepositoryWorktree } from '../core/create-repository-worktree.js';
import { mergeRepositoryBranch, type RepositoryMergeDirection } from '../core/merge-repository-branch.js';
import { removeRepositoryWorktree } from '../core/remove-repository-worktree.js';
import { readRepositoryBranches } from '../core/read-repository-branches.js';
import {
  addRegisteredRepository,
  listRegisteredRepositories,
  unregisterRegisteredRepository,
} from '../core/registered-repositories.js';

const uiIndex = join(import.meta.dirname, 'browser', 'index.html');

ipcMain.on('git-manager:list-registered-repositories', (event) => {
  event.returnValue = listRegisteredRepositories();
});

ipcMain.on('git-manager:add-registered-repository', (event, path: unknown, displayName: unknown) => {
  event.returnValue = attempt(() => {
    if (typeof path !== 'string' || typeof displayName !== 'string') {
      throw new Error('Path and display name are required');
    }
    addRegisteredRepository(path, displayName);
  });
});

ipcMain.on('git-manager:unregister-registered-repository', (event, path: unknown) => {
  event.returnValue = attempt(() => {
    if (typeof path !== 'string') {
      throw new Error('Path is required');
    }
    unregisterRegisteredRepository(path);
  });
});

ipcMain.on('git-manager:list-repository-branches', (event, path: unknown) => {
  event.returnValue = typeof path === 'string' ? readRepositoryBranches(path) : [];
});

ipcMain.on('git-manager:create-repository-worktree', (event, path: unknown, branch: unknown) => {
  event.returnValue = attempt(() => {
    if (typeof path !== 'string' || typeof branch !== 'string') {
      throw new Error('Repository path and branch are required');
    }
    createRepositoryWorktree(path, branch);
  });
});

ipcMain.on('git-manager:remove-repository-worktree', (event, path: unknown, branch: unknown) => {
  event.returnValue = attempt(() => {
    if (typeof path !== 'string' || typeof branch !== 'string') {
      throw new Error('Repository path and branch are required');
    }
    removeRepositoryWorktree(path, branch);
  }, 'Could not remove worktree');
});

ipcMain.on(
  'git-manager:merge-repository-branch',
  (event, path: unknown, branch: unknown, direction: unknown, squash: unknown) => {
    event.returnValue = attempt(() => {
      if (
        typeof path !== 'string' ||
        typeof branch !== 'string' ||
        !isMergeDirection(direction) ||
        typeof squash !== 'boolean'
      ) {
        throw new Error('Repository path, branch, and merge direction are required');
      }
      mergeRepositoryBranch(path, branch, direction, { squash });
    }, 'Could not merge');
  },
);

function openWorkspaceWindow(): void {
  const workspaceWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'git-manager',
    backgroundColor: '#1c1917',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(import.meta.dirname, 'electron-preload.js'),
    },
  });

  void workspaceWindow.loadFile(uiIndex);
}

function attempt(
  action: () => void,
  failure = 'Could not update the registry',
): { ok: true } | { ok: false; message: string } {
  try {
    action();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : failure };
  }
}

function isMergeDirection(value: unknown): value is RepositoryMergeDirection {
  return value === 'update-from-master' || value === 'into-master';
}

void app.whenReady().then(() => {
  openWorkspaceWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openWorkspaceWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
