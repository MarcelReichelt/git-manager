import { contextBridge, ipcRenderer } from 'electron';

// Sandboxed preloads can import electron only. This name matches REGISTERED_REPOSITORY_REGISTRY_HOST.
const registeredRepositoryRegistryHost = 'gitManagerRegistry';

interface RegisteredRepository {
  readonly path: string;
  readonly displayName: string;
}

const listChannel = 'git-manager:list-registered-repositories';
const addChannel = 'git-manager:add-registered-repository';
const unregisterChannel = 'git-manager:unregister-registered-repository';
const listBranchesChannel = 'git-manager:list-repository-branches';
// Sandboxed preloads can import electron only. This name matches REPOSITORY_BRANCH_SOURCE_HOST.
const repositoryBranchSourceHost = 'gitManagerRepositoryBranches';

contextBridge.exposeInMainWorld(registeredRepositoryRegistryHost, {
  list(): readonly RegisteredRepository[] {
    return readRegisteredRepositories(ipcRenderer.sendSync(listChannel));
  },
  add(path: string, displayName: string): void {
    throwIfFailed(ipcRenderer.sendSync(addChannel, path, displayName));
  },
  unregister(path: string): void {
    throwIfFailed(ipcRenderer.sendSync(unregisterChannel, path));
  },
});

contextBridge.exposeInMainWorld(repositoryBranchSourceHost, {
  list(repositoryPath: string): readonly Branch[] {
    return readBranches(ipcRenderer.sendSync(listBranchesChannel, repositoryPath));
  },
});

function readRegisteredRepositories(value: unknown): readonly RegisteredRepository[] {
  if (!Array.isArray(value) || !value.every(isRegisteredRepository)) {
    throw new Error('Registered repository list is unavailable');
  }
  return value;
}

function isRegisteredRepository(value: unknown): value is RegisteredRepository {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    'displayName' in value &&
    typeof value.path === 'string' &&
    typeof value.displayName === 'string'
  );
}

interface TextChange {
  readonly linesAdded: number;
  readonly linesDeleted: number;
  readonly diff: string;
}

type BranchChange =
  | (TextChange & { readonly kind: 'edit'; readonly path: string })
  | (TextChange & { readonly kind: 'rename'; readonly path: string; readonly previousPath: string })
  | { readonly kind: 'binary'; readonly path: string };

interface BranchCommit {
  readonly id: string;
  readonly subject: string;
  readonly files: readonly BranchChange[];
}

type Branch =
  | {
      readonly detached: false;
      readonly name: string;
      readonly tracking: 'local-only' | 'local-and-remote' | 'remote-only' | 'remote-deleted';
      readonly hasWorktree: boolean;
      readonly changes: readonly BranchChange[];
      readonly commitsAhead: readonly BranchCommit[];
      readonly commitsBehind: readonly BranchCommit[];
      readonly runningTerminals: number;
    }
  | {
      readonly detached: true;
      readonly name: 'HEAD';
      readonly commitId: string;
      readonly subject: string;
    };

function readBranches(value: unknown): readonly Branch[] {
  if (!Array.isArray(value) || !value.every(isBranch)) {
    throw new Error('Repository branches are unavailable');
  }
  return value;
}

function isBranch(value: unknown): value is Branch {
  if (typeof value !== 'object' || value === null || !('detached' in value)) {
    return false;
  }
  if (value.detached === true) {
    return isDetachedHead(value);
  }
  return value.detached === false && isListedBranch(value);
}

function isDetachedHead(value: object): value is Extract<Branch, { detached: true }> {
  return (
    'name' in value &&
    value.name === 'HEAD' &&
    'commitId' in value &&
    typeof value.commitId === 'string' &&
    'subject' in value &&
    typeof value.subject === 'string'
  );
}

function isListedBranch(value: object): boolean {
  if (!('name' in value) || typeof value.name !== 'string') {
    return false;
  }
  if (!('tracking' in value) || !isTracking(value.tracking)) {
    return false;
  }
  if (!('hasWorktree' in value) || typeof value.hasWorktree !== 'boolean') {
    return false;
  }
  if (!('runningTerminals' in value) || typeof value.runningTerminals !== 'number') {
    return false;
  }
  return (
    'changes' in value &&
    Array.isArray(value.changes) &&
    value.changes.every(isBranchChange) &&
    'commitsAhead' in value &&
    Array.isArray(value.commitsAhead) &&
    value.commitsAhead.every(isBranchCommit) &&
    'commitsBehind' in value &&
    Array.isArray(value.commitsBehind) &&
    value.commitsBehind.every(isBranchCommit)
  );
}

function isTracking(value: unknown): value is 'local-only' | 'local-and-remote' | 'remote-only' | 'remote-deleted' {
  return value === 'local-only' || value === 'local-and-remote' || value === 'remote-only' || value === 'remote-deleted';
}

function isBranchCommit(value: unknown): value is BranchCommit {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'subject' in value &&
    typeof value.subject === 'string' &&
    'files' in value &&
    Array.isArray(value.files) &&
    value.files.every(isBranchChange)
  );
}

function isBranchChange(value: unknown): value is BranchChange {
  if (typeof value !== 'object' || value === null || !('kind' in value) || !('path' in value)) {
    return false;
  }
  if (typeof value.path !== 'string') {
    return false;
  }
  if (value.kind === 'binary') {
    return true;
  }
  if (value.kind !== 'edit' && value.kind !== 'rename') {
    return false;
  }
  if (!isTextChange(value)) {
    return false;
  }
  return value.kind === 'edit' || ('previousPath' in value && typeof value.previousPath === 'string');
}

function isTextChange(value: object): value is TextChange {
  return (
    'linesAdded' in value &&
    typeof value.linesAdded === 'number' &&
    'linesDeleted' in value &&
    typeof value.linesDeleted === 'number' &&
    'diff' in value &&
    typeof value.diff === 'string'
  );
}

function throwIfFailed(value: unknown): void {
  if (!isFailure(value)) {
    return;
  }
  throw new Error(value.message);
}

function isFailure(value: unknown): value is { readonly ok: false; readonly message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    value.ok === false &&
    'message' in value &&
    typeof value.message === 'string'
  );
}
