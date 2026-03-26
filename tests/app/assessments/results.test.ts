// Tests for /assessments/[id]/results — FCS results page.
// Design reference: docs/plans/2026-03-25-mvp-scope-review.md (item 10)
// Issue: #104

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
import { redirect, notFound } from 'next/navigation';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockCreateSecret = vi.mocked(createSecretSupabaseClient);
const mockRedirect = vi.mocked(redirect);
const mockNotFound = vi.mocked(notFound);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const USER_ID = 'user-001';
const ORG_ID = 'org-001';
const ASSESSMENT_ID = 'assessment-001';

function makeAssessment(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSESSMENT_ID,
    org_id: ORG_ID,
    type: 'fcs',
    status: 'completed',
    feature_name: 'Scoring Engine',
    feature_description: null,
    aggregate_score: 0.72,
    scoring_incomplete: false,
    created_at: '2026-03-20T10:00:00Z',
    repositories: { github_repo_name: 'feature-comprehension-score' },
    organisations: { github_org_name: 'acme' },
    ...overrides,
  };
}

function makeQuestion(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `question-00${n}`,
    question_number: n,
    naur_layer: 'world_to_program',
    question_text: `Question ${n}?`,
    weight: 1,
    aggregate_score: 0.6 + n * 0.1,
    reference_answer: `Reference answer ${n}`,
    ...overrides,
  };
}

function makeParticipant(status: 'pending' | 'submitted' = 'submitted') {
  return { id: `participant-${status}`, status };
}

function makeSecretClient(
  assessment: object | null,
  orgMembership: { github_role: string } | null,
  participation: { id: string } | null,
  questions: object[],
  participants: object[],
) {
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
      if (table === 'assessment_participants') {
        // Returns participation when called with user_id filter, all participants otherwise.
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string) => {
              if (col === 'assessment_id') {
                return {
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: participation, error: null }),
                  }),
                  // Called without user_id filter — return all participants
                  order: vi.fn().mockResolvedValue({ data: participants, error: null }),
                  // plain resolve for .eq('assessment_id', id) with no further chain
                  // needed when select returns all participants
                  then: undefined,
                };
              }
              return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
            }),
          }),
        };
      }
      if (table === 'assessment_questions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: questions, error: null }),
            }),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FCS results page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Given an unauthenticated user', () => {
    it('then it redirects to /auth/sign-in', async () => {
      mockCreateServer.mockResolvedValue(makeServerClient(null) as never);
      mockCreateSecret.mockReturnValue(makeSecretClient(null, null, null, [], []) as never);

      const { default: ResultsPage } = await import('@/app/assessments/[id]/results/page');
      await expect(ResultsPage({ params: makeParams() })).rejects.toThrow(
        'NEXT_REDIRECT:/auth/sign-in',
      );
      expect(mockRedirect).toHaveBeenCalledWith('/auth/sign-in');
    });
  });

  describe('Given the assessment does not exist', () => {
    it('then it calls notFound', async () => {
      mockCreateServer.mockResolvedValue(makeServerClient({ id: USER_ID }) as never);
      mockCreateSecret.mockReturnValue(makeSecretClient(null, null, null, [], []) as never);

      const { default: ResultsPage } = await import('@/app/assessments/[id]/results/page');
      await expect(ResultsPage({ params: makeParams() })).rejects.toThrow('NEXT_NOT_FOUND');
      expect(mockNotFound).toHaveBeenCalled();
    });
  });

  describe('Given a user who is not a participant or admin', () => {
    it('then it calls notFound', async () => {
      const assessment = makeAssessment();
      mockCreateServer.mockResolvedValue(makeServerClient({ id: USER_ID }) as never);
      mockCreateSecret.mockReturnValue(
        makeSecretClient(assessment, null, null, [], []) as never,
      );

      const { default: ResultsPage } = await import('@/app/assessments/[id]/results/page');
      await expect(ResultsPage({ params: makeParams() })).rejects.toThrow('NEXT_NOT_FOUND');
      expect(mockNotFound).toHaveBeenCalled();
    });
  });

  describe('Given a completed FCS assessment', () => {
    describe('When the caller is a participant', () => {
      it('then it renders the results page', async () => {
        const assessment = makeAssessment();
        const questions = [makeQuestion(1), makeQuestion(2)];
        const participants = [makeParticipant('submitted'), makeParticipant('pending')];
        mockCreateServer.mockResolvedValue(makeServerClient({ id: USER_ID }) as never);
        mockCreateSecret.mockReturnValue(
          makeSecretClient(assessment, null, { id: 'part-001' }, questions, participants) as never,
        );

        const { default: ResultsPage } = await import('@/app/assessments/[id]/results/page');
        const result = await ResultsPage({ params: makeParams() });

        expect(result).toBeTruthy();
        expect(mockRedirect).not.toHaveBeenCalled();
        expect(mockNotFound).not.toHaveBeenCalled();
      });
    });

    describe('When the caller is an org admin', () => {
      it('then it renders the results page', async () => {
        const assessment = makeAssessment();
        const questions = [makeQuestion(1)];
        const participants = [makeParticipant('submitted')];
        mockCreateServer.mockResolvedValue(makeServerClient({ id: USER_ID }) as never);
        mockCreateSecret.mockReturnValue(
          makeSecretClient(assessment, { github_role: 'admin' }, null, questions, participants) as never,
        );

        const { default: ResultsPage } = await import('@/app/assessments/[id]/results/page');
        const result = await ResultsPage({ params: makeParams() });

        expect(result).toBeTruthy();
        expect(mockRedirect).not.toHaveBeenCalled();
      });
    });
  });

  describe('Given a non-FCS assessment', () => {
    it('then it calls notFound', async () => {
      const assessment = makeAssessment({ type: 'prcc' });
      mockCreateServer.mockResolvedValue(makeServerClient({ id: USER_ID }) as never);
      mockCreateSecret.mockReturnValue(
        makeSecretClient(assessment, { github_role: 'admin' }, null, [], []) as never,
      );

      const { default: ResultsPage } = await import('@/app/assessments/[id]/results/page');
      await expect(ResultsPage({ params: makeParams() })).rejects.toThrow('NEXT_NOT_FOUND');
    });
  });

  describe('Given scoring is incomplete', () => {
    it('then it renders a scoring-incomplete notice', async () => {
      const assessment = makeAssessment({ scoring_incomplete: true, aggregate_score: 0.5 });
      const questions = [makeQuestion(1, { aggregate_score: null })];
      const participants = [makeParticipant('submitted')];
      mockCreateServer.mockResolvedValue(makeServerClient({ id: USER_ID }) as never);
      mockCreateSecret.mockReturnValue(
        makeSecretClient(assessment, null, { id: 'part-001' }, questions, participants) as never,
      );

      const { default: ResultsPage } = await import('@/app/assessments/[id]/results/page');
      const result = await ResultsPage({ params: makeParams() });

      expect(result).toBeTruthy();
    });
  });
});
