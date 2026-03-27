// Tests for POST /api/assessments/[id]/answers — answer submission endpoint.
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

vi.mock('@/lib/engine/relevance', () => ({
  detectRelevance: vi.fn(),
}));

vi.mock('@/lib/engine/pipeline', () => ({
  scoreAnswers: vi.fn().mockResolvedValue({ status: 'success', scored: [], failures: [] }),
  calculateAssessmentAggregate: vi.fn().mockReturnValue({ overallScore: 0, participantScores: new Map(), questionScores: new Map() }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from '@/lib/api/auth';
import { detectRelevance } from '@/lib/engine/relevance';
import { scoreAnswers, calculateAssessmentAggregate } from '@/lib/engine/pipeline';
import type { NextResponse } from 'next/server';

type RouteHandler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<NextResponse>;
let POST: RouteHandler;

// ---------------------------------------------------------------------------
// Mock chain builder — same pattern as [id].test.ts
// ---------------------------------------------------------------------------

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(() => Promise.resolve(resolver())),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
    insert: vi.fn(() => Promise.resolve(resolver())),
    update: vi.fn(),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  return chain;
}

const SUCCESS = { data: null, error: null };

// ---------------------------------------------------------------------------
// Mock state
// ---------------------------------------------------------------------------

let participantResult: { data: unknown; error: unknown } = { data: null, error: null };
let questionsResult: { data: unknown; error: unknown } = { data: [], error: null };
let insertAnswersResult: { data: unknown; error: unknown } = { data: null, error: null };
let allParticipantsResult: { data: unknown; error: unknown } = { data: [], error: null };
let assessmentResult: { data: unknown; error: unknown } = { data: null, error: null };

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'assessment_participants') return makeChain(() => participantResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
};

const mockServiceClient = {
  from: vi.fn((table: string) => {
    if (table === 'assessment_questions') return makeChain(() => questionsResult);
    if (table === 'participant_answers') {
      // Return empty list for select (existing answers), success for insert/update
      const chain = makeChain(() => ({ data: [], error: null }));
      chain.insert.mockReturnValue(Promise.resolve(insertAnswersResult));
      return chain;
    }
    if (table === 'assessment_participants') return makeChain(() => allParticipantsResult);
    if (table === 'assessments') return makeChain(() => assessmentResult);
    return makeChain(() => SUCCESS);
  }),
  rpc: vi.fn(),
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
const PARTICIPANT_ID = 'participant-uuid-001';
const ORG_ID = 'org-uuid-001';

const QUESTION_1 = {
  id: 'question-001',
  org_id: ORG_ID,
  assessment_id: ASSESSMENT_ID,
  question_number: 1,
  naur_layer: 'world_to_program',
  question_text: 'What does this feature do?',
  weight: 1,
  reference_answer: null,
  aggregate_score: null,
  created_at: '2026-01-01T00:00:00Z',
};

const QUESTION_2 = {
  id: 'question-002',
  org_id: ORG_ID,
  assessment_id: ASSESSMENT_ID,
  question_number: 2,
  naur_layer: 'program_to_domain',
  question_text: 'How does it interact with the DB?',
  weight: 1,
  reference_answer: null,
  aggregate_score: null,
  created_at: '2026-01-01T00:00:00Z',
};

const PARTICIPANT_ROW = {
  id: PARTICIPANT_ID,
  org_id: ORG_ID,
  assessment_id: ASSESSMENT_ID,
  user_id: AUTH_USER.id,
  status: 'pending',
  submitted_at: null,
  github_user_id: 1001,
  github_username: 'alice',
  created_at: '2026-01-01T00:00:00Z',
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/assessments/${ASSESSMENT_ID}/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setupAuth() {
  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
}

function setupParticipant(overrides: Record<string, unknown> = {}) {
  participantResult = { data: { ...PARTICIPANT_ROW, ...overrides }, error: null };
}

function setupQuestions() {
  questionsResult = { data: [QUESTION_1, QUESTION_2], error: null };
}

function setupAllRelevance() {
  vi.mocked(detectRelevance)
    .mockResolvedValue({ success: true, data: { is_relevant: true, explanation: 'Good answer' } });
}

function setupPendingParticipant() {
  setupAuth();
  setupParticipant({ status: 'pending' });
  setupQuestions();
}

function setupTwoParticipantsOneStillPending() {
  allParticipantsResult = {
    data: [
      { id: PARTICIPANT_ID, status: 'submitted' },
      { id: 'participant-002', status: 'pending' },
    ],
    error: null,
  };
}

function setupSubmittedParticipant() {
  setupAuth();
  setupParticipant({ status: 'submitted' });
  setupQuestions();
}

async function postAnswers(body: unknown) {
  return POST(
    makeRequest(body),
    { params: Promise.resolve({ id: ASSESSMENT_ID }) },
  );
}

// ---------------------------------------------------------------------------
// Tests: POST /api/assessments/[id]/answers
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();
  process.env['OPENROUTER_API_KEY'] = 'test-key';
  ({ POST } = await import('@/app/api/assessments/' + '[id]/answers/route'));
  participantResult = { data: null, error: null };
  questionsResult = { data: [], error: null };
  insertAnswersResult = { data: null, error: null };
  allParticipantsResult = { data: [], error: null };
  assessmentResult = { data: null, error: null };
});

describe('POST /api/assessments/[id]/answers', () => {
  describe('status-only responses', () => {
    it.each([
      {
        name: 'Given an unauthenticated request then it returns 401',
        setup: async () => {
          const { ApiError } = await import('@/lib/api/errors');
          vi.mocked(requireAuth).mockRejectedValue(new ApiError(401, 'Unauthenticated'));
        },
        body: { answers: [] },
        expectedStatus: 401,
      },
      {
        name: 'Given a user who is not a participant then it returns 403',
        setup: async () => {
          setupAuth();
          participantResult = { data: null, error: null };
        },
        body: { answers: [{ question_id: 'question-001', answer_text: 'foo' }] },
        expectedStatus: 403,
      },
      {
        name: 'Given a participant who already submitted then it returns 422',
        setup: async () => {
          setupSubmittedParticipant();
        },
        body: { answers: [{ question_id: 'question-001', answer_text: 'foo' }] },
        expectedStatus: 422,
      },
      {
        name: 'Given an invalid request body then it returns 422 for missing answers array',
        setup: async () => {
          setupAuth();
        },
        body: {},
        expectedStatus: 422,
      },
    ])('$name', async ({ setup, body, expectedStatus }) => {
      await setup();

      const response = await postAnswers(body);

      expect(response.status).toBe(expectedStatus);
    });
  });

  describe('Given a valid participant submitting answers for the first time', () => {
    it('then answers are stored and relevance checked', async () => {
      setupPendingParticipant();
      setupAllRelevance();
      setupTwoParticipantsOneStillPending();

      const response = await postAnswers({
        answers: [
          { question_id: 'question-001', answer_text: 'First answer' },
          { question_id: 'question-002', answer_text: 'Second answer' },
        ],
      });

      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body.status).toBe('accepted');
      expect(detectRelevance).toHaveBeenCalledTimes(2);
    });
  });

  describe('Given all answers are relevant', () => {
    it('then participant status is set to submitted', async () => {
      setupPendingParticipant();
      setupAllRelevance();
      setupTwoParticipantsOneStillPending();

      const response = await postAnswers({
        answers: [
          { question_id: 'question-001', answer_text: 'Good answer 1' },
          { question_id: 'question-002', answer_text: 'Good answer 2' },
        ],
      });

      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body.status).toBe('accepted');
      expect(body.participation).toBeDefined();
    });
  });

  describe('Given some answers are irrelevant', () => {
    it('then it returns relevance_failed with explanations', async () => {
      setupPendingParticipant();

      vi.mocked(detectRelevance)
        .mockResolvedValueOnce({ success: true, data: { is_relevant: true, explanation: 'Good' } })
        .mockResolvedValueOnce({ success: true, data: { is_relevant: false, explanation: 'Not relevant' } });

      const response = await postAnswers({
        answers: [
          { question_id: 'question-001', answer_text: 'Good answer' },
          { question_id: 'question-002', answer_text: 'asdf' },
        ],
      });

      expect(response.status).toBe(200);
      const body = await response.json() as { status: string; results: Array<{ question_id: string; is_relevant: boolean; explanation: string | null }> };
      expect(body.status).toBe('relevance_failed');
      const failedResult = body.results.find(r => r.question_id === 'question-002');
      expect(failedResult?.is_relevant).toBe(false);
      expect(failedResult?.explanation).toBe('Not relevant');
    });
  });

  describe('Given a first submission missing answers for some questions', () => {
    it('then it returns 422', async () => {
      setupPendingParticipant();

      const response = await postAnswers({
        answers: [
          { question_id: 'question-001', answer_text: 'Only one answer' },
          // missing question-002
        ],
      });

      expect(response.status).toBe(422);
    });
  });

  describe('Given the last participant submits', () => {
    it('then scoring is triggered automatically', async () => {
      setupPendingParticipant();
      setupAllRelevance();

      // Both participants submitted — scoring IS triggered
      allParticipantsResult = {
        data: [
          { id: PARTICIPANT_ID, status: 'submitted' },
          { id: 'participant-002', status: 'submitted' },
        ],
        error: null,
      };
      assessmentResult = {
        data: { id: ASSESSMENT_ID, org_id: ORG_ID, type: 'prcc', status: 'awaiting_responses' },
        error: null,
      };

      const response = await postAnswers({
        answers: [
          { question_id: 'question-001', answer_text: 'Answer 1' },
          { question_id: 'question-002', answer_text: 'Answer 2' },
        ],
      });

      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body.status).toBe('accepted');
      expect(scoreAnswers).toHaveBeenCalledOnce();
      expect(calculateAssessmentAggregate).toHaveBeenCalledOnce();
    });

    it('then it returns 500 when scoring fails', async () => {
      setupPendingParticipant();
      setupAllRelevance();

      allParticipantsResult = {
        data: [
          { id: PARTICIPANT_ID, status: 'submitted' },
          { id: 'participant-002', status: 'submitted' },
        ],
        error: null,
      };
      assessmentResult = {
        data: { id: ASSESSMENT_ID, org_id: ORG_ID, type: 'prcc', status: 'awaiting_responses' },
        error: null,
      };

      vi.mocked(scoreAnswers).mockRejectedValueOnce(new Error('LLM unavailable'));

      const response = await postAnswers({
        answers: [
          { question_id: 'question-001', answer_text: 'Answer 1' },
          { question_id: 'question-002', answer_text: 'Answer 2' },
        ],
      });

      expect(response.status).toBe(500);
    });
  });

  describe('Given a participant who has exhausted max attempts', () => {
    it('then it returns 422', async () => {
      setupPendingParticipant();

      // Simulate 3 existing attempt sets with irrelevant answers (attempt_number 1, 2, 3)
      const exhaustedAnswers = [
        { question_id: 'question-001', attempt_number: 1, is_relevant: false },
        { question_id: 'question-002', attempt_number: 1, is_relevant: false },
        { question_id: 'question-001', attempt_number: 2, is_relevant: false },
        { question_id: 'question-002', attempt_number: 2, is_relevant: false },
        { question_id: 'question-001', attempt_number: 3, is_relevant: false },
        { question_id: 'question-002', attempt_number: 3, is_relevant: false },
      ];
      // Override participant_answers select to return exhausted state
      mockServiceClient.from.mockImplementation((table: string) => {
        if (table === 'assessment_questions') return makeChain(() => questionsResult);
        if (table === 'participant_answers') {
          const chain = makeChain(() => ({ data: exhaustedAnswers, error: null }));
          chain.insert.mockReturnValue(Promise.resolve(insertAnswersResult));
          return chain;
        }
        if (table === 'assessment_participants') return makeChain(() => allParticipantsResult);
        if (table === 'assessments') return makeChain(() => assessmentResult);
        return makeChain(() => SUCCESS);
      });

      const response = await postAnswers({
        answers: [
          { question_id: 'question-001', answer_text: 'Still irrelevant' },
          { question_id: 'question-002', answer_text: 'Still irrelevant' },
        ],
      });

      expect(response.status).toBe(422);
    });
  });
});
