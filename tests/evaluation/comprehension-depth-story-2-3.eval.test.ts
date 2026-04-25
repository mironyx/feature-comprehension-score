// Adversarial evaluation tests for Story 2.3 — Depth-aware scoring calibration.
// Issue #224.
//
// One genuine gap found: [id].answers.test.ts asserts scoreAnswers is called when
// the last participant submits but never verifies the comprehensionDepth argument.
// If fetchScoringData stopped reading config_comprehension_depth from the DB, or
// if the value were not forwarded to scoreAnswers(), all existing tests would still
// pass because they only assert call count, not arguments.
//
// Mock pattern mirrors [id].answers.test.ts (helpers are not exported from there).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any import that depends on them
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
  calculateAssessmentAggregate: vi.fn().mockReturnValue({
    overallScore: 0,
    participantScores: new Map(),
    questionScores: new Map(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from '@/lib/api/auth';
import { detectRelevance } from '@/lib/engine/relevance';
import { scoreAnswers } from '@/lib/engine/pipeline';
import type { NextResponse } from 'next/server';

type RouteHandler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<NextResponse>;
let POST: RouteHandler;

// ---------------------------------------------------------------------------
// Mock chain builder — same pattern as [id].answers.test.ts
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
    delete: vi.fn(),
    is: vi.fn(),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.delete.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ASSESSMENT_ID = 'assess-uuid-001';
const PARTICIPANT_ID = 'participant-uuid-001';
const ORG_ID = 'org-uuid-001';

const AUTH_USER = {
  id: 'user-001',
  email: 'alice@example.com',
  githubUserId: 1001,
  githubUsername: 'alice',
};

const QUESTION_1 = {
  id: 'question-001',
  org_id: ORG_ID,
  assessment_id: ASSESSMENT_ID,
  question_number: 1,
  naur_layer: 'world_to_program',
  question_text: 'What does this feature do?',
  weight: 1,
  reference_answer: 'It scores answers.',
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

// All participants submitted — triggers scoring path
const ALL_SUBMITTED = [
  { id: PARTICIPANT_ID, status: 'submitted' },
  { id: 'participant-002', status: 'submitted' },
];

// ---------------------------------------------------------------------------
// Mock client state (mutated per test)
// ---------------------------------------------------------------------------

const mockUserClient = {
  from: vi.fn(() =>
    makeChain(() => ({ data: PARTICIPANT_ROW, error: null })),
  ),
};

let assessmentDepth: string = 'conceptual';

const mockServiceClient = {
  from: vi.fn((table: string) => {
    if (table === 'assessment_questions') {
      return makeChain(() => ({ data: [QUESTION_1], error: null }));
    }
    if (table === 'participant_answers') {
      const chain = makeChain(() => ({ data: [], error: null }));
      chain.insert.mockReturnValue(Promise.resolve({ data: null, error: null }));
      return chain;
    }
    if (table === 'assessment_participants') {
      return makeChain(() => ({ data: ALL_SUBMITTED, error: null }));
    }
    if (table === 'assessments') {
      return makeChain(() => ({
        data: { config_comprehension_depth: assessmentDepth },
        error: null,
      }));
    }
    return makeChain(() => ({ data: null, error: null }));
  }),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();
  process.env['OPENROUTER_API_KEY'] = 'test-key';
  ({ POST } = await import('@/app/api/assessments/' + '[id]/answers/route'));
  assessmentDepth = 'conceptual';

  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  vi.mocked(detectRelevance).mockResolvedValue({
    success: true,
    data: [{ is_relevant: true, explanation: 'Good answer' }],
  });
  vi.mocked(scoreAnswers).mockResolvedValue({
    status: 'success',
    scored: [],
    failures: [],
  });

  mockServiceClient.from.mockImplementation((table: string) => {
    if (table === 'assessment_questions') {
      return makeChain(() => ({ data: [QUESTION_1], error: null }));
    }
    if (table === 'participant_answers') {
      const chain = makeChain(() => ({ data: [], error: null }));
      chain.insert.mockReturnValue(Promise.resolve({ data: null, error: null }));
      return chain;
    }
    if (table === 'assessment_participants') {
      return makeChain(() => ({ data: ALL_SUBMITTED, error: null }));
    }
    if (table === 'assessments') {
      return makeChain(() => ({
        data: { config_comprehension_depth: assessmentDepth },
        error: null,
      }));
    }
    return makeChain(() => ({ data: null, error: null }));
  });
});

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/assessments/${ASSESSMENT_ID}/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function postAnswers(body: unknown) {
  return POST(
    makeRequest(body),
    { params: Promise.resolve({ id: ASSESSMENT_ID }) },
  );
}

// ---------------------------------------------------------------------------
// Adversarial tests
//
// AC-5: comprehensionDepth threaded from answers service → pipeline → scoreAnswer
// The gap: [id].answers.test.ts only asserts scoreAnswers is called once (call count).
// It never asserts WHICH comprehensionDepth was forwarded. If fetchScoringData did not
// read config_comprehension_depth from the DB, or if triggerScoring did not pass it
// through to scoreAnswers(), no existing test would catch the regression.
// ---------------------------------------------------------------------------

describe('POST /api/assessments/[id]/answers — comprehensionDepth threading (Story 2.3 AC-5)', () => {
  describe('given the assessment has config_comprehension_depth "detailed"', () => {
    it('passes comprehensionDepth "detailed" to scoreAnswers when last participant submits', async () => {
      assessmentDepth = 'detailed';

      const response = await postAnswers({
        answers: [{ question_id: 'question-001', answer_text: 'A good detailed answer.' }],
      });

      expect(response.status).toBe(200);
      expect(scoreAnswers).toHaveBeenCalledOnce();
      expect(scoreAnswers).toHaveBeenCalledWith(
        expect.objectContaining({ comprehensionDepth: 'detailed' }),
      );
    });
  });

  describe('given the assessment has config_comprehension_depth "conceptual"', () => {
    it('passes comprehensionDepth "conceptual" to scoreAnswers when last participant submits', async () => {
      assessmentDepth = 'conceptual';

      const response = await postAnswers({
        answers: [{ question_id: 'question-001', answer_text: 'A good conceptual answer.' }],
      });

      expect(response.status).toBe(200);
      expect(scoreAnswers).toHaveBeenCalledOnce();
      expect(scoreAnswers).toHaveBeenCalledWith(
        expect.objectContaining({ comprehensionDepth: 'conceptual' }),
      );
    });
  });
});
