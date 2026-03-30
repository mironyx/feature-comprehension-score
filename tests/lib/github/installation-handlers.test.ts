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

const REPO_A = { id: 1001, name: 'payments', full_name: 'acme-corp/payments' };
const REPO_B = { id: 1002, name: 'api', full_name: 'acme-corp/api' };
const REPOS = [REPO_A, REPO_B];

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
  repositories_added: [REPO_A],
  repositories_removed: [],
};

const reposRemovedPayload = {
  action: 'removed' as const,
  installation: { id: INSTALLATION_ID },
  repositories_added: [],
  repositories_removed: [REPO_B],
};

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

function makeMockSupabase(): SupabaseClient<Database> {
  const okResult = { error: null };

  const chain = (result: unknown): unknown =>
    Object.assign(Promise.resolve(result), {
      select: vi.fn(() => chain(result)),
      eq: vi.fn(() => chain(result)),
      in: vi.fn(() => Promise.resolve(result)),
      upsert: vi.fn(() => chain(okResult)),
      update: vi.fn(() => chain(okResult)),
      maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 'org-uuid' }, error: null })),
    });

  return {
    from: vi.fn(() => chain(okResult)),
    rpc: vi.fn(() => Promise.resolve({ data: 'org-uuid', error: null })),
  } as unknown as SupabaseClient<Database>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleInstallationCreated', () => {
  describe('Given a valid installation.created payload', () => {
    it('then calls the handle_installation_created RPC with correct params', async () => {
      const supabase = makeMockSupabase();
      await handleInstallationCreated(installationCreatedPayload, supabase);

      expect(supabase.rpc).toHaveBeenCalledWith('handle_installation_created', {
        p_github_org_id: ORG_ID,
        p_github_org_name: ORG_LOGIN,
        p_installation_id: INSTALLATION_ID,
        p_repos: [
          { id: REPO_A.id, full_name: REPO_A.full_name },
          { id: REPO_B.id, full_name: REPO_B.full_name },
        ],
      });
    });
  });

  describe('Given a payload with no repositories', () => {
    it('then passes an empty repos array to the RPC', async () => {
      const supabase = makeMockSupabase();
      const payload = { ...installationCreatedPayload, repositories: undefined };
      await handleInstallationCreated(payload, supabase);

      expect(supabase.rpc).toHaveBeenCalledWith('handle_installation_created', expect.objectContaining({
        p_repos: [],
      }));
    });
  });

  describe('Given the RPC returns an error', () => {
    it('then throws the error', async () => {
      const supabase = makeMockSupabase();
      (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: null,
        error: { message: 'DB error', code: '42P01' },
      });

      await expect(handleInstallationCreated(installationCreatedPayload, supabase))
        .rejects.toEqual(expect.objectContaining({ message: 'DB error' }));
    });
  });
});

describe('handleInstallationDeleted', () => {
  describe('Given a valid installation.deleted payload', () => {
    it('then sets the organisation status to inactive', async () => {
      const supabase = makeMockSupabase();
      await handleInstallationDeleted(installationDeletedPayload, supabase);

      const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls as [string][];
      const orgCall = fromCalls.find(([t]) => t === 'organisations');
      expect(orgCall).toBeDefined();
    });
  });
});

describe('handleRepositoriesAdded', () => {
  describe('Given an installation_repositories.added payload', () => {
    it('then calls the handle_repositories_added RPC', async () => {
      const supabase = makeMockSupabase();
      await handleRepositoriesAdded(reposAddedPayload, supabase);

      expect(supabase.rpc).toHaveBeenCalledWith('handle_repositories_added', {
        p_installation_id: INSTALLATION_ID,
        p_repos: [{ id: REPO_A.id, full_name: REPO_A.full_name }],
      });
    });
  });

  describe('Given an empty repositories_added array', () => {
    it('then does not call the RPC', async () => {
      const supabase = makeMockSupabase();
      const payload = { ...reposAddedPayload, repositories_added: [] };
      await handleRepositoriesAdded(payload, supabase);

      expect(supabase.rpc).not.toHaveBeenCalled();
    });
  });
});

describe('handleRepositoriesRemoved', () => {
  describe('Given an installation_repositories.removed payload', () => {
    it('then sets each removed repository status to inactive', async () => {
      const supabase = makeMockSupabase();
      await handleRepositoriesRemoved(reposRemovedPayload, supabase);

      const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls as [string][];
      const repoCalls = fromCalls.filter(([t]) => t === 'repositories');
      expect(repoCalls.length).toBeGreaterThan(0);
    });
  });
});
