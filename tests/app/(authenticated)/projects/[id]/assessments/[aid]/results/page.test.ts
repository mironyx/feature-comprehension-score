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
const PROJECT_ID = 'project-test-id';

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
    hint: null,
    ...overrides,
  };
}

function makeParticipant(status: 'pending' | 'submitted' = 'submitted') {
  return { id: `participant-${status}`, status };
}

function makeMyAnswer(questionId: string, overrides: Record<string, unknown> = {}) {
  return {
    question_id: questionId,
    answer_text: `My answer for ${questionId}`,
    score: 0.72,
    score_rationale: 'Good understanding of the concept.',
    ...overrides,
  };
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

interface ServerClientOptions {
  /** Authenticated user, or null for unauthenticated. */
  user: { id: string } | null;
  /**
   * Rows returned from `participant_answers` when queried via the user-scoped
   * client. Only relevant for participant self-view paths. Defaults to [].
   */
  participantAnswers?: object[];
}

/**
 * Builds a mock for `createServerSupabaseClient`.
 *
 * Extended in #297 to support `participant_answers` queries (RLS-enforced
 * self-view data). The server client is the user-scoped client — it must NOT
 * be the admin/secret client (invariant I4).
 */
function makeServerClient(userOrOpts: { id: string } | null | ServerClientOptions) {
  // Accept both the old signature (user directly) and the new options object.
  let user: { id: string } | null;
  let participantAnswers: object[];

  if (userOrOpts === null || (userOrOpts !== null && 'id' in (userOrOpts ?? {}))) {
    user = userOrOpts as { id: string } | null;
    participantAnswers = [];
  } else {
    const opts = userOrOpts as ServerClientOptions;
    user = opts.user;
    participantAnswers = opts.participantAnswers ?? [];
  }

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error('no session'),
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'participant_answers') {
        // Chain: .eq('assessment_id').eq('participant_id').eq('is_reassessment').order(...)
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: participantAnswers, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      // Guard query: assessments.select('id, project_id').eq('id', aid).maybeSingle()
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

/** Sets up mocks and imports the page component. Reduces per-test boilerplate. */
async function arrange(
  opts: SecretClientOptions,
  userOrServerOpts: { id: string } | null | ServerClientOptions = AUTHED_USER,
) {
  mockCreateServer.mockResolvedValue(makeServerClient(userOrServerOpts) as never);
  mockCreateSecret.mockReturnValue(makeSecretClient(opts) as never);
  const { default: ResultsPage } = await import('@/app/(authenticated)/projects/[id]/assessments/[aid]/results/page');
  return ResultsPage;
}

/** Arranges mocks, renders the page, and returns HTML. Eliminates repetition in gate tests. */
async function renderPage(
  opts: SecretClientOptions,
  serverOpts?: ServerClientOptions,
) {
  const ResultsPage = await arrange(opts, serverOpts ?? AUTHED_USER);
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
      // Scoring-incomplete notice is part of the admin aggregate view.
      // Switched to admin role in #297 (role-based view separation).
      const html = await renderPage({
        assessment: makeAssessment({ scoring_incomplete: true, aggregate_score: 0.5 }),
        orgMembership: { github_role: 'admin' },
        participation: null,
        questions: [makeQuestion(1, { aggregate_score: null })],
        participants: [makeParticipant('submitted')],
      });

      expect(html).toContain('scoring incomplete');
    });
  });

  // -------------------------------------------------------------------------
  // Per-question failure indicator — Issue #213
  // -------------------------------------------------------------------------

  describe('Per-question failure indicator', () => {
    type IndicatorCase = [label: string, opts: SecretClientOptions, expectIndicator: boolean];

    it.each<IndicatorCase>([
      // Property 1 [issue]: per-question failure label visible when scoring_incomplete AND aggregate_score === null
      // Switched to admin role in #297 — per-question aggregate indicator is admin-view content.
      ['scoring_incomplete=true, null score → shows indicator', {
        assessment: makeAssessment({ scoring_incomplete: true, aggregate_score: 0.5 }),
        orgMembership: { github_role: 'admin' },
        participation: null,
        questions: [makeQuestion(1, { aggregate_score: null })],
        participants: [makeParticipant('submitted')],
      }, true],
      // Property 2 [issue]: no per-question indicator when scoring_incomplete === false
      // Switched to admin role in #297.
      ['scoring_incomplete=false, null score → no indicator', {
        assessment: makeAssessment({ scoring_incomplete: false, aggregate_score: null }),
        orgMembership: { github_role: 'admin' },
        participation: null,
        questions: [makeQuestion(1, { aggregate_score: null })],
        participants: [makeParticipant('submitted')],
      }, false],
      // Property 3 [issue]: scoring_incomplete flag alone must not trigger per-question label
      // Switched to admin role in #297.
      ['scoring_incomplete=true, all scored → no indicator', {
        assessment: makeAssessment({ scoring_incomplete: true, aggregate_score: 0.5 }),
        orgMembership: { github_role: 'admin' },
        participation: null,
        questions: [makeQuestion(1), makeQuestion(2)],
        participants: [makeParticipant('submitted')],
      }, false],
    ])('Given %s', async (_label, opts, expectIndicator) => {
      const html = await renderPage(opts);
      if (expectIndicator) {
        expect(html).toContain('Unable to score');
      } else {
        expect(html).not.toContain('Unable to score');
      }
    });
  });

  describe('Given scoring_incomplete is true and only some questions have null aggregate_score', () => {
    it('then it renders a failure indicator only for the unscored questions', async () => {
      // Property 4 [issue]: per-question indicator is scoped to the specific question(s)
      // with null aggregate_score; scored questions must not show it.
      // Switched to admin role in #297 — per-question aggregate indicator is admin-view content.
      const html = await renderPage({
        assessment: makeAssessment({ scoring_incomplete: true, aggregate_score: 0.6 }),
        orgMembership: { github_role: 'admin' },
        participation: null,
        questions: [
          makeQuestion(1),                           // scored — should NOT show indicator
          makeQuestion(2, { aggregate_score: null }), // unscored — SHOULD show indicator
        ],
        participants: [makeParticipant('submitted')],
      });

      // Verify the indicator is present for the failing question
      expect(html).toContain('Unable to score');

      // Verify Q1 (scored) does not carry the indicator. Check that the indicator
      // does not appear in the neighbourhood of Q1's question text. We do this by
      // asserting the HTML does NOT contain both Q1 text and the indicator label
      // fused together — the simplest available check given server-rendered flat HTML.
      // A more targeted assertion: count occurrences should equal 1 (one per null question).
      const occurrences = (html.match(/Unable to score/g) ?? []).length;
      expect(occurrences).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Hint display — Issue #221 (Story 1.3)
  // -------------------------------------------------------------------------

  describe('Hint display', () => {
    describe('Given a question with a non-null hint', () => {
      it('then displays hint text alongside the question', async () => {
        // Property 9 [lld §Story 1.3, AC #8]: hint text is rendered alongside question text
        const html = await renderPage({
          assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
          orgMembership: null,
          participation: { id: 'part-001' },
          questions: [makeQuestion(1, { hint: 'Describe the key design trade-offs in 2–3 sentences.' })],
          participants: [makeParticipant('submitted')],
        });
        expect(html).toContain('Describe the key design trade-offs in 2–3 sentences.');
      });
    });

    describe('Given a question with a null hint', () => {
      it('then renders no hint text for that question', async () => {
        // Property 10 [lld §Story 1.3, invariant #3]: null hint → no hint element rendered
        const SENTINEL = 'HINT_SENTINEL_TEXT_THAT_SHOULD_NOT_APPEAR';
        const html = await renderPage({
          assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
          orgMembership: null,
          participation: { id: 'part-001' },
          questions: [makeQuestion(1, { hint: null })],
          participants: [makeParticipant('submitted')],
        });
        // The question text itself is present — the page renders
        expect(html).toContain('Question 1?');
        // No sentinel hint text appears
        expect(html).not.toContain(SENTINEL);
      });
    });

    describe('Given multiple questions where only some have hints', () => {
      it('then each question hint is scoped to its own question', async () => {
        // Property 11 [lld §Story 1.3]: hint is per-question; absence on one must not bleed to others
        const html = await renderPage({
          assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
          orgMembership: null,
          participation: { id: 'part-001' },
          questions: [
            makeQuestion(1, { hint: 'Hint for question one only.' }),
            makeQuestion(2, { hint: null }),
          ],
          participants: [makeParticipant('submitted')],
        });
        // Q1 hint is present
        expect(html).toContain('Hint for question one only.');
        // Q2 has no hint — verify the hint only appears once (not duplicated to Q2)
        const occurrences = (html.match(/Hint for question one only\./g) ?? []).length;
        expect(occurrences).toBe(1);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Comprehension depth display — Issue #225 (Story 2.4)
  // -------------------------------------------------------------------------

  describe('Comprehension depth display', () => {
    const CONCEPTUAL_NOTE =
      'This assessment measured reasoning and design understanding. Participants were not expected to recall specific code identifiers.';
    const DETAILED_NOTE =
      'This assessment measured detailed implementation knowledge including specific types, files, and function signatures.';

    const BASE_DEPTH: SecretClientOptions = {
      assessment: makeAssessment({ config_comprehension_depth: 'conceptual' }),
      orgMembership: null,
      participation: { id: 'part-001' },
      questions: [makeQuestion(1)],
      participants: [makeParticipant('submitted')],
    };

    // Property 1 [lld §Story 2.4, AC 8 / BDD]: badge shows "Depth: Conceptual" for conceptual depth
    it('displays "Depth: Conceptual" badge when config_comprehension_depth is "conceptual"', async () => {
      const html = await renderPage({
        ...BASE_DEPTH,
        assessment: makeAssessment({ config_comprehension_depth: 'conceptual' }),
      });
      expect(html).toContain('Depth: Conceptual');
    });

    // Property 2 [lld §Story 2.4 BDD]: badge shows "Depth: Detailed" for detailed depth
    it('displays "Depth: Detailed" badge when config_comprehension_depth is "detailed"', async () => {
      const html = await renderPage({
        ...BASE_DEPTH,
        assessment: makeAssessment({ config_comprehension_depth: 'detailed' }),
      });
      expect(html).toContain('Depth: Detailed');
    });

    // Property 3 [lld §Story 2.4 DEPTH_NOTES]: conceptual contextual note present for conceptual depth
    it('displays the conceptual contextual note when config_comprehension_depth is "conceptual"', async () => {
      const html = await renderPage({
        ...BASE_DEPTH,
        assessment: makeAssessment({ config_comprehension_depth: 'conceptual' }),
      });
      expect(html).toContain(CONCEPTUAL_NOTE);
    });

    // Property 4 [lld §Story 2.4 DEPTH_NOTES]: detailed contextual note present for detailed depth
    it('displays the detailed contextual note when config_comprehension_depth is "detailed"', async () => {
      const html = await renderPage({
        ...BASE_DEPTH,
        assessment: makeAssessment({ config_comprehension_depth: 'detailed' }),
      });
      expect(html).toContain(DETAILED_NOTE);
    });

    // Property 5 [lld §Story 2.4 BDD, invariant #2]: defaults to conceptual badge when field is null
    it('displays "Depth: Conceptual" badge when config_comprehension_depth is null', async () => {
      const html = await renderPage({
        ...BASE_DEPTH,
        assessment: makeAssessment({ config_comprehension_depth: null }),
      });
      expect(html).toContain('Depth: Conceptual');
    });

    // Property 6 [lld §Story 2.4 BDD, invariant #2]: defaults to conceptual note when field is null
    it('displays the conceptual contextual note when config_comprehension_depth is null', async () => {
      const html = await renderPage({
        ...BASE_DEPTH,
        assessment: makeAssessment({ config_comprehension_depth: null }),
      });
      expect(html).toContain(CONCEPTUAL_NOTE);
    });

    // Property 7 [lld §Story 2.4, task brief invariant]: "Detailed" label/note absent when depth is conceptual
    it('does not display "Depth: Detailed" or the detailed note when depth is "conceptual"', async () => {
      const html = await renderPage({
        ...BASE_DEPTH,
        assessment: makeAssessment({ config_comprehension_depth: 'conceptual' }),
      });
      expect(html).not.toContain('Depth: Detailed');
      expect(html).not.toContain(DETAILED_NOTE);
    });

    // Property 8 [lld §Story 2.4, task brief invariant]: "Conceptual" label/note absent when depth is detailed
    it('does not display "Depth: Conceptual" or the conceptual note when depth is "detailed"', async () => {
      const html = await renderPage({
        ...BASE_DEPTH,
        assessment: makeAssessment({ config_comprehension_depth: 'detailed' }),
      });
      expect(html).not.toContain('Depth: Conceptual');
      expect(html).not.toContain(CONCEPTUAL_NOTE);
    });
  });

  describe('Reference answer gate', () => {
    const SUBMITTED_ONE = [makeParticipant('submitted')];
    const INCOMPLETE = [makeParticipant('submitted'), makeParticipant('pending')];
    // BASE uses admin role — reference answers are admin-view content.
    // Switched from participant-only in #297 (role-based view separation).
    const BASE: SecretClientOptions = {
      assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
      orgMembership: { github_role: 'admin' },
      participation: null,
      questions: [makeQuestion(1)],
      participants: SUBMITTED_ONE,
    };

    type GateCase = [label: string, opts: SecretClientOptions, expectVisible: boolean];

    it.each<GateCase>([
      ['admin, all submitted and scoring complete → visible', BASE, true],
      ['admin, not all participants submitted → withheld', { ...BASE, participants: INCOMPLETE }, false],
      ['admin, aggregate_score is null → withheld', { ...BASE, assessment: makeAssessment({ aggregate_score: null, scoring_incomplete: false }) }, false],
      ['admin, scoring_incomplete is true → withheld', { ...BASE, assessment: makeAssessment({ aggregate_score: 0.5, scoring_incomplete: true }) }, false],
      ['admin with incomplete submission → withheld (no bypass)', { ...BASE, participants: INCOMPLETE }, false],
    ])('Given %s', async (_label, opts, expectVisible) => {
      const html = await renderPage(opts);
      if (expectVisible) {
        expect(html).toContain('Reference answer 1');
        expect(html).not.toContain('Reference answers will be visible');
      } else {
        expect(html).not.toContain('Reference answer 1');
        expect(html).toContain('Reference answers will be visible');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Role-based view separation — Issue #297
  // LLD §3, Stories 3.4 / 6.2, ADR-0005
  // ---------------------------------------------------------------------------

  describe('Given a viewer who is admin only (not a participant)', () => {
    const ADMIN_ONLY_OPTS: SecretClientOptions = {
      assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
      orgMembership: { github_role: 'admin' },
      participation: null,
      questions: [makeQuestion(1), makeQuestion(2)],
      participants: [makeParticipant('submitted')],
    };

    // Property 1 [lld §3, req §Story 3.4]: admin sees aggregate comprehension score
    it('then the aggregate comprehension score section is rendered', async () => {
      const html = await renderPage(ADMIN_ONLY_OPTS);
      expect(html).toContain('Comprehension Score');
    });

    // Property 2 [lld §3, req §Story 3.4]: admin sees per-question aggregate scores
    it('then per-question aggregate scores are rendered', async () => {
      const html = await renderPage(ADMIN_ONLY_OPTS);
      // toPercent(0.7) = "70%" and toPercent(0.8) = "80%" (makeQuestion scores)
      expect(html).toContain('Aggregate score:');
    });

    // Property 3 [lld §3 I1, req §Story 3.4, ADR-0005]: admin does NOT see a "My Scores" section
    it('then no "My Scores" section is rendered', async () => {
      const html = await renderPage(ADMIN_ONLY_OPTS);
      expect(html).not.toContain('My Scores');
    });
  });

  describe('Given a viewer who is participant only (not an admin)', () => {
    const Q1 = makeQuestion(1, { naur_layer: 'design_justification' });
    const Q2 = makeQuestion(2, { naur_layer: 'modification_capacity' });

    const PARTICIPANT_ONLY_OPTS: SecretClientOptions = {
      assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
      orgMembership: null,
      participation: { id: 'part-001' },
      questions: [Q1, Q2],
      participants: [makeParticipant('submitted')],
    };

    const MY_ANSWERS = [
      makeMyAnswer(Q1.id, { score: 0.72, answer_text: 'My first answer.' }),
      makeMyAnswer(Q2.id, { score: 0.5, answer_text: 'My second answer.' }),
    ];

    const SERVER_OPTS: ServerClientOptions = {
      user: AUTHED_USER,
      participantAnswers: MY_ANSWERS,
    };

    // Property 4 [lld §3, req §Story 3.4]: participant self-view shows own per-question scores
    it('then own per-question scores are rendered', async () => {
      const html = await renderPage(PARTICIPANT_ONLY_OPTS, SERVER_OPTS);
      expect(html).toContain('0.72');
    });

    // Property 5 [lld §3, req §Story 3.4]: own scores are in 0.0–1.0 decimal form, NOT percentage
    it('then own scores are shown as 0.0–1.0 decimals, not as percentages', async () => {
      const html = await renderPage(PARTICIPANT_ONLY_OPTS, SERVER_OPTS);
      // Score 0.72 must appear as a decimal like "0.72"
      expect(html).toContain('0.72');
      // The self-view section must not show "72%" for the own score
      // We search for the percentage pattern adjacent to the score value.
      // The simplest safe assertion: "72%" must not appear in the self-view context.
      // We cannot pin HTML structure, so we assert it does not appear at all in
      // the self-view — if the implementation renders an aggregate score section
      // that leaks "72%" into the page, that is a separate failure caught by
      // the prohibition test below.
      expect(html).not.toMatch(/\b72%/);
    });

    // Property 6 [lld §3, req §Story 3.4]: participant self-view shows Naur layer label per question
    it('then the Naur layer label is rendered for each question', async () => {
      const html = await renderPage(PARTICIPANT_ONLY_OPTS, SERVER_OPTS);
      expect(html).toContain('Design Justification');
      expect(html).toContain('Modification Capacity');
    });

    // Property 7 [lld §3, req §Story 3.4]: participant self-view shows own submitted answer text
    it('then the participant\'s own submitted answer text is rendered', async () => {
      const html = await renderPage(PARTICIPANT_ONLY_OPTS, SERVER_OPTS);
      expect(html).toContain('My first answer.');
      expect(html).toContain('My second answer.');
    });

    // Property 8 [lld I1, req §Story 3.4, ADR-0005]: participant self-view does NOT show reference answers
    // even when the gate conditions would open them for an admin
    it('then reference answers are NOT shown even when the gate is open', async () => {
      // Gate is open: all participants submitted, scoring complete, aggregate_score present
      const html = await renderPage(PARTICIPANT_ONLY_OPTS, SERVER_OPTS);
      expect(html).not.toContain('Reference answer 1');
      expect(html).not.toContain('Reference answer 2');
    });

    // Property 9 [lld §3, req §Story 3.4]: participant self-view does NOT show the aggregate
    // comprehension score section
    it('then the aggregate comprehension score section is NOT rendered', async () => {
      const html = await renderPage(PARTICIPANT_ONLY_OPTS, SERVER_OPTS);
      expect(html).not.toContain('Comprehension Score');
    });
  });

  describe('Given a viewer who is both admin AND participant', () => {
    const Q1 = makeQuestion(1, { naur_layer: 'world_to_program' });

    const ADMIN_AND_PARTICIPANT_OPTS: SecretClientOptions = {
      assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
      orgMembership: { github_role: 'admin' },
      participation: { id: 'part-001' },
      questions: [Q1],
      participants: [makeParticipant('submitted')],
    };

    const MY_ANSWERS = [
      makeMyAnswer(Q1.id, { score: 0.85, answer_text: 'My admin-participant answer.' }),
    ];

    const SERVER_OPTS: ServerClientOptions = {
      user: AUTHED_USER,
      participantAnswers: MY_ANSWERS,
    };

    // Property 10 [lld §3 flowchart]: combined viewer sees the admin aggregate view
    it('then the aggregate comprehension score section is rendered', async () => {
      const html = await renderPage(ADMIN_AND_PARTICIPANT_OPTS, SERVER_OPTS);
      expect(html).toContain('Comprehension Score');
    });

    // Property 11 [lld §3 flowchart]: combined viewer also sees a "My Scores" section
    it('then a "My Scores" section is rendered alongside the admin view', async () => {
      const html = await renderPage(ADMIN_AND_PARTICIPANT_OPTS, SERVER_OPTS);
      expect(html).toContain('My Scores');
    });

    // Property 12 [lld §3]: the "My Scores" section contains own per-question scores
    it('then own per-question scores appear in the "My Scores" section', async () => {
      const html = await renderPage(ADMIN_AND_PARTICIPANT_OPTS, SERVER_OPTS);
      expect(html).toContain('0.85');
    });

    // Property 13 [lld §3]: the "My Scores" section contains own submitted answers
    it('then own submitted answers appear in the "My Scores" section', async () => {
      const html = await renderPage(ADMIN_AND_PARTICIPANT_OPTS, SERVER_OPTS);
      expect(html).toContain('My admin-participant answer.');
    });
  });

  // ---------------------------------------------------------------------------
  // Invariant I4: participant answers must be queried via the user-scoped client
  // LLD §3 I4, §3 "Self-view data" note
  // ---------------------------------------------------------------------------

  describe('Given a participant self-view is rendered (invariant I4)', () => {
    it('then participant_answers is queried via createServerSupabaseClient, not the secret client', async () => {
      // The implementation must call `createServerSupabaseClient().from('participant_answers')`
      // — not adminSupabase.from('participant_answers') — so that RLS restricts rows to
      // the authenticated user. We verify this by asserting the server client's `from` was
      // called with 'participant_answers', and the secret client's `from` was NOT called
      // with 'participant_answers'.

      const Q1 = makeQuestion(1);
      const secretOpts: SecretClientOptions = {
        assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
        orgMembership: null,
        participation: { id: 'part-001' },
        questions: [Q1],
        participants: [makeParticipant('submitted')],
      };

      const serverClientMock = makeServerClient({
        user: AUTHED_USER,
        participantAnswers: [makeMyAnswer(Q1.id)],
      });

      const secretClientMock = makeSecretClient(secretOpts);

      mockCreateServer.mockResolvedValue(serverClientMock as never);
      mockCreateSecret.mockReturnValue(secretClientMock as never);

      const { default: ResultsPage } = await import('@/app/(authenticated)/projects/[id]/assessments/[aid]/results/page');
      await ResultsPage({ params: makeParams() });

      // Server client (user-scoped) must have queried participant_answers
      const serverFromCalls = (serverClientMock.from as ReturnType<typeof vi.fn>).mock.calls.map(
        (c: unknown[]) => c[0],
      );
      expect(serverFromCalls).toContain('participant_answers');

      // Secret client (admin) must NOT have queried participant_answers
      const secretFromCalls = (secretClientMock.from as ReturnType<typeof vi.fn>).mock.calls.map(
        (c: unknown[]) => c[0],
      );
      expect(secretFromCalls).not.toContain('participant_answers');
    });

    // Property 14 [lld §3 I4, security]: participant_answers query must include an
    // explicit `.eq('participant_id', <own id>)` filter. RLS alone is not enough:
    // `answers_select_admin` is OR'd with `answers_select_own`, so an admin-who-is-also-
    // a-participant viewer would otherwise receive every participant's answers for
    // the assessment.
    it('filters participant_answers by the viewer\'s own participant_id', async () => {
      const Q1 = makeQuestion(1);
      const PARTICIPATION_ID = 'part-own-001';

      const secretOpts: SecretClientOptions = {
        assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
        orgMembership: { github_role: 'admin' },
        participation: { id: PARTICIPATION_ID },
        questions: [Q1],
        participants: [makeParticipant('submitted')],
      };

      // Spy-capable mock: record every (column, value) pair passed to .eq().
      const eqCalls: Array<[string, unknown]> = [];
      const orderSpy = vi.fn().mockResolvedValue({ data: [makeMyAnswer(Q1.id)], error: null });
      const makeEqChain = (): { eq: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn> } => {
        const chain = {
          eq: vi.fn((col: string, val: unknown) => {
            eqCalls.push([col, val]);
            return chain;
          }),
          order: orderSpy,
        };
        return chain;
      };

      const serverClientMock = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: AUTHED_USER }, error: null }),
        },
        from: vi.fn((table: string) => {
          if (table === 'participant_answers') {
            return { select: vi.fn().mockReturnValue(makeEqChain()) };
          }
          return {};
        }),
      };

      mockCreateServer.mockResolvedValue(serverClientMock as never);
      mockCreateSecret.mockReturnValue(makeSecretClient(secretOpts) as never);

      const { default: ResultsPage } = await import('@/app/(authenticated)/projects/[id]/assessments/[aid]/results/page');
      await ResultsPage({ params: makeParams() });

      expect(eqCalls).toContainEqual(['participant_id', PARTICIPATION_ID]);
    });
  });
});
