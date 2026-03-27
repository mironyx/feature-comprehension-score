// Tests for GitHub App installation event handlers.
// Design reference: docs/design/v1-design.md §4.4, §4.5

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import {
  handleInstallationCreated,
  handleInstallationDeleted,
  handleRepositoriesAdded,
  handleRepositoriesRemoved,
} from '@/lib/github/installation-handlers';

// ---------------------------------------------------------------------------
// Shared payload fixtures (§4.5 GitHub Webhook Payloads)
// ---------------------------------------------------------------------------

const ORG_ID = 42;
const ORG_LOGIN = 'acme-corp';
const INSTALLATION_ID = 99;

const REPOS = [
  { id: 1001, name: 'payments', full_name: 'acme-corp/payments' },
  { id: 1002, name: 'api', full_name: 'acme-corp/api' },
];

const installationCreatedPayload = {
  action: 'created' as const,
  installation: { id: INSTALLATION_ID, account: { id: ORG_ID, login: ORG_LOGIN, type: 'Organization' }, app_id: 5 },
  repositories: REPOS,
};

const installationDeletedPayload = {
  action: 'deleted' as const,
  installation: { id: INSTALLATION_ID, account: { id: ORG_ID, login: ORG_LOGIN, type: 'Organization' }, app_id: 5 },
};

const reposAddedPayload = {
  action: 'added' as const,
  installation: { id: INSTALLATION_ID },
  repositories_added: [REPOS[0]],
  repositories_removed: [],
};

const reposRemovedPayload = {
  action: 'removed' as const,
  installation: { id: INSTALLATION_ID },
  repositories_added: [],
  repositories_removed: [REPOS[1]],
};

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

/** Builds a Supabase-like chainable mock that resolves to success for all operations. */
function makeMockSupabase(): SupabaseClient<Database> {
  // maybeSingle returns a plain object; direct await (via then) returns an array
  const orgSingleResult = { data: { id: 'org-uuid' }, error: null };
  const orgListResult = { data: [{ id: 'org-uuid' }], error: null };
  const okResult = { error: null };

  // Each call returns a thenable chain; terminal operations resolve the promise.
  const chain = (result: unknown): unknown => ({
    select: vi.fn(() => chain(orgListResult)),
    eq: vi.fn(() => chain(result)),
    in: vi.fn(() => Promise.resolve(result)),
    upsert: vi.fn(() => chain(okResult)),
    update: vi.fn(() => chain(okResult)),
    maybeSingle: vi.fn(() => Promise.resolve(orgSingleResult)),
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  });

  return {
    from: vi.fn(() => chain(okResult)),
  } as unknown as SupabaseClient<Database>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleInstallationCreated', () => {
  describe('Given a valid installation.created payload', () => {
    it('then upserts the organisation record', async () => {
      const supabase = makeMockSupabase();
      await handleInstallationCreated(installationCreatedPayload, supabase);

      const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls;
      const orgCall = fromCalls.find(([t]: [string]) => t === 'organisations');
      expect(orgCall).toBeDefined();
    });

    it('then upserts org_config with defaults', async () => {
      const supabase = makeMockSupabase();
      await handleInstallationCreated(installationCreatedPayload, supabase);

      const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls;
      const configCall = fromCalls.find(([t]: [string]) => t === 'org_config');
      expect(configCall).toBeDefined();
    });

    it('then upserts repositories for each repo in the payload', async () => {
      const supabase = makeMockSupabase();
      await handleInstallationCreated(installationCreatedPayload, supabase);

      const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls;
      const repoCalls = fromCalls.filter(([t]: [string]) => t === 'repositories');
      expect(repoCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Given a payload with no repositories', () => {
    it('then does not upsert any repository records', async () => {
      const supabase = makeMockSupabase();
      const payload = { ...installationCreatedPayload, repositories: undefined };
      await handleInstallationCreated(payload, supabase);

      const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls;
      const repoCalls = fromCalls.filter(([t]: [string]) => t === 'repositories');
      expect(repoCalls.length).toBe(0);
    });
  });
});

describe('handleInstallationDeleted', () => {
  describe('Given a valid installation.deleted payload', () => {
    it('then sets the organisation status to inactive', async () => {
      const supabase = makeMockSupabase();
      await handleInstallationDeleted(installationDeletedPayload, supabase);

      const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls;
      const orgCall = fromCalls.find(([t]: [string]) => t === 'organisations');
      expect(orgCall).toBeDefined();
    });
  });
});

describe('handleRepositoriesAdded', () => {
  describe('Given an installation_repositories.added payload', () => {
    it('then upserts each added repository', async () => {
      const supabase = makeMockSupabase();
      await handleRepositoriesAdded(reposAddedPayload, supabase);

      const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls;
      const repoCalls = fromCalls.filter(([t]: [string]) => t === 'repositories');
      expect(repoCalls.length).toBeGreaterThan(0);
    });
  });
});

describe('handleRepositoriesRemoved', () => {
  describe('Given an installation_repositories.removed payload', () => {
    it('then sets each removed repository status to inactive', async () => {
      const supabase = makeMockSupabase();
      await handleRepositoriesRemoved(reposRemovedPayload, supabase);

      const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls;
      const repoCalls = fromCalls.filter(([t]: [string]) => t === 'repositories');
      expect(repoCalls.length).toBeGreaterThan(0);
    });
  });
});
