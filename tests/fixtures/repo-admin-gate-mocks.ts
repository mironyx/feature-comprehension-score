// Shared fixtures for repo-admin-gate tests.
// Used by tests/lib/api/repo-admin-gate.test.ts and tests/evaluation/sign-in-snapshot-gate.eval.test.ts.

import { vi } from 'vitest';
import type { ApiContext } from '@/lib/api/context';

export const GATE_USER_ID = 'user-uuid-001';
export const GATE_ORG_ID = 'org-uuid-001';

export interface SupabaseMockRow {
  github_role: 'admin' | 'member';
  admin_repo_github_ids: number[];
}

/** Builds a minimal ApiContext whose supabase.from returns the given row (or null). */
export function makeCtx(row: SupabaseMockRow | null): ApiContext {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const eqUserId = vi.fn().mockReturnValue({ maybeSingle });
  const eqOrgId = vi.fn().mockReturnValue({ eq: eqUserId });
  const select = vi.fn().mockReturnValue({ eq: eqOrgId });
  const from = vi.fn().mockReturnValue({ select });

  return {
    supabase: { from } as unknown as ApiContext['supabase'],
    adminSupabase: {} as unknown as ApiContext['adminSupabase'],
    user: { id: GATE_USER_ID, email: 'alice@example.com', githubUserId: 42, githubUsername: 'alice' },
  };
}

/** Builds a ctx that returns a Supabase DB error. */
export function makeCtxWithError(message: string): ApiContext {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message } });
  const eqUserId = vi.fn().mockReturnValue({ maybeSingle });
  const eqOrgId = vi.fn().mockReturnValue({ eq: eqUserId });
  const select = vi.fn().mockReturnValue({ eq: eqOrgId });
  const from = vi.fn().mockReturnValue({ select });

  return {
    supabase: { from } as unknown as ApiContext['supabase'],
    adminSupabase: {} as unknown as ApiContext['adminSupabase'],
    user: { id: GATE_USER_ID, email: 'alice@example.com', githubUserId: 42, githubUsername: 'alice' },
  };
}
