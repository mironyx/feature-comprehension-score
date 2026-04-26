// Tests for GET /api/assessments/[id] — assessment detail endpoint.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports that depend on them
// ---------------------------------------------------------------------------

vi.mock('@/lib/api/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/route-handler-readonly', () => ({
  createReadonlyRouteHandlerClient: vi.fn(() => mockUserClient),
}));

vi.mock('@/lib/supabase/secret', () => ({
  createSecretSupabaseClient: vi.fn(() => mockServiceClient),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from '@/lib/api/auth';
import { filterQuestionFields } from '@/app/api/assessments/[id]/helpers';

// ---------------------------------------------------------------------------
// Mock chain builder
// Produces a chainable Supabase query builder where:
//   .select(), .eq() — return `chain` (chainable, also thenable)
//   .order()         — returns Promise (terminal via order)
//   .single()        — returns Promise (terminal)
//   .maybeSingle()   — returns Promise (terminal)
//   await chain      — resolves via .then() (terminal for bare eq/select)
// ---------------------------------------------------------------------------

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  // Extend a real Promise so that direct `await chain` uses the native .then()
  // rather than a plain-object thenable (avoids SonarQube S7739).
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(() => Promise.resolve(resolver())),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// Mock state — configured per test via helper functions below
// ---------------------------------------------------------------------------

let assessmentResult: { data: unknown; error: unknown } = { data: null, error: null };
let orgMembershipResult: { data: unknown; error: unknown } = { data: null, error: null };
let myParticipationResult: { data: unknown; error: unknown } = { data: null, error: null };
let questionsResult: { data: unknown; error: unknown } = { data: [], error: null };
let participantCountsResult: { data: unknown; error: unknown } = { data: [], error: null };
let fcsPrsResult: { data: unknown; error: unknown } = { data: [], error: null };
let fcsIssuesResult: { data: unknown; error: unknown } = { data: [], error: null };

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'assessments') return makeChain(() => assessmentResult);
    if (table === 'user_organisations') return makeChain(() => orgMembershipResult);
    if (table === 'assessment_participants') return makeChain(() => myParticipationResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
};

const mockServiceClient = {
  from: vi.fn((table: string) => {
    if (table === 'assessment_questions') return makeChain(() => questionsResult);
    if (table === 'assessment_participants') return makeChain(() => participantCountsResult);
    if (table === 'fcs_merged_prs') return makeChain(() => fcsPrsResult);
    if (table === 'fcs_issue_sources') return makeChain(() => fcsIssuesResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH_USER = {
  id: 'user-001',
  email: 'alice@example.com',
  githubUserId: 1001,
  githubUsername: 'alice',
};

const ASSESSMENT_ID = 'assess-uuid-001';
const ORG_ID = 'org-uuid-001';
const PARTICIPANT_ID = 'participant-uuid-001';

function makeRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/assessments/${ASSESSMENT_ID}`);
}

function makeAssessmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSESSMENT_ID,
    org_id: ORG_ID,
    type: 'prcc',
    status: 'completed',
    repository_id: 'repo-001',
    pr_number: 42,
    pr_head_sha: 'abc123',
    feature_name: null,
    feature_description: null,
    aggregate_score: 0.85,
    scoring_incomplete: false,
    artefact_quality: null,
    conclusion: 'success',
    config_enforcement_mode: 'soft',
    config_score_threshold: 70,
    config_question_count: 3,
    skip_reason: null,
    skipped_at: null,
    created_at: '2026-01-01T00:00:00Z',
    repositories: { github_repo_name: 'my-repo' },
    organisations: { github_org_name: 'my-org' },
    ...overrides,
  };
}

function makeQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'question-001',
    org_id: ORG_ID,
    assessment_id: ASSESSMENT_ID,
    question_number: 1,
    naur_layer: 'world_to_program',
    question_text: 'What does this feature do?',
    weight: 2,
    reference_answer: 'It does X.',
    aggregate_score: 0.9,
    hint: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeParticipantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PARTICIPANT_ID,
    status: 'submitted',
    submitted_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setupAuth() {
  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
}

function setupAdminRole() {
  orgMembershipResult = { data: { github_role: 'admin' }, error: null };
}

function setupParticipantRole() {
  orgMembershipResult = { data: null, error: null }; // not in user_organisations as admin
}

// ---------------------------------------------------------------------------
// Tests: filterQuestionFields (pure helper)
// ---------------------------------------------------------------------------

describe('filterQuestionFields', () => {
  // Cast required: makeQuestion spreads Record<string,unknown> overrides which widens naur_layer to string.
  const question = makeQuestion() as Parameters<typeof filterQuestionFields>[0][number];

  describe('Given a PRCC assessment', () => {
    it('then reference_answer is always null', () => {
      const result = filterQuestionFields([question], 'prcc', 'admin', 'completed');
      expect(result[0]?.reference_answer).toBeNull();
    });
  });

  describe('Given an FCS assessment viewed by a participant', () => {
    it('then reference_answer is null', () => {
      const result = filterQuestionFields([question], 'fcs', 'participant', 'completed');
      expect(result[0]?.reference_answer).toBeNull();
    });
  });

  describe('Given an FCS assessment in non-completed status viewed by admin', () => {
    it('then reference_answer is null', () => {
      const result = filterQuestionFields([question], 'fcs', 'admin', 'awaiting_responses');
      expect(result[0]?.reference_answer).toBeNull();
    });
  });

  describe('Given a completed FCS assessment viewed by Org Admin', () => {
    it('then reference_answer is included', () => {
      const result = filterQuestionFields([question], 'fcs', 'admin', 'completed');
      expect(result[0]?.reference_answer).toBe('It does X.');
    });
  });

  it('maps all other fields unchanged', () => {
    const result = filterQuestionFields([question], 'prcc', 'admin', 'completed');
    expect(result[0]).toMatchObject({
      id: 'question-001',
      question_number: 1,
      naur_layer: 'world_to_program',
      question_text: 'What does this feature do?',
      weight: 2,
      aggregate_score: 0.9,
    });
  });

  // -------------------------------------------------------------------------
  // Hint field — Issue #221 (Story 1.3)
  // -------------------------------------------------------------------------

  describe('hint field passthrough', () => {
    describe('Given a question with a non-null hint', () => {
      it('then FilteredQuestion includes the hint value unchanged', () => {
        // Property 6 & 7 [lld §Story 1.3]: hint is present in FilteredQuestion and passes through verbatim
        const q = makeQuestion({ hint: 'Describe 2–3 specific scenarios.' }) as Parameters<typeof filterQuestionFields>[0][number];
        const result = filterQuestionFields([q], 'fcs', 'admin', 'completed');
        expect(result[0]).toHaveProperty('hint', 'Describe 2–3 specific scenarios.');
      });
    });

    describe('Given a question with a null hint', () => {
      it('then FilteredQuestion hint is null', () => {
        // Property 8 [lld §Story 1.3, invariant #3]: null hint passes through unchanged
        const q = makeQuestion({ hint: null }) as Parameters<typeof filterQuestionFields>[0][number];
        const result = filterQuestionFields([q], 'fcs', 'admin', 'completed');
        expect(result[0]).toHaveProperty('hint', null);
      });
    });

    describe('Given a question with hint absent from the DB row', () => {
      it('then FilteredQuestion hint is null (undefined coerced to null by DB type)', () => {
        // Property 8 [lld §Story 1.3, invariant #3]: missing hint treated as null
        // The DB column is nullable TEXT — the Row type returns string | null, never undefined.
        // This test verifies the field is present in the output shape even when the value is null.
        const q = makeQuestion() as Parameters<typeof filterQuestionFields>[0][number];
        // makeQuestion does not set hint — it should default to null in the DB Row type
        const result = filterQuestionFields([q], 'fcs', 'participant', 'awaiting_responses');
        expect(result[0]).toHaveProperty('hint');
        // value is null (DB nullable column, not set in makeQuestion fixture)
        expect(result[0]?.hint == null).toBe(true);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/assessments/[id] route
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Reset mock state to safe defaults
  assessmentResult = { data: null, error: null };
  orgMembershipResult = { data: null, error: null };
  myParticipationResult = { data: null, error: null };
  questionsResult = { data: [], error: null };
  participantCountsResult = { data: [], error: null };
  fcsPrsResult = { data: [], error: null };
  fcsIssuesResult = { data: [], error: null };
});

describe('GET /api/assessments/[id]', () => {
  describe('Given an unauthenticated request', () => {
    it('then it returns 401', async () => {
      const { ApiError } = await import('@/lib/api/errors');
      vi.mocked(requireAuth).mockRejectedValue(new ApiError(401, 'Unauthenticated'));

      const { GET } = await import('@/app/api/assessments/[id]/route');
      const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

      expect(response.status).toBe(401);
    });
  });

  describe('Given a user who is not a participant or admin', () => {
    it('then it returns 404', async () => {
      setupAuth();
      // RLS prevents access — assessment query returns null
      assessmentResult = { data: null, error: { code: 'PGRST116', message: 'Not found' } };

      const { GET } = await import('@/app/api/assessments/[id]/route');
      const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

      expect(response.status).toBe(404);
    });
  });

  describe('Given a PRCC assessment', () => {
    it('then reference answers are null', async () => {
      setupAuth();
      setupAdminRole();
      assessmentResult = { data: makeAssessmentRow({ type: 'prcc', status: 'completed' }), error: null };
      questionsResult = { data: [makeQuestion({ reference_answer: 'secret answer' })], error: null };
      participantCountsResult = { data: [], error: null };
      myParticipationResult = { data: null, error: null };

      const { GET } = await import('@/app/api/assessments/[id]/route');
      const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

      expect(response.status).toBe(200);
      const body = await response.json() as { questions: Array<{ reference_answer: unknown }> };
      expect(body.questions[0]?.reference_answer).toBeNull();
    });
  });

  describe('Given a completed FCS assessment viewed by Org Admin', () => {
    it('then reference answers are included', async () => {
      setupAuth();
      setupAdminRole();
      assessmentResult = { data: makeAssessmentRow({ type: 'fcs', status: 'completed', pr_number: null }), error: null };
      questionsResult = { data: [makeQuestion({ reference_answer: 'It does X.' })], error: null };
      participantCountsResult = {
        data: [{ id: PARTICIPANT_ID, status: 'submitted', github_username: 'alice' }],
        error: null,
      };
      myParticipationResult = { data: null, error: null };

      const { GET } = await import('@/app/api/assessments/[id]/route');
      const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

      expect(response.status).toBe(200);
      const body = await response.json() as { questions: Array<{ reference_answer: unknown }> };
      expect(body.questions[0]?.reference_answer).toBe('It does X.');
    });
  });

  describe('Given a completed FCS assessment viewed by participant', () => {
    beforeEach(() => {
      setupAuth();
      setupParticipantRole();
      assessmentResult = {
        data: makeAssessmentRow({ type: 'fcs', status: 'completed', pr_number: null }),
        error: null,
      };
      questionsResult = { data: [makeQuestion({ reference_answer: 'secret' })], error: null };
      participantCountsResult = {
        data: [{ id: PARTICIPANT_ID, status: 'submitted', github_username: 'alice' }],
        error: null,
      };
      myParticipationResult = { data: makeParticipantRow(), error: null };
    });

    it('then reference answers are null', async () => {
      const { GET } = await import('@/app/api/assessments/[id]/route');
      const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

      expect(response.status).toBe(200);
      const body = await response.json() as { questions: Array<{ reference_answer: unknown }> };
      expect(body.questions[0]?.reference_answer).toBeNull();
    });
  });

  describe('Given a valid request from a participant caller', () => {
    it('then it returns the full response shape with participants summary', async () => {
      setupAuth();
      setupParticipantRole();
      assessmentResult = {
        data: makeAssessmentRow({
          type: 'fcs',
          status: 'completed',
          pr_number: null,
          feature_name: 'My Feature',
        }),
        error: null,
      };
      questionsResult = { data: [makeQuestion()], error: null };
      participantCountsResult = {
        data: [
          { id: 'p-001', status: 'submitted', github_username: 'alice' },
          { id: 'p-002', status: 'pending', github_username: 'bob' },
        ],
        error: null,
      };
      myParticipationResult = { data: makeParticipantRow(), error: null };

      const { GET } = await import('@/app/api/assessments/[id]/route');
      const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body.id).toBe(ASSESSMENT_ID);
      expect(body.type).toBe('fcs');
      expect(body.repository_name).toBe('my-repo');
      expect(body.repository_full_name).toBe('my-org/my-repo');
      expect(body.feature_name).toBe('My Feature');
      expect(body.participants).toEqual({ total: 2, completed: 1 });
      expect(body.skip_info).toBeNull();
    });
  });

  describe('Given a non-PGRST116 assessment DB error', () => {
    it('then it returns 500', async () => {
      setupAuth();
      assessmentResult = { data: null, error: { code: 'PGRST000', message: 'connection reset' } };

      const { GET } = await import('@/app/api/assessments/[id]/route');
      const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

      expect(response.status).toBe(500);
    });
  });

  describe('Given a PGRST116 assessment DB error', () => {
    it('then it returns 404', async () => {
      setupAuth();
      assessmentResult = { data: null, error: { code: 'PGRST116', message: 'Not found' } };

      const { GET } = await import('@/app/api/assessments/[id]/route');
      const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

      expect(response.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // Progress fields — V2 Epic 18, Story 18.3, AC 8. Issue: #274
  // The polling endpoint must expose rubric_progress and rubric_progress_updated_at
  // so that the client can display progress labels and detect stale generation.
  // ---------------------------------------------------------------------------

  describe('Given an assessment with rubric_progress and rubric_progress_updated_at (Story 18.3)', () => {
    it('then the response body includes rubric_progress matching the assessment row', async () => {
      // AC 8 [req §18.3: GET /api/assessments/[id] includes rubric_progress]
      setupAuth();
      setupAdminRole();
      assessmentResult = {
        data: makeAssessmentRow({
          type: 'fcs',
          status: 'rubric_generation',
          rubric_progress: 'llm_request',
          rubric_progress_updated_at: '2026-04-20T10:00:00Z',
          pr_number: null,
        }),
        error: null,
      };
      questionsResult = { data: [], error: null };
      participantCountsResult = { data: [], error: null };
      myParticipationResult = { data: null, error: null };

      const { GET } = await import('@/app/api/assessments/[id]/route');
      const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body['rubric_progress']).toBe('llm_request');
    });

    it('then the response body includes rubric_progress_updated_at matching the assessment row', async () => {
      // AC 8 [req §18.3: GET /api/assessments/[id] includes rubric_progress_updated_at]
      setupAuth();
      setupAdminRole();
      assessmentResult = {
        data: makeAssessmentRow({
          type: 'fcs',
          status: 'rubric_generation',
          rubric_progress: 'rubric_parsing',
          rubric_progress_updated_at: '2026-04-20T10:05:00Z',
          pr_number: null,
        }),
        error: null,
      };
      questionsResult = { data: [], error: null };
      participantCountsResult = { data: [], error: null };
      myParticipationResult = { data: null, error: null };

      const { GET } = await import('@/app/api/assessments/[id]/route');
      const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body['rubric_progress_updated_at']).toBe('2026-04-20T10:05:00Z');
    });

    it('then rubric_progress is null in the response when the assessment has no progress', async () => {
      // AC 8 [req §18.3: null progress passes through]
      setupAuth();
      setupAdminRole();
      assessmentResult = {
        data: makeAssessmentRow({
          type: 'fcs',
          status: 'awaiting_responses',
          rubric_progress: null,
          rubric_progress_updated_at: null,
          pr_number: null,
        }),
        error: null,
      };
      questionsResult = { data: [], error: null };
      participantCountsResult = { data: [], error: null };
      myParticipationResult = { data: null, error: null };

      const { GET } = await import('@/app/api/assessments/[id]/route');
      const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body['rubric_progress']).toBeNull();
      expect(body['rubric_progress_updated_at']).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // FCS enrichment + role-aware participants — V8 Epic 1, T1. Issue: #361
  // The assessment detail endpoint must expose source PRs/issues for FCS
  // assessments and a full participant list for admin callers.
  // ---------------------------------------------------------------------------

  describe('GET /api/assessments/[id] — FCS enrichment (T1)', () => {
    function setupFcsAssessment(overrides: Record<string, unknown> = {}) {
      assessmentResult = {
        data: makeAssessmentRow({ type: 'fcs', status: 'completed', pr_number: null, ...overrides }),
        error: null,
      };
    }

    function setupPrccAssessment() {
      assessmentResult = {
        data: makeAssessmentRow({ type: 'prcc', status: 'completed' }),
        error: null,
      };
    }

    describe('Given an FCS assessment viewed by Org Admin', () => {
      beforeEach(() => {
        setupAuth();
        setupAdminRole();
        setupFcsAssessment();
        questionsResult = { data: [], error: null };
        participantCountsResult = {
          data: [
            { id: 'p-001', status: 'submitted', github_username: 'alice' },
            { id: 'p-002', status: 'pending', github_username: 'bob' },
          ],
          error: null,
        };
        fcsPrsResult = {
          data: [
            { pr_number: 12, pr_title: 'Add billing service' },
            { pr_number: 15, pr_title: 'Fix invoice rounding' },
          ],
          error: null,
        };
        fcsIssuesResult = {
          data: [{ issue_number: 7, issue_title: 'Stripe webhook drops events' }],
          error: null,
        };
        myParticipationResult = { data: null, error: null };
      });

      it('returns fcs_prs as array of { pr_number, pr_title }', async () => {
        const { GET } = await import('@/app/api/assessments/[id]/route');
        const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

        expect(response.status).toBe(200);
        const body = await response.json() as { fcs_prs: unknown };
        expect(body.fcs_prs).toEqual([
          { pr_number: 12, pr_title: 'Add billing service' },
          { pr_number: 15, pr_title: 'Fix invoice rounding' },
        ]);
      });

      it('returns fcs_issues as array of { issue_number, issue_title }', async () => {
        const { GET } = await import('@/app/api/assessments/[id]/route');
        const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

        const body = await response.json() as { fcs_issues: unknown };
        expect(body.fcs_issues).toEqual([
          { issue_number: 7, issue_title: 'Stripe webhook drops events' },
        ]);
      });

      it('returns participants as array of { github_login, status } objects', async () => {
        const { GET } = await import('@/app/api/assessments/[id]/route');
        const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

        const body = await response.json() as { participants: unknown };
        expect(body.participants).toEqual([
          { github_login: 'alice', status: 'submitted' },
          { github_login: 'bob', status: 'pending' },
        ]);
      });

      it('includes caller_role: admin in the response', async () => {
        const { GET } = await import('@/app/api/assessments/[id]/route');
        const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

        const body = await response.json() as { caller_role: unknown };
        expect(body.caller_role).toBe('admin');
      });
    });

    describe('Given an FCS assessment viewed by a participant', () => {
      beforeEach(() => {
        setupAuth();
        setupParticipantRole();
        setupFcsAssessment();
        questionsResult = { data: [], error: null };
        participantCountsResult = {
          data: [
            { id: 'p-001', status: 'submitted', github_username: 'alice' },
            { id: 'p-002', status: 'pending', github_username: 'bob' },
          ],
          error: null,
        };
        fcsPrsResult = {
          data: [{ pr_number: 12, pr_title: 'Add billing service' }],
          error: null,
        };
        fcsIssuesResult = {
          data: [{ issue_number: 7, issue_title: 'Stripe webhook drops events' }],
          error: null,
        };
        myParticipationResult = { data: makeParticipantRow(), error: null };
      });

      it('also receives fcs_prs and fcs_issues populated', async () => {
        const { GET } = await import('@/app/api/assessments/[id]/route');
        const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

        const body = await response.json() as { fcs_prs: unknown[]; fcs_issues: unknown[] };
        expect(body.fcs_prs).toHaveLength(1);
        expect(body.fcs_issues).toHaveLength(1);
      });

      it('returns participants as { total, completed } summary, not an array', async () => {
        const { GET } = await import('@/app/api/assessments/[id]/route');
        const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

        const body = await response.json() as { participants: unknown };
        expect(body.participants).toEqual({ total: 2, completed: 1 });
      });

      it('includes caller_role: participant in the response', async () => {
        const { GET } = await import('@/app/api/assessments/[id]/route');
        const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

        const body = await response.json() as { caller_role: unknown };
        expect(body.caller_role).toBe('participant');
      });
    });

    describe('Given a PRCC assessment', () => {
      beforeEach(() => {
        setupAuth();
        setupAdminRole();
        setupPrccAssessment();
        questionsResult = { data: [], error: null };
        participantCountsResult = { data: [], error: null };
        // Even if FCS tables had rows, they must not appear for prcc — ensure empty result
        fcsPrsResult = { data: [], error: null };
        fcsIssuesResult = { data: [], error: null };
        myParticipationResult = { data: null, error: null };
      });

      it('returns empty fcs_prs and fcs_issues arrays', async () => {
        const { GET } = await import('@/app/api/assessments/[id]/route');
        const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

        const body = await response.json() as { fcs_prs: unknown[]; fcs_issues: unknown[] };
        expect(body.fcs_prs).toEqual([]);
        expect(body.fcs_issues).toEqual([]);
      });

      it('does not query fcs_merged_prs or fcs_issue_sources for prcc type', async () => {
        const { GET } = await import('@/app/api/assessments/[id]/route');
        await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

        const tablesQueried = mockServiceClient.from.mock.calls.map(c => c[0]);
        expect(tablesQueried).not.toContain('fcs_merged_prs');
        expect(tablesQueried).not.toContain('fcs_issue_sources');
      });
    });
  });
});
