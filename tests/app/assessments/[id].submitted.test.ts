// Tests for /assessments/[id]/submitted — confirmation page shown after answer submission.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.5
// Issue: #61

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/secret', () => ({
  createSecretSupabaseClient: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';
import { redirect } from 'next/navigation';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockCreateSecret = vi.mocked(createSecretSupabaseClient);
const mockRedirect = vi.mocked(redirect);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const USER_ID = 'user-001';
const ASSESSMENT_ID = 'assessment-001';

function makeAssessment() {
  return {
    id: ASSESSMENT_ID,
    feature_name: 'Scoring Engine',
    repositories: { github_repo_name: 'feature-comprehension-score' },
    organisations: { github_org_name: 'acme' },
  };
}

function makeParticipants(total: number, completed: number) {
  return Array.from({ length: total }, (_, i) => ({
    id: `p-${i}`,
    status: i < completed ? 'submitted' : 'pending',
    user_id: i === 0 ? USER_ID : `other-user-${i}`,
  }));
}

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

interface SecretClientOptions {
  assessment: object | null;
  participants: object[];
}

function makeSecretClient(opts: SecretClientOptions) {
  const { assessment, participants } = opts;
  return {
    from: vi.fn((table: string) => {
      if (table === 'assessments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: assessment,
                error: assessment ? null : { code: 'PGRST116', message: 'Not found' },
              }),
            }),
          }),
        };
      }
      if (table === 'assessment_participants') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: participants, error: null }),
          }),
        };
      }
      return {};
    }),
  };
}

function makeServerClient(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error('no session'),
      }),
    },
  };
}

function makeParams(id = ASSESSMENT_ID) {
  return Promise.resolve({ id });
}

const AUTHED_USER = { id: USER_ID };

async function arrange(opts: SecretClientOptions, user: { id: string } | null = AUTHED_USER) {
  mockCreateServer.mockResolvedValue(makeServerClient(user) as never);
  mockCreateSecret.mockReturnValue(makeSecretClient(opts) as never);
  const { default: SubmittedPage } = await import('@/app/(authenticated)/assessments/[id]/submitted/page');
  return SubmittedPage;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Assessment submitted confirmation page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Given an unauthenticated user', () => {
    it('then it redirects to /auth/sign-in', async () => {
      const SubmittedPage = await arrange({ assessment: null, participants: [] }, null);
      await expect(SubmittedPage({ params: makeParams() })).rejects.toThrow(
        'NEXT_REDIRECT:/auth/sign-in',
      );
      expect(mockRedirect).toHaveBeenCalledWith('/auth/sign-in');
    });
  });

  describe('Given an authenticated user after submission', () => {
    it('then it renders the confirmation page with participation progress', async () => {
      const SubmittedPage = await arrange({
        assessment: makeAssessment(),
        participants: makeParticipants(3, 2),
      });
      const result = await SubmittedPage({ params: makeParams() });
      expect(result).toBeTruthy();
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });
});
