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

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => ({
    type: 'a',
    props: { href, children, className },
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
const ORG_ID = 'org-001';
const ASSESSMENT_ID = 'assessment-001';
const PROJECT_ID = 'project-test-id';

function makeAssessment() {
  return {
    id: ASSESSMENT_ID,
    org_id: ORG_ID,
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
  orgMembership?: { github_role: string } | null;
}

function makeSecretClient(opts: SecretClientOptions) {
  const { assessment, participants, orgMembership = null } = opts;
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
      if (table === 'user_organisations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: orgMembership, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    }),
  };
}

function makeServerClient(user: { id: string } | null, projectName?: string) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error('no session'),
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: projectName !== undefined ? { name: projectName } : null,
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: ASSESSMENT_ID, project_id: PROJECT_ID },
              error: null,
            }),
          }),
        }),
      };
    }),
  };
}

function makeParams(projectId = PROJECT_ID, aid = ASSESSMENT_ID) {
  return Promise.resolve({ id: projectId, aid });
}

const AUTHED_USER = { id: USER_ID };

async function arrange(
  opts: SecretClientOptions,
  user: { id: string } | null = AUTHED_USER,
  projectName?: string,
) {
  mockCreateServer.mockResolvedValue(makeServerClient(user, projectName) as never);
  mockCreateSecret.mockReturnValue(makeSecretClient(opts) as never);
  const { default: SubmittedPage } = await import('@/app/(authenticated)/projects/[id]/assessments/[aid]/submitted/page');
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

  // ---------------------------------------------------------------------------
  // Breadcrumbs — Issue #446
  // Story 4.3: admin sees breadcrumb trail; member sees no breadcrumb
  // ---------------------------------------------------------------------------

  describe('Submitted page breadcrumbs', () => {
    // Property [#446, req §Story 4.3 AC2]: admin sees Projects > Project > Assessment #N > Submitted
    describe('Given the caller is an admin', () => {
      it('admin sees Projects > Project > Assessment #N > Submitted', async () => {
        const SubmittedPage = await arrange(
          {
            assessment: makeAssessment(),
            participants: makeParticipants(1, 1),
            orgMembership: { github_role: 'admin' },
          },
          AUTHED_USER,
          'Payments Service',
        );
        const element = await SubmittedPage({ params: makeParams() });
        const json = JSON.stringify(element);
        expect(json).toContain('"href":"/projects"');
        expect(json).toContain('"Payments Service"');
        expect(json).toContain(`"Assessment #${ASSESSMENT_ID}"`);
        expect(json).toContain('"label":"Submitted"');
      });
    });

    // Property [#446, req §Story 4.3 final clause]: member sees no breadcrumb component
    describe('Given the caller is a member (not admin)', () => {
      it('member sees no breadcrumb component', async () => {
        const SubmittedPage = await arrange({
          assessment: makeAssessment(),
          participants: makeParticipants(1, 1),
          orgMembership: null,
        });
        const element = await SubmittedPage({ params: makeParams() });
        const json = JSON.stringify(element);
        expect(json).not.toContain('"href":"/projects"');
      });
    });
  });
});
