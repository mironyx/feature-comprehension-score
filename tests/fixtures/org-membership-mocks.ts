// Shared fixtures for resolveUserOrgsViaApp tests.
// Used by both the main unit suite (tests/lib/supabase/org-membership.test.ts)
// and the adversarial evaluation suite (tests/evaluation/onboarding-auth-resolver.eval.test.ts).
// Keep new tests reusing these helpers rather than re-declaring mock Supabase chains.

import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import type { ResolveUserOrgsInput } from '@/lib/supabase/org-membership';

export type OrgRow = Database['public']['Tables']['organisations']['Row'];
export type UserOrgRow = Database['public']['Tables']['user_organisations']['Row'];

export const INPUT: ResolveUserOrgsInput = {
  userId: 'user-1',
  githubUserId: 42,
  githubLogin: 'alice',
};

export function makeOrg(overrides: Partial<OrgRow> = {}): OrgRow {
  return {
    id: 'org-1',
    github_org_id: 1001,
    github_org_name: 'acme',
    installation_id: 9001,
    installer_github_user_id: null,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeUserOrg(overrides: Partial<UserOrgRow> = {}): UserOrgRow {
  return {
    id: 'uo-1',
    user_id: INPUT.userId,
    org_id: 'org-1',
    github_user_id: INPUT.githubUserId,
    github_username: INPUT.githubLogin,
    github_role: 'member',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export interface MockClientOptions {
  installedOrgs: OrgRow[];
  finalUserOrgs: UserOrgRow[];
  orgQueryError?: { message: string };
  upsertError?: { message: string };
  deleteError?: { message: string };
  installerOrgs?: OrgRow[];
  userOrgCount?: number;
}

export function buildMockClient(opts: MockClientOptions) {
  const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: opts.upsertError ?? null });

  const notSpy = vi.fn().mockResolvedValue({ data: null, error: opts.deleteError ?? null });
  const eqDelete = Object.assign(
    Promise.resolve({ data: null, error: opts.deleteError ?? null }),
    { not: notSpy },
  );
  const deleteChain = { eq: vi.fn().mockReturnValue(eqDelete) };
  const deleteSpy = vi.fn().mockReturnValue(deleteChain);

  const selectFinal = {
    eq: vi.fn().mockResolvedValue({ data: opts.finalUserOrgs, error: null }),
  };

  // Main org query chain: .select(...).eq('status', 'active')
  const orgsSelectChain = {
    eq: vi.fn().mockResolvedValue({
      data: opts.orgQueryError ? null : opts.installedOrgs,
      error: opts.orgQueryError ?? null,
    }),
  };

  // First-install-race fallback chain: .eq(...).gte(...).eq(...)
  const installerChain = {
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
  };
  // Final .eq('status', 'active') in the chain resolves the promise
  let installerCallCount = 0;
  installerChain.eq.mockImplementation(() => {
    installerCallCount++;
    // The 2nd .eq() call is the terminal one (.eq('status', 'active'))
    if (installerCallCount >= 2) {
      return Promise.resolve({
        data: opts.installerOrgs ?? [],
        error: null,
      });
    }
    return installerChain;
  });

  // Count query for user_organisations: .select('*', { count, head }).eq('org_id', ...)
  const countChain = {
    eq: vi.fn().mockResolvedValue({
      count: opts.userOrgCount ?? 0,
      data: null,
      error: null,
    }),
  };

  let orgSelectCallCount = 0;
  const fromSpy = vi.fn((table: string) => {
    if (table === 'organisations') {
      orgSelectCallCount++;
      // First call: matchOrgsForUser; subsequent: findFirstInstallAsInstaller
      if (orgSelectCallCount === 1) {
        return { select: vi.fn().mockReturnValue(orgsSelectChain) };
      }
      return { select: vi.fn().mockReturnValue(installerChain) };
    }
    if (table === 'user_organisations') {
      return {
        upsert: upsertSpy,
        delete: deleteSpy,
        select: vi.fn((...args: unknown[]) => {
          const firstArg = args[1] as Record<string, unknown> | undefined;
          if (firstArg && 'head' in firstArg) return countChain;
          return selectFinal;
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  const client = { from: fromSpy } as unknown as SupabaseClient<Database>;
  return { client, upsertSpy, deleteSpy, notSpy };
}

export function membershipResponse(role: 'admin' | 'member'): Response {
  return new Response(JSON.stringify({ role }), { status: 200 });
}
