// Adversarial evaluation tests for issue #213 — NULL score UI indicator.
//
// Probes gaps in the implementation's own test suite. Failures are findings —
// do NOT fix the implementation in this file.
//
// Coverage gap found: AC-2 (facilitator-visible indicator) was only tested
// through the participant access path. This file verifies the org admin path.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

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

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockCreateSecret = vi.mocked(createSecretSupabaseClient);

// ---------------------------------------------------------------------------
// Reuse factories and builders from the feature's own test file
// ---------------------------------------------------------------------------

// These are reproduced here rather than extracted because the feature test file
// does not export them. If they drift, extract to tests/fixtures/results-mocks.ts.

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
      if (table === 'org_config') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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

async function renderPage(opts: SecretClientOptions) {
  mockCreateServer.mockResolvedValue(makeServerClient({ id: USER_ID }) as never);
  mockCreateSecret.mockReturnValue(makeSecretClient(opts) as never);
  const { default: ResultsPage } = await import('@/app/assessments/[id]/results/page');
  const element = await ResultsPage({ params: Promise.resolve({ id: ASSESSMENT_ID }) });
  return renderToStaticMarkup(element);
}

// ---------------------------------------------------------------------------
// AC-2 gap: org admin (facilitator) path for the failure indicator
// ---------------------------------------------------------------------------

describe('AC-2: facilitator-visible failure indicator — org admin access path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('Given an org admin views an assessment with scoring_incomplete and a null-scored question, then the "Unable to score" indicator is visible', async () => {
    // Org admin: orgMembership = admin, participation = null (not a participant)
    const html = await renderPage({
      assessment: makeAssessment({ scoring_incomplete: true, aggregate_score: 0.5 }),
      orgMembership: { github_role: 'admin' },
      participation: null,
      questions: [makeQuestion(1, { aggregate_score: null })],
      participants: [{ id: 'part-001', status: 'submitted' }],
    });

    expect(html).toContain('Unable to score');
  });
});
