import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface GiteaState {
  baseUrl: string;
  user: string;
  password: string;
  token: string;
  repo: string;
  remoteUrl: string;
}

export function stateFilePath(): string {
  return process.env.GITEA_E2E_STATE ?? join(tmpdir(), 'gitea-e2e-state.json');
}

export function readGiteaState(): GiteaState {
  return JSON.parse(readFileSync(stateFilePath(), 'utf8')) as GiteaState;
}
