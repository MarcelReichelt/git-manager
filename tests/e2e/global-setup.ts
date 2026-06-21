import { writeFileSync } from 'node:fs';
import { stateFilePath, type GiteaState } from './state.js';

const GITEA_URL = process.env.GITEA_URL ?? 'http://gitea:3000';
const USER = process.env.GITEA_USER ?? 'tester';
const PASSWORD = process.env.GITEA_PASSWORD ?? 'tester-password-123';
const EMAIL = process.env.GITEA_EMAIL ?? 'tester@example.com';
const REPO = process.env.GITEA_REPO ?? 'demo';

async function waitForGitea(timeoutMs = 90000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${GITEA_URL}/api/healthz`);
      if (res.ok) {
        return;
      }
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Gitea did not become healthy at ${GITEA_URL}: ${String(lastError)}`);
}

function sessionCookie(setCookies: string[]): string {
  return setCookies.map((c) => c.split(';')[0]).join('; ');
}

/**
 * Register the first user via the web sign-up form. In Gitea the first
 * registered account is automatically promoted to site administrator, which
 * lets us create tokens and repos through the API afterwards. Gitea's current
 * sign-up form carries no CSRF field, so the session cookie alone suffices.
 */
async function ensureUser(): Promise<void> {
  const auth = 'Basic ' + Buffer.from(`${USER}:${PASSWORD}`).toString('base64');
  const existing = await fetch(`${GITEA_URL}/api/v1/user`, { headers: { Authorization: auth } });
  if (existing.ok) {
    return;
  }

  const form = await fetch(`${GITEA_URL}/user/sign_up`);
  const cookies = sessionCookie(form.headers.getSetCookie());

  const body = new URLSearchParams({
    user_name: USER,
    email: EMAIL,
    password: PASSWORD,
    retype: PASSWORD,
  });

  const res = await fetch(`${GITEA_URL}/user/sign_up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies },
    body,
    redirect: 'manual',
  });

  // 303 => created and redirected; 200 => form re-render (already exists).
  if (res.status >= 400) {
    throw new Error(`Gitea sign-up failed: ${res.status} ${await res.text()}`);
  }
  await waitForUser();
}

async function waitForUser(timeoutMs = 60000): Promise<void> {
  const auth = 'Basic ' + Buffer.from(`${USER}:${PASSWORD}`).toString('base64');
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    const res = await fetch(`${GITEA_URL}/api/v1/user`, { headers: { Authorization: auth } });
    if (res.ok) {
      return;
    }
    lastStatus = res.status;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Gitea user ${USER} not usable (last status ${lastStatus})`);
}

async function createToken(): Promise<string> {
  const auth = 'Basic ' + Buffer.from(`${USER}:${PASSWORD}`).toString('base64');
  const name = `e2e-${Date.now()}`;
  const res = await fetch(`${GITEA_URL}/api/v1/users/${USER}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({
      name,
      scopes: ['write:repository', 'write:user'],
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create Gitea token: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { sha1: string };
  return json.sha1;
}

async function ensureRepo(token: string): Promise<void> {
  const res = await fetch(`${GITEA_URL}/api/v1/user/repos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `token ${token}` },
    body: JSON.stringify({
      name: REPO,
      auto_init: true,
      default_branch: 'main',
      private: false,
    }),
  });
  // 201 created, 409 already exists (re-run) are both fine.
  if (!res.ok && res.status !== 409) {
    throw new Error(`Failed to create Gitea repo: ${res.status} ${await res.text()}`);
  }
}

function buildRemoteUrl(token: string): string {
  const url = new URL(GITEA_URL);
  url.username = USER;
  url.password = token;
  url.pathname = `/${USER}/${REPO}.git`;
  return url.toString();
}

export default async function setup(): Promise<void> {
  await waitForGitea();
  await ensureUser();
  const token = await createToken();
  await ensureRepo(token);

  const state: GiteaState = {
    baseUrl: GITEA_URL,
    user: USER,
    password: PASSWORD,
    token,
    repo: REPO,
    remoteUrl: buildRemoteUrl(token),
  };
  writeFileSync(stateFilePath(), JSON.stringify(state, null, 2));
}
