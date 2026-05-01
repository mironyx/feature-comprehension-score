// Tests for results page styling, question de-duplication, and hint visibility.
// Issue: #315 — fix: results page poor formatting — no styling, question duplication, invisible hints
// Design reference: docs/design/lld-nav-results.md §3 (role-based view separation)
// Requirements: docs/requirements/v1-requirements.md §Story 3.4, §Story 6.2

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const AUTH_LAYOUT_SRC = readFileSync(
  resolve(__dirname, '../../../src/app/(authenticated)/layout.tsx'),
  'utf8',
);

// ---------------------------------------------------------------------------
// Module mocks — same pattern as sibling results.test.ts
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
// Factories — copied from sibling results.test.ts; do NOT import from there
// because vi.resetModules() would invalidate cross-file references.
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
    score_rationale: 'Good understanding of the concept.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock builders — copied from sibling results.test.ts
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
  user: { id: string } | null;
  participantAnswers?: object[];
}

function makeServerClient(userOrOpts: { id: string } | null | ServerClientOptions) {
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
  opts: SecretClientOptions,
  serverOpts: ServerClientOptions = { user: AUTHED_USER },
) {
  mockCreateServer.mockResolvedValue(makeServerClient(serverOpts) as never);
  mockCreateSecret.mockReturnValue(makeSecretClient(opts) as never);
  const { default: ResultsPage } = await import('@/app/(authenticated)/projects/[id]/assessments/[aid]/results/page');
  const element = await ResultsPage({ params: makeParams() });
  return renderToStaticMarkup(element);
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const Q1 = makeQuestion(1, { naur_layer: 'world_to_program' });
const Q2 = makeQuestion(2, { naur_layer: 'design_justification' });

// Admin-only viewer (no personal scores section expected)
const ADMIN_ONLY_OPTS: SecretClientOptions = {
  assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
  orgMembership: { github_role: 'admin' },
  participation: null,
  questions: [Q1, Q2],
  participants: [makeParticipant('submitted')],
};

// Combined admin+participant viewer
const COMBINED_Q1 = makeQuestion(1, { naur_layer: 'world_to_program' });
const COMBINED_OPTS: SecretClientOptions = {
  assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
  orgMembership: { github_role: 'admin' },
  participation: { id: 'part-001' },
  questions: [COMBINED_Q1],
  participants: [makeParticipant('submitted')],
};
const COMBINED_MY_ANSWERS = [
  makeMyAnswer(COMBINED_Q1.id, { score: 0.85, answer_text: 'My personal answer text.' }),
];
const COMBINED_SERVER_OPTS: ServerClientOptions = {
  user: AUTHED_USER,
  participantAnswers: COMBINED_MY_ANSWERS,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Results page styling (issue #315)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // AC1: page layout uses design tokens
  // -------------------------------------------------------------------------

  describe('Results page styling', () => {
    describe('Given an admin viewing the results page', () => {
      // AC1 layout-shell tokens (max-w-page, px-content-pad) moved from the page
      // to the (authenticated) layout in #341. Assert against the layout file so the
      // regression intent survives the restructure; the page itself only owns
      // section-gap rhythm now.
      it('the (authenticated) layout container carries the max-w-page layout token', () => {
        expect(AUTH_LAYOUT_SRC).toContain('max-w-page');
      });

      it('the (authenticated) layout container carries a content-pad horizontal padding token', () => {
        expect(AUTH_LAYOUT_SRC).toMatch(/px-content-pad/);
      });

      it('renders the page container with a section-gap spacing token', async () => {
        // AC1 [issue §AC1]: page still owns vertical rhythm between sections.
        const html = await renderPage(ADMIN_ONLY_OPTS);
        expect(html).toMatch(/section-gap/);
      });
    });

    // -------------------------------------------------------------------------
    // AC2: each question renders inside a Card component
    // -------------------------------------------------------------------------

    describe('Given a question is rendered', () => {
      it('wraps each question in a Card component (identifiable by card-pad class)', async () => {
        // AC2 [issue §AC2]: Card component renders with class "p-card-pad" (from card.tsx).
        // The current implementation uses bare <li> with no className — this test
        // will fail until Card is applied.
        const html = await renderPage(ADMIN_ONLY_OPTS);
        expect(html).toContain('card-pad');
      });

      it('wraps each question in a Card component (identifiable by border-border class)', async () => {
        // AC2 [issue §AC2]: Card component renders with class "border-border" (from card.tsx).
        // Confirms the Card element itself is present, not just a stray padding class.
        const html = await renderPage(ADMIN_ONLY_OPTS);
        expect(html).toContain('border-border');
      });
    });

    // -------------------------------------------------------------------------
    // AC3: Naur layer shown as a Badge component
    // -------------------------------------------------------------------------

    describe('Given a question with a Naur layer', () => {
      it('renders the Naur layer as a Badge (identifiable by inline-flex class)', async () => {
        // AC3 [issue §AC3, req §Story 3.4]: the Naur layer must be presented as a
        // <Badge> component. Badge renders with class "inline-flex" (from badge.tsx).
        // The current implementation uses a bare <p>Layer: ...</p> — this will fail
        // until Badge is applied.
        const html = await renderPage(ADMIN_ONLY_OPTS);
        // "World to Program" is the NAUR_LABELS value for 'world_to_program'
        expect(html).toContain('World to Program');
        expect(html).toContain('inline-flex');
      });

      it('renders the Naur layer badge with font-medium styling from Badge component', async () => {
        // AC3 [issue §AC3]: Badge applies "font-medium" class (from badge.tsx).
        // This complements the inline-flex check to confirm the Badge component is used,
        // not a hand-rolled span that happens to have one matching class.
        const html = await renderPage(ADMIN_ONLY_OPTS);
        expect(html).toContain('font-medium');
      });
    });

    // -------------------------------------------------------------------------
    // AC6: hints are visually distinct
    // -------------------------------------------------------------------------

    describe('Given a question with a non-null hint', () => {
      it('renders the hint with a left-border class for visual separation', async () => {
        // AC6 [issue §AC6]: hints must have "border-l-2" or equivalent left-border class
        // so they stand out from surrounding text on dark backgrounds.
        // The current broken implementation uses only "text-caption text-text-secondary italic"
        // — this regression test fails against the pre-fix code.
        const HINT_TEXT = 'Describe the key design trade-offs.';
        const html = await renderPage({
          assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
          orgMembership: { github_role: 'admin' },
          participation: null,
          questions: [makeQuestion(1, { hint: HINT_TEXT })],
          participants: [makeParticipant('submitted')],
        });
        expect(html).toContain(HINT_TEXT);
        expect(html).toContain('border-l-2');
      });
    });
  });

  // -------------------------------------------------------------------------
  // AC4, AC5: combined admin+participant view — no duplication, both scores visible
  // -------------------------------------------------------------------------

  describe('Combined admin+participant view (no duplication)', () => {
    describe('Given a viewer who is both admin AND participant', () => {
      it('renders each question text exactly once (regression: #315 question duplication)', async () => {
        // AC4 [issue §AC4]: before the fix, question text appeared in both
        // AdminAggregateView's "Question Breakdown" and in MyScoresSection,
        // causing verbatim repetition. This is the primary regression test for #315.
        const html = await renderPage(COMBINED_OPTS, COMBINED_SERVER_OPTS);
        const occurrences = (html.match(/Question 1\?/g) ?? []).length;
        expect(occurrences).toBe(1);
      });

      it('shows the aggregate score per question', async () => {
        // AC5 [issue §AC5, req §Story 6.2]: aggregate per-question score must be
        // visible for admin viewers even in the combined view.
        const html = await renderPage(COMBINED_OPTS, COMBINED_SERVER_OPTS);
        expect(html).toContain('Aggregate score:');
      });

      it('shows the personal score per question in the same card', async () => {
        // AC5 [issue §AC5, req §Story 3.4]: personal score (0.0–1.0 decimal) must
        // appear on the same page as the aggregate score — i.e., within the merged
        // question card, not in a distant repeated section.
        const html = await renderPage(COMBINED_OPTS, COMBINED_SERVER_OPTS);
        // 0.85 is the participant score set in COMBINED_MY_ANSWERS
        expect(html).toContain('0.85');
      });

      it('shows the personal answer text per question', async () => {
        // AC5 [issue §AC5, req §Story 3.4]: participant's own submitted answer text
        // must be visible in the combined view.
        const html = await renderPage(COMBINED_OPTS, COMBINED_SERVER_OPTS);
        expect(html).toContain('My personal answer text.');
      });

      it('retains the "My Scores" label for combined viewers (regression guard for AC7)', async () => {
        // AC7 [issue §AC7, lld §3 flowchart]: the existing results.test.ts Property 11
        // asserts html.toContain('My Scores'). The fix merges the section content into
        // each question card but must keep the label visible.
        // This test ensures no behavioural regression from the de-duplication fix.
        const html = await renderPage(COMBINED_OPTS, COMBINED_SERVER_OPTS);
        expect(html).toContain('My Scores');
      });
    });

    describe('Given a viewer who is admin only (not a participant)', () => {
      it('does not render a "My Scores" label (invariant I1 from LLD §3)', async () => {
        // AC7 [lld §3 I1]: admin-only viewers must not see any personal scores section.
        // This invariant was established in #297 and must survive the #315 refactor.
        const html = await renderPage(ADMIN_ONLY_OPTS);
        expect(html).not.toContain('My Scores');
      });
    });

    describe('Given a participant-only viewer', () => {
      it('still renders own per-question scores (regression guard for AC7)', async () => {
        // AC7 [req §Story 3.4]: participant self-directed view must continue to show
        // their own scores after the styling refactor. Ensures the refactor did not
        // break the SelfDirectedView component.
        const participantQ = makeQuestion(1);
        const html = await renderPage(
          {
            assessment: makeAssessment({ aggregate_score: 0.72, scoring_incomplete: false }),
            orgMembership: null,
            participation: { id: 'part-001' },
            questions: [participantQ],
            participants: [makeParticipant('submitted')],
          },
          {
            user: AUTHED_USER,
            participantAnswers: [makeMyAnswer(participantQ.id, { score: 0.65 })],
          },
        );
        expect(html).toContain('0.65');
      });
    });
  });
});
