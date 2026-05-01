// Adversarial evaluation tests for results page role-based view separation.
// Issue: #297 — FCS results page: admin aggregate vs participant self-view.
// LLD: docs/design/lld-nav-results.md §3
// Stories: 3.4, 6.2 | ADR-0005
//
// These tests probe gaps not fully covered by the primary test file:
//   - LLD Invariant I2: admin-only viewer never sees self-view content ("Your score:")
//   - Reference answer gate works correctly in the combined admin+participant view
//   - SelfDirectedView boundary: question with no matching answer renders '—' not a crash

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ---------------------------------------------------------------------------
// Module mocks (same pattern as results.test.ts)
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

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockCreateSecret = vi.mocked(createSecretSupabaseClient);

// ---------------------------------------------------------------------------
// Factories — reused from results.test.ts (same shapes, no duplication of logic)
// ---------------------------------------------------------------------------

const USER_ID = 'user-001';
const ORG_ID = 'org-001';
const ASSESSMENT_ID = 'assessment-001';
const PROJECT_ID = 'project-001';
const AUTHED_USER = { id: USER_ID };

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
    score_rationale: 'Good understanding.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock builders — identical signatures to results.test.ts
// ---------------------------------------------------------------------------

interface SecretClientOptions {
  assessment: object | null;
  orgMembership: { github_role: string } | null;
  participation: { id: string } | null;
  questions: object[];
  participants: object[];
}

interface ServerClientOptions {
  user: { id: string } | null;
  participantAnswers?: object[];
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

function makeServerClient(opts: ServerClientOptions) {
  const { user, participantAnswers = [] } = opts;
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error('no session'),
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'assessments') {
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
      }
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
      return {};
    }),
  };
}

function makeParams(projectId = PROJECT_ID, aid = ASSESSMENT_ID) {
  return Promise.resolve({ id: projectId, aid });
}

async function renderPage(
  secretOpts: SecretClientOptions,
  serverOpts: ServerClientOptions = { user: AUTHED_USER },
) {
  mockCreateServer.mockResolvedValue(makeServerClient(serverOpts) as never);
  mockCreateSecret.mockReturnValue(makeSecretClient(secretOpts) as never);
  const { default: ResultsPage } = await import('@/app/(authenticated)/projects/[id]/assessments/[aid]/results/page');
  const element = await ResultsPage({ params: makeParams() });
  return renderToStaticMarkup(element);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FCS results page — adversarial evaluation (#297)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // Gap: LLD Invariant I2 — admin-only view must not leak self-view content
  // The primary tests verify admin sees "Comprehension Score" and no "My Scores".
  // This test verifies the admin-only page does not emit "Your score:" text at all,
  // confirming the SelfDirectedView is structurally absent (not just section-headed).
  // -------------------------------------------------------------------------

  describe('Invariant I2 — admin-only viewer never sees self-view content', () => {
    it('then "Your score:" text is not present anywhere in the admin-only rendered page', async () => {
      // LLD §3 I2: Org Admin never sees individual participant scores (only aggregate).
      // The SelfDirectedView uses "Your score:" as its per-question label.
      // An admin-only viewer should see none of this.
      const html = await renderPage({
        assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
        orgMembership: { github_role: 'admin' },
        participation: null,
        questions: [makeQuestion(1), makeQuestion(2)],
        participants: [makeParticipant('submitted')],
      });
      expect(html).not.toContain('Your score:');
    });

    it('then "Your answer:" text is not present anywhere in the admin-only rendered page', async () => {
      // Same invariant: the admin-only view must not contain per-participant answer text labels.
      const html = await renderPage({
        assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
        orgMembership: { github_role: 'admin' },
        participation: null,
        questions: [makeQuestion(1)],
        participants: [makeParticipant('submitted')],
      });
      expect(html).not.toContain('Your answer:');
    });
  });

  // -------------------------------------------------------------------------
  // Gap: reference answer gate in combined admin+participant view
  // The primary test file tests the gate only with admin-only opts. This test
  // verifies the gate still works correctly when the viewer is both admin
  // and participant (combined view) — i.e., the presence of the "My Scores"
  // section does not bypass or suppress the reference answer reveal.
  // -------------------------------------------------------------------------

  describe('Reference answer gate in combined admin + participant view', () => {
    const Q1 = makeQuestion(1);

    it('reveals reference answers when gate conditions are met (all submitted, scoring complete)', async () => {
      // Story 6.2: reference answers ARE shown for FCS once complete.
      // Combined viewer (admin+participant) must still see revealed reference answers.
      const html = await renderPage(
        {
          assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
          orgMembership: { github_role: 'admin' },
          participation: { id: 'part-001' },
          questions: [Q1],
          participants: [makeParticipant('submitted')],
        },
        {
          user: AUTHED_USER,
          participantAnswers: [makeMyAnswer(Q1.id, { score: 0.85 })],
        },
      );
      expect(html).toContain('Reference answer 1');
    });

    it('withholds reference answers when not all participants have submitted', async () => {
      // Gate must not be bypassed by the My Scores section being present.
      const html = await renderPage(
        {
          assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
          orgMembership: { github_role: 'admin' },
          participation: { id: 'part-001' },
          questions: [Q1],
          participants: [makeParticipant('submitted'), makeParticipant('pending')],
        },
        {
          user: AUTHED_USER,
          participantAnswers: [makeMyAnswer(Q1.id, { score: 0.85 })],
        },
      );
      expect(html).not.toContain('Reference answer 1');
      expect(html).toContain('Reference answers will be visible');
    });
  });

  // -------------------------------------------------------------------------
  // Gap: AC6 hint styling in SelfDirectedView (participant-only path)
  // The primary styling test (results-styling.test.ts) checks border-l-2 only via
  // the admin path (AdminQuestionCard). SelfDirectedView has a separate code path
  // for hint rendering (page.tsx line 336) that is not exercised by any existing test.
  // AC6 says "Given a question with a non-null hint, then the hint is visually
  // distinct (has border-l-2)" — this must hold for both view components.
  // -------------------------------------------------------------------------

  describe('AC6 — hint styling in participant SelfDirectedView', () => {
    it('renders the hint with border-l-2 in the participant-only (SelfDirectedView) path', async () => {
      // AC6 [issue §AC6]: SelfDirectedView wraps hints in border-l-2 just like
      // AdminQuestionCard. A future refactor that removes this from SelfDirectedView
      // would otherwise be invisible to the test suite.
      const HINT_TEXT = 'Think about the data flow boundary.';
      const html = await renderPage(
        {
          assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
          orgMembership: null,
          participation: { id: 'part-001' },
          questions: [makeQuestion(1, { hint: HINT_TEXT })],
          participants: [makeParticipant('submitted')],
        },
        {
          user: AUTHED_USER,
          participantAnswers: [],
        },
      );
      expect(html).toContain(HINT_TEXT);
      expect(html).toContain('border-l-2');
    });
  });

  // -------------------------------------------------------------------------
  // Gap: SelfDirectedView boundary — participant with no matching answer
  // The spec says the self-view shows per-question scores. If a question has
  // no matching answer in myAnswers (e.g., scoring not yet complete), the
  // component must render '—' and not crash. This is a boundary value.
  // -------------------------------------------------------------------------

  describe('SelfDirectedView boundary — question with no matching answer in myAnswers', () => {
    it('renders "—" for score when the participant has no answer for a question', async () => {
      // myAnswers is empty — no match for the question.
      // toDecimalScore(null) must return '—' (not throw, not render empty).
      const html = await renderPage(
        {
          assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
          orgMembership: null,
          participation: { id: 'part-001' },
          questions: [makeQuestion(1)],
          participants: [makeParticipant('submitted')],
        },
        {
          user: AUTHED_USER,
          participantAnswers: [], // no answers at all
        },
      );
      // The question text must be rendered
      expect(html).toContain('Question 1?');
      // The score placeholder must show '—'
      expect(html).toContain('Your score: —');
      // No "Your answer:" section when answer is absent
      expect(html).not.toContain('Your answer:');
    });
  });
});
