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
