// Tests for GitHub App installation event handlers.
// Design reference: docs/design/v1-design.md §4.4, §4.5

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import {
  handleInstallationCreated,
  handleInstallationDeleted,
  handleInstallationSuspended,
  handleRepositoriesAdded,
  handleRepositoriesRemoved,
  handleWebhookEvent,
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
    it('then calls the handle_installation_deleted RPC with the installation id', async () => {
      const supabase = makeMockSupabase();
      await handleInstallationDeleted(installationDeletedPayload, supabase);

      expect(supabase.rpc).toHaveBeenCalledWith('handle_installation_deleted', {
        p_installation_id: INSTALLATION_ID,
      });
    });

    it('then is idempotent when replayed (no throw, same RPC params)', async () => {
      const supabase = makeMockSupabase();
      await handleInstallationDeleted(installationDeletedPayload, supabase);
      await handleInstallationDeleted(installationDeletedPayload, supabase);

      const rpcMock = supabase.rpc as ReturnType<typeof vi.fn>;
      expect(rpcMock).toHaveBeenCalledTimes(2);
      expect(rpcMock).toHaveBeenNthCalledWith(1, 'handle_installation_deleted', { p_installation_id: INSTALLATION_ID });
      expect(rpcMock).toHaveBeenNthCalledWith(2, 'handle_installation_deleted', { p_installation_id: INSTALLATION_ID });
    });
  });

  describe('Given the RPC returns an error', () => {
    it('then throws the error', async () => {
      const supabase = makeMockSupabase();
      (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: null,
        error: { message: 'DB error', code: '42P01' },
      });

      await expect(handleInstallationDeleted(installationDeletedPayload, supabase))
        .rejects.toEqual(expect.objectContaining({ message: 'DB error' }));
    });
  });
});

describe('handleInstallationSuspended', () => {
  const suspendPayload = { action: 'suspend' as const, installation: { id: INSTALLATION_ID } };
  const unsuspendPayload = { action: 'unsuspend' as const, installation: { id: INSTALLATION_ID } };

  describe('Given a suspend payload', () => {
    it('then updates organisations.status to inactive for the installation', async () => {
      const supabase = makeMockSupabase();
      const updateSpy = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValueOnce({ update: updateSpy });

      await handleInstallationSuspended(suspendPayload, supabase);

      expect(supabase.from).toHaveBeenCalledWith('organisations');
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'inactive' }));
    });
  });

  describe('Given an unsuspend payload', () => {
    it('then updates organisations.status to active for the installation', async () => {
      const supabase = makeMockSupabase();
      const updateSpy = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValueOnce({ update: updateSpy });

      await handleInstallationSuspended(unsuspendPayload, supabase);

      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
    });
  });

  describe('Given the update returns an error', () => {
    it('then throws the error', async () => {
      const supabase = makeMockSupabase();
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: { message: 'update failed' } })) })),
      });

      await expect(handleInstallationSuspended(suspendPayload, supabase))
        .rejects.toEqual(expect.objectContaining({ message: 'update failed' }));
    });
  });

  describe('Given the same payload replayed', () => {
    it('then is idempotent (two update calls, no throw)', async () => {
      const supabase = makeMockSupabase();
      await handleInstallationSuspended(suspendPayload, supabase);
      await handleInstallationSuspended(suspendPayload, supabase);
      expect((supabase.from as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('handleWebhookEvent dispatch', () => {
  describe('Given an installation.created event', () => {
    it('then routes to handle_installation_created RPC', async () => {
      const supabase = makeMockSupabase();
      await handleWebhookEvent('installation', installationCreatedPayload as unknown as Record<string, unknown>, supabase);
      expect(supabase.rpc).toHaveBeenCalledWith('handle_installation_created', expect.any(Object));
    });
  });

  describe('Given an installation.deleted event', () => {
    it('then routes to handle_installation_deleted RPC', async () => {
      const supabase = makeMockSupabase();
      await handleWebhookEvent('installation', installationDeletedPayload as unknown as Record<string, unknown>, supabase);
      expect(supabase.rpc).toHaveBeenCalledWith('handle_installation_deleted', { p_installation_id: INSTALLATION_ID });
    });
  });

  describe('Given an installation.suspend event', () => {
    it('then routes to handleInstallationSuspended (organisations update)', async () => {
      const supabase = makeMockSupabase();
      await handleWebhookEvent('installation', { action: 'suspend', installation: { id: INSTALLATION_ID } }, supabase);
      expect(supabase.from).toHaveBeenCalledWith('organisations');
    });
  });

  describe('Given an installation_repositories.added event (regression for nested-if bug)', () => {
    it('then routes to handle_repositories_added RPC — NOT to installation.created', async () => {
      const supabase = makeMockSupabase();
      await handleWebhookEvent(
        'installation_repositories',
        reposAddedPayload as unknown as Record<string, unknown>,
        supabase,
      );
      expect(supabase.rpc).toHaveBeenCalledWith('handle_repositories_added', expect.any(Object));
      expect(supabase.rpc).not.toHaveBeenCalledWith('handle_installation_created', expect.any(Object));
    });
  });

  describe('Given an unknown event+action combination', () => {
    it('then does nothing (no rpc, no from)', async () => {
      const supabase = makeMockSupabase();
      await handleWebhookEvent('installation', { action: 'wat' }, supabase);
      expect(supabase.rpc).not.toHaveBeenCalled();
      expect(supabase.from).not.toHaveBeenCalled();
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
