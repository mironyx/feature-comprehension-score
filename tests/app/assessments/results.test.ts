// Tests for /assessments/[id]/results — FCS results page.
// Design reference: docs/plans/2026-03-25-mvp-scope-review.md (item 10)
// Issue: #104, #109

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

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

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

interface SecretClientOptions {
  assessment: object | null;
  orgMembership: { github_role: string } | null;
  participation: { id: string } | null;
  questions: object[];
  participants: object[];
}

function makeSecretClient(opts: SecretClientOptions) {
  const { assessment, orgMembership, participation, questions, participants } = opts;
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
        // Handles both:
        //   participant-lookup: .eq('assessment_id').eq('user_id').maybeSingle()
        //   all-participants:   .eq('assessment_id')   (awaited directly — thenable)
        const allParticipantsResult = Object.assign(
          Promise.resolve({ data: participants, error: null }),
          {
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: participation, error: null }),
            }),
          },
        );
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string) => {
              if (col === 'assessment_id') return allParticipantsResult;
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

const AUTHED_USER = { id: USER_ID };

/** Sets up mocks and imports the page component. Reduces per-test boilerplate. */
async function arrange(opts: SecretClientOptions, user: { id: string } | null = AUTHED_USER) {
  mockCreateServer.mockResolvedValue(makeServerClient(user) as never);
  mockCreateSecret.mockReturnValue(makeSecretClient(opts) as never);
  const { default: ResultsPage } = await import('@/app/assessments/[id]/results/page');
  return ResultsPage;
}

/** Arranges mocks, renders the page, and returns HTML. Eliminates repetition in gate tests. */
async function renderPage(opts: SecretClientOptions) {
  const ResultsPage = await arrange(opts);
  const element = await ResultsPage({ params: makeParams() });
  return renderToStaticMarkup(element);
}

const emptyClient: SecretClientOptions = {
  assessment: null,
  orgMembership: null,
  participation: null,
  questions: [],
  participants: [],
};

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
      const ResultsPage = await arrange(emptyClient, null);
      await expect(ResultsPage({ params: makeParams() })).rejects.toThrow(
        'NEXT_REDIRECT:/auth/sign-in',
      );
      expect(mockRedirect).toHaveBeenCalledWith('/auth/sign-in');
    });
  });

  describe('Given the assessment does not exist', () => {
    it('then it calls notFound', async () => {
      const ResultsPage = await arrange(emptyClient);
      await expect(ResultsPage({ params: makeParams() })).rejects.toThrow('NEXT_NOT_FOUND');
      expect(mockNotFound).toHaveBeenCalled();
    });
  });

  describe('Given a user who is not a participant or admin', () => {
    it('then it calls notFound', async () => {
      const ResultsPage = await arrange({ ...emptyClient, assessment: makeAssessment() });
      await expect(ResultsPage({ params: makeParams() })).rejects.toThrow('NEXT_NOT_FOUND');
      expect(mockNotFound).toHaveBeenCalled();
    });
  });

  describe('Given a completed FCS assessment', () => {
    it.each([
      ['participant', null,                          { id: 'part-001' }] as const,
      ['org admin',  { github_role: 'admin' as const }, null           ] as const,
    ])('When the caller is a %s, then it renders the results page',
      async (_label, orgMembership, participation) => {
        const ResultsPage = await arrange({
          assessment: makeAssessment(),
          orgMembership,
          participation,
          questions: [makeQuestion(1)],
          participants: [makeParticipant('submitted')],
        });
        const result = await ResultsPage({ params: makeParams() });
        expect(result).toBeTruthy();
        expect(mockRedirect).not.toHaveBeenCalled();
        expect(mockNotFound).not.toHaveBeenCalled();
      },
    );
  });

  describe('Given a non-FCS assessment', () => {
    it('then it calls notFound', async () => {
      const ResultsPage = await arrange({
        ...emptyClient,
        assessment: makeAssessment({ type: 'prcc' }),
        orgMembership: { github_role: 'admin' },
      });
      await expect(ResultsPage({ params: makeParams() })).rejects.toThrow('NEXT_NOT_FOUND');
    });
  });

  describe('Given scoring is incomplete', () => {
    it('then it renders a scoring-incomplete notice', async () => {
      const html = await renderPage({
        assessment: makeAssessment({ scoring_incomplete: true, aggregate_score: 0.5 }),
        orgMembership: null,
        participation: { id: 'part-001' },
        questions: [makeQuestion(1, { aggregate_score: null })],
        participants: [makeParticipant('submitted')],
      });

      expect(html).toContain('scoring incomplete');
    });
  });

  describe('Reference answer gate', () => {
    const SUBMITTED_ONE = [makeParticipant('submitted')];
    const INCOMPLETE = [makeParticipant('submitted'), makeParticipant('pending')];

    describe('Given all participants have submitted and scoring is complete', () => {
      it('then reference answers are visible', async () => {
        const html = await renderPage({
          assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
          orgMembership: null,
          participation: { id: 'part-001' },
          questions: [makeQuestion(1)],
          participants: SUBMITTED_ONE,
        });

        expect(html).toContain('Reference answer 1');
        expect(html).not.toContain('Reference answers will be visible');
      });
    });

    describe('Given not all participants have submitted', () => {
      it('then reference answers are withheld and a message is shown', async () => {
        const html = await renderPage({
          assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
          orgMembership: null,
          participation: { id: 'part-001' },
          questions: [makeQuestion(1)],
          participants: INCOMPLETE,
        });

        expect(html).not.toContain('Reference answer 1');
        expect(html).toContain('Reference answers will be visible');
      });
    });

    describe('Given aggregate_score is null', () => {
      it('then reference answers are withheld', async () => {
        const html = await renderPage({
          assessment: makeAssessment({ aggregate_score: null, scoring_incomplete: false }),
          orgMembership: null,
          participation: { id: 'part-001' },
          questions: [makeQuestion(1)],
          participants: SUBMITTED_ONE,
        });

        expect(html).not.toContain('Reference answer 1');
        expect(html).toContain('Reference answers will be visible');
      });
    });

    describe('Given scoring_incomplete is true', () => {
      it('then reference answers are withheld', async () => {
        const html = await renderPage({
          assessment: makeAssessment({ aggregate_score: 0.5, scoring_incomplete: true }),
          orgMembership: null,
          participation: { id: 'part-001' },
          questions: [makeQuestion(1)],
          participants: SUBMITTED_ONE,
        });

        expect(html).not.toContain('Reference answer 1');
        expect(html).toContain('Reference answers will be visible');
      });
    });

    describe('Given org admin with incomplete submission', () => {
      it('then reference answers are withheld (no admin bypass)', async () => {
        const html = await renderPage({
          assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
          orgMembership: { github_role: 'admin' },
          participation: null,
          questions: [makeQuestion(1)],
          participants: INCOMPLETE,
        });

        expect(html).not.toContain('Reference answer 1');
        expect(html).toContain('Reference answers will be visible');
      });
    });
  });
});
