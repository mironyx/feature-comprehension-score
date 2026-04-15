// Adversarial evaluation tests for issue #221 — Story 1.3: display hints in participant answer form.
//
// The test-author covered QuestionCard (6 tests), filterQuestionFields (3 tests), and
// Results page hint display (3 tests). One acceptance criterion has no direct test coverage:
//
//   AC-3: AnsweringForm passes `hint` from question data to QuestionCard
//
// The answering page test ([id].answering.test.ts) renders the page for structural cases
// (auth gate, access denied, already-submitted) but does not verify hint flows through
// the page → AnsweringForm → QuestionCard render path. This test probes that gap.
//
// Failures here are findings — do NOT fix the implementation in this file.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports that depend on them
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
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockCreateSecret = vi.mocked(createSecretSupabaseClient);

// ---------------------------------------------------------------------------
// Factories — minimal, scoped to this test's needs
// ---------------------------------------------------------------------------

const USER_ID = 'user-eval-001';
const ASSESSMENT_ID = 'assessment-eval-001';

function makeAssessment() {
  return {
    id: ASSESSMENT_ID,
    org_id: 'org-eval-001',
    type: 'fcs',
    status: 'active',
    feature_name: 'Hints Eval Feature',
    feature_description: null,
    pr_number: null,
    repositories: { github_repo_name: 'eval-repo' },
    organisations: { github_org_name: 'eval-org' },
    config_enforcement_mode: 'advisory',
    config_score_threshold: 70,
    config_question_count: 1,
  };
}

function makeParticipant() {
  return { id: 'participant-eval-001', status: 'pending', submitted_at: null };
}

function makeQuestion(hint: string | null) {
  return {
    id: 'question-eval-001',
    question_number: 1,
    naur_layer: 'world_to_program',
    question_text: 'What does the scoring engine do?',
    hint,
  };
}

function makeSecretClient(assessment: object, participant: object, questions: object[]) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn((table: string) => {
      if (table === 'assessments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: assessment, error: null }),
            }),
          }),
        };
      }
      if (table === 'assessment_participants') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: participant, error: null }),
              }),
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

function makeServerClient() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID, user_metadata: {} } },
        error: null,
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

async function renderAnsweringPage(hint: string | null): Promise<string> {
  mockCreateServer.mockResolvedValue(makeServerClient() as never);
  mockCreateSecret.mockReturnValue(
    makeSecretClient(makeAssessment(), makeParticipant(), [makeQuestion(hint)]) as never,
  );
  const { default: AssessmentPage } = await import('@/app/assessments/[id]/page');
  const element = await AssessmentPage({ params: Promise.resolve({ id: ASSESSMENT_ID }) });
  return renderToStaticMarkup(element as React.ReactElement);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnsweringForm hint passthrough — Issue #221 AC-3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Given a question with a non-null hint', () => {
    it('then the hint text is rendered in the answering form', async () => {
      // AC-3 [issue]: hint flows page → AnsweringForm → QuestionCard → rendered HTML
      const HINT_TEXT = 'Describe the key design trade-offs in 2–3 sentences.';
      const html = await renderAnsweringPage(HINT_TEXT);
      expect(html).toContain(HINT_TEXT);
    });
  });

  describe('Given a question with a null hint', () => {
    it('then the answering form renders the question without a hint element', async () => {
      // AC-3 / invariant #3 [lld §Story 1.3]: null hint must not produce empty hint space
      const html = await renderAnsweringPage(null);
      // The question text must still be present — form renders correctly
      expect(html).toContain('What does the scoring engine do?');
      // The italic class is the discriminator for the hint paragraph — absent when null
      expect(html).not.toContain('italic');
    });
  });
});
