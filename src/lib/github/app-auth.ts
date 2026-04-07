// GitHub App authentication — mint App JWTs and exchange them for installation access tokens.
// Design reference: docs/design/lld-onboarding-auth-resolver.md §5.1

import { createSign } from 'node:crypto';

const GITHUB_API = 'https://api.github.com';
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh 5 minutes before expiry

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/=+$/, '').replaceAll('+', '-').replaceAll('/', '_');
}

function loadPrivateKey(): string {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!raw) throw new Error('GITHUB_APP_PRIVATE_KEY is not set');
  return raw.replaceAll(String.raw`\n`, '\n');
}

function loadAppId(): string {
  const id = process.env.GITHUB_APP_ID;
  if (!id) throw new Error('GITHUB_APP_ID is not set');
  return id;
}

/** Mint a short-lived App JWT signed with GITHUB_APP_PRIVATE_KEY (RS256). */
export function createAppJwt(now: () => number = Date.now): string {
  const privateKey = loadPrivateKey();
  const appId = loadAppId();
  const iat = Math.floor(now() / 1000) - 60;
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iat, exp: iat + 600, iss: appId };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  return `${signingInput}.${base64url(signature)}`;
}

/** Exchange an App JWT for an installation access token. */
export async function createInstallationToken(
  installationId: number,
  appJwt?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ token: string; expiresAt: string }> {
  const jwt = appJwt ?? createAppJwt();
  const resp = await fetchImpl(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!resp.ok) {
    throw new Error(`GitHub installation token request failed: ${resp.status}`);
  }
  const body = (await resp.json()) as { token: string; expires_at: string };
  return { token: body.token, expiresAt: body.expires_at };
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

const tokenCache = new Map<number, CachedToken>();

/** Test-only: clear the in-memory installation token cache. */
export function __resetInstallationTokenCache(): void {
  tokenCache.clear();
}

/** Cached variant of createInstallationToken — reuses tokens until ~5 min before expiry. */
export async function getInstallationToken(
  installationId: number,
  deps: { createToken?: typeof createInstallationToken; now?: () => number } = {},
): Promise<string> {
  const now = deps.now ?? Date.now;
  const createToken = deps.createToken ?? createInstallationToken;
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAtMs - TOKEN_REFRESH_MARGIN_MS > now()) {
    return cached.token;
  }
  const { token, expiresAt } = await createToken(installationId);
  tokenCache.set(installationId, { token, expiresAtMs: Date.parse(expiresAt) });
  return token;
}
