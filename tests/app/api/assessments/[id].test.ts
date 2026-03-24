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
let answersResult: { data: unknown; error: unknown } = { data: [], error: null };

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
    if (table === 'participant_answers') return makeChain(() => answersResult);
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

function makeAnswer(overrides: Record<string, unknown> = {}) {
  return {
    question_id: 'question-001',
    answer_text: 'My answer.',
    score: 0.9,
    score_rationale: 'Good answer.',
    is_reassessment: false,
    attempt_number: 1,
    created_at: '2026-01-02T00:00:00Z',
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
  const question = makeQuestion();

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
  answersResult = { data: [], error: null };
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
        data: [{ id: PARTICIPANT_ID, status: 'submitted' }],
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
        data: [{ id: PARTICIPANT_ID, status: 'submitted' }],
        error: null,
      };
      myParticipationResult = { data: makeParticipantRow(), error: null };
      answersResult = { data: [makeAnswer()], error: null };
    });

    it('then reference answers are null', async () => {
      const { GET } = await import('@/app/api/assessments/[id]/route');
      const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

      expect(response.status).toBe(200);
      const body = await response.json() as { questions: Array<{ reference_answer: unknown }> };
      expect(body.questions[0]?.reference_answer).toBeNull();
    });

    it('then my_scores is populated with their scores', async () => {
      const { GET } = await import('@/app/api/assessments/[id]/route');
      const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

      expect(response.status).toBe(200);
      const body = await response.json() as {
        my_scores: {
          questions: Array<{
            question_id: string;
            my_answer: string;
            score: number;
            score_rationale: string;
          }>;
          reassessment_available: boolean;
          last_reassessment_at: string | null;
        } | null;
      };
      expect(body.my_scores).not.toBeNull();
      expect(body.my_scores?.questions).toHaveLength(1);
      expect(body.my_scores?.questions[0]?.question_id).toBe('question-001');
      expect(body.my_scores?.questions[0]?.score).toBe(0.9);
      expect(body.my_scores?.questions[0]?.my_answer).toBe('My answer.');
      expect(body.my_scores?.reassessment_available).toBe(true);
      expect(body.my_scores?.last_reassessment_at).toBeNull();
    });
  });

  describe('Given a valid request', () => {
    it('then it returns the full response shape', async () => {
      setupAuth();
      setupAdminRole();
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
          { id: 'p-001', status: 'submitted' },
          { id: 'p-002', status: 'pending' },
        ],
        error: null,
      };
      myParticipationResult = { data: null, error: null };

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
      expect(body.my_participation).toBeNull();
      expect(body.my_scores).toBeNull();
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

  describe('Given a completed FCS assessment viewed by an Org Admin who is also a participant', () => {
    it('then my_scores is null (admin exclusion)', async () => {
      setupAuth();
      setupAdminRole();
      assessmentResult = {
        data: makeAssessmentRow({ type: 'fcs', status: 'completed', pr_number: null }),
        error: null,
      };
      questionsResult = { data: [makeQuestion()], error: null };
      participantCountsResult = { data: [{ id: PARTICIPANT_ID, status: 'submitted' }], error: null };
      // Admin is also listed as a participant
      myParticipationResult = { data: makeParticipantRow(), error: null };
      answersResult = { data: [makeAnswer()], error: null };

      const { GET } = await import('@/app/api/assessments/[id]/route');
      const response = await GET(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });

      expect(response.status).toBe(200);
      const body = await response.json() as { my_scores: unknown };
      expect(body.my_scores).toBeNull();
    });
  });
});
