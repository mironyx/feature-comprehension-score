// Unit tests for GitHub App authentication helpers.
// Design reference: docs/design/lld-onboarding-auth-resolver.md §7

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import {
  createAppJwt,
  createInstallationToken,
  getInstallationToken,
  __resetInstallationTokenCache,
} from '@/lib/github/app-auth';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function decodeJwt(jwt: string): { header: Record<string, unknown>; payload: Record<string, unknown> } {
  const [h, p] = jwt.split('.');
  const pad = (s: string) => s + '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s: string) => Buffer.from(pad(s).replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString();
  return { header: JSON.parse(b64(h)), payload: JSON.parse(b64(p)) };
}

describe('createAppJwt', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GITHUB_APP_ID = '123456';
    process.env.GITHUB_APP_PRIVATE_KEY = privateKey;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('signs with RS256 and sets iss to GITHUB_APP_ID', () => {
    const now = () => 2_000_000_000_000;
    const jwt = createAppJwt(now);
    const { header, payload } = decodeJwt(jwt);
    expect(header.alg).toBe('RS256');
    expect(header.typ).toBe('JWT');
    expect(payload.iss).toBe('123456');
    expect(payload.iat).toBe(Math.floor(now() / 1000) - 60);
    expect(payload.exp).toBe(Math.floor(now() / 1000) + 540);

    // Verify the signature actually checks out against the public key.
    const [h, p, s] = jwt.split('.');
    const sig = Buffer.from(s.replaceAll('-', '+').replaceAll('_', '/'), 'base64');
    const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, sig);
    expect(ok).toBe(true);
  });

  it('throws if GITHUB_APP_PRIVATE_KEY is missing', () => {
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    expect(() => createAppJwt()).toThrow(/GITHUB_APP_PRIVATE_KEY/);
  });

  it(String.raw`handles \n-escaped private keys`, () => {
    process.env.GITHUB_APP_PRIVATE_KEY = privateKey.replaceAll('\n', String.raw`\n`);
    expect(() => createAppJwt()).not.toThrow();
  });
});

describe('createInstallationToken', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GITHUB_APP_ID = '123456';
    process.env.GITHUB_APP_PRIVATE_KEY = privateKey;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('POSTs to /app/installations/:id/access_tokens and returns token/expiry', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ token: 'ghs_abc', expires_at: '2030-01-01T00:00:00Z' }), {
        status: 201,
      }),
    );
    const result = await createInstallationToken(42, 'fake-jwt', fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ token: 'ghs_abc', expiresAt: '2030-01-01T00:00:00Z' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/app/installations/42/access_tokens',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer fake-jwt' }),
      }),
    );
  });

  it('throws on non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response('forbidden', { status: 403 }));
    await expect(
      createInstallationToken(42, 'fake-jwt', fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/403/);
  });
});

describe('getInstallationToken', () => {
  beforeEach(() => {
    __resetInstallationTokenCache();
  });

  it('mints a token on first call', async () => {
    const createToken = vi.fn(async () => ({ token: 't1', expiresAt: '2030-01-01T00:00:00Z' }));
    const token = await getInstallationToken(7, { createToken, now: () => 0 });
    expect(token).toBe('t1');
    expect(createToken).toHaveBeenCalledTimes(1);
  });

  it('reuses a cached token on the second call within TTL', async () => {
    const createToken = vi.fn(async () => ({ token: 't1', expiresAt: '2030-01-01T00:00:00Z' }));
    await getInstallationToken(7, { createToken, now: () => 0 });
    const token = await getInstallationToken(7, { createToken, now: () => 1000 });
    expect(token).toBe('t1');
    expect(createToken).toHaveBeenCalledTimes(1);
  });

  it('mints a fresh token after the cache TTL expires', async () => {
    const expiresAt = '2030-01-01T00:00:00Z';
    const expiresMs = Date.parse(expiresAt);
    let call = 0;
    const createToken = vi.fn(async () => {
      call += 1;
      return { token: `t${call}`, expiresAt };
    });
    await getInstallationToken(7, { createToken, now: () => 0 });
    // Move past (expiresMs - 5min margin) so the cache is considered stale.
    const token = await getInstallationToken(7, { createToken, now: () => expiresMs - 60_000 });
    expect(token).toBe('t2');
    expect(createToken).toHaveBeenCalledTimes(2);
  });
});
