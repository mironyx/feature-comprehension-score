// Tests for createGithubClient installation-token path (issue #192).
// Design reference: docs/design/lld-onboarding-auth-client-migration.md

import { describe, it, expect, vi } from 'vitest';
import { createGithubClient } from '@/lib/github/client';

describe('createGithubClient', () => {
  it('builds an Octokit authenticated with the installation token returned by getToken', async () => {
    const getToken = vi.fn().mockResolvedValue('tok_abc');

    const octokit = await createGithubClient(12345, { getToken });

    expect(getToken).toHaveBeenCalledWith(12345);
    // Probe the internal auth hook — Octokit exposes an auth() accessor that
    // returns the token string for a simple token auth strategy.
    const auth = (await (octokit.auth as () => Promise<{ token: string }>)()).token;
    expect(auth).toBe('tok_abc');
  });

  it('rethrows when getToken fails (no silent swallow)', async () => {
    const getToken = vi.fn().mockRejectedValue(new Error('installation token minting failed'));
    await expect(createGithubClient(7, { getToken })).rejects.toThrow('installation token minting failed');
  });
});
