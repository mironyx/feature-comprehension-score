// Tests for loadAssessmentDetail — the server-side Supabase loader that replaces
// the broken relative-URL self-fetch in /assessments/[id].
// Design reference: docs/design/lld-v8-assessment-detail.md §T2
// Issue: #376

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports that depend on them
// ---------------------------------------------------------------------------

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { loadAssessmentDetail } from '@/app/(authenticated)/assessments/[id]/load-assessment-detail';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'user-001';
const ASSESSMENT_ID = 'assessment-abc';
const ORG_ID = 'org-xyz';
const PARTICIPANT_ID = 'participant-p1';

// ---------------------------------------------------------------------------
// Chain builder — replicates pattern from tests/app/api/assessments/[id].test.ts
//
// Produces a chainable query builder where:
//   .select(), .eq(), .order() — return `chain` (chainable, also thenable)
//   .single()                  — returns Promise (terminal)
//   .maybeSingle()             — returns Promise (terminal)
//   await chain                — resolves via native Promise.then()
// ---------------------------------------------------------------------------

function makeChain(resolver: () => { data: unknown; error: unknown }) {
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
// Mock state — configured per test via setup helpers below
// ---------------------------------------------------------------------------

let assessmentResult: { data: unknown; error: unknown } = { data: null, error: null };
let orgMembershipResult: { data: unknown; error: unknown } = { data: null, error: null };
let myParticipationResult: { data: unknown; error: unknown } = { data: null, error: null };
let questionsResult: { data: unknown; error: unknown } = { data: [], error: null };
let allParticipantsResult: { data: unknown; error: unknown } = { data: [], error: null };
let fcsPrsResult: { data: unknown; error: unknown } = { data: [], error: null };
let fcsIssuesResult: { data: unknown; error: unknown } = { data: [], error: null };

// user-scoped client (RLS applies)
const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'assessments') return makeChain(() => assessmentResult);
    if (table === 'user_organisations') return makeChain(() => orgMembershipResult);
    if (table === 'assessment_participants') return makeChain(() => myParticipationResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
};

// service-role client (bypasses RLS — used for questions and all-participants)
const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === 'assessment_questions') return makeChain(() => questionsResult);
    if (table === 'assessment_participants') return makeChain(() => allParticipantsResult);
    if (table === 'fcs_merged_prs') return makeChain(() => fcsPrsResult);
    if (table === 'fcs_issue_sources') return makeChain(() => fcsIssuesResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAssessmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSESSMENT_ID,
    org_id: ORG_ID,
    type: 'fcs' as const,
    status: 'active',
    repository_id: 'repo-001',
    pr_number: null,
    pr_head_sha: null,
    feature_name: 'Scoring Engine',
    feature_description: 'Measures comprehension',
    aggregate_score: null,
    scoring_incomplete: false,
    artefact_quality: null,
    conclusion: null,
    config_enforcement_mode: 'advisory',
    config_score_threshold: 70,
    config_question_count: 3,
    skip_reason: null,
    skipped_at: null,
    rubric_progress: null,
    rubric_progress_updated_at: null,
    rubric_error_code: null,
    rubric_retry_count: 0,
    rubric_error_retryable: null,
    created_at: '2026-04-01T00:00:00Z',
    repositories: { github_repo_name: 'feature-comprehension-score' },
    organisations: { github_org_name: 'acme' },
    ...overrides,
  };
}

function makeMyParticipantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PARTICIPANT_ID,
    status: 'pending',
    submitted_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setupValidAssessment(overrides: Record<string, unknown> = {}) {
  assessmentResult = { data: makeAssessmentRow(overrides), error: null };
}

function setupAdminRole() {
  orgMembershipResult = { data: { github_role: 'admin' }, error: null };
}

function setupParticipantRole() {
  // No org membership row means non-admin → participant
  orgMembershipResult = { data: null, error: null };
}

// ---------------------------------------------------------------------------
// Convenience: invoke the function under test with the shared mocks
// ---------------------------------------------------------------------------

async function callLoader(
  userId = USER_ID,
  assessmentId = ASSESSMENT_ID,
) {
  return loadAssessmentDetail(
    mockUserClient as never,
    mockAdminClient as never,
    userId,
    assessmentId,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to safe defaults
  assessmentResult = { data: null, error: null };
  orgMembershipResult = { data: null, error: null };
  myParticipationResult = { data: null, error: null };
  questionsResult = { data: [], error: null };
  allParticipantsResult = { data: [], error: null };
  fcsPrsResult = { data: [], error: null };
  fcsIssuesResult = { data: [], error: null };
});

// ---------------------------------------------------------------------------
// Property 1 — Given a valid assessmentId, returns AssessmentDetailResponse (not null)
// [issue #376]
// ---------------------------------------------------------------------------

describe('Given a valid, accessible assessment', () => {
  it('When loadAssessmentDetail is called, Then it returns a non-null AssessmentDetailResponse', async () => {
    setupValidAssessment();
    setupParticipantRole();
    myParticipationResult = { data: makeMyParticipantRow(), error: null };

    const result = await callLoader();

    expect(result).not.toBeNull();
    expect(result?.id).toBe(ASSESSMENT_ID);
  });
});

// ---------------------------------------------------------------------------
// Property 2 — Given PGRST116 error from Supabase, returns null (not found / RLS hidden)
// [issue #376]
// ---------------------------------------------------------------------------

describe('Given the assessment is not found (PGRST116)', () => {
  it('When loadAssessmentDetail is called, Then it returns null', async () => {
    assessmentResult = { data: null, error: { code: 'PGRST116', message: 'The result contains 0 rows' } };

    const result = await callLoader();

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Property 3 — Given data is null with no error, returns null
// [issue #376]
// ---------------------------------------------------------------------------

describe('Given data is null with no DB error', () => {
  it('When loadAssessmentDetail is called, Then it returns null', async () => {
    assessmentResult = { data: null, error: null };

    const result = await callLoader();

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Property 4 — For admin user (github_role='admin'), caller_role is 'admin'
// [lld §T2, issue #376]
// ---------------------------------------------------------------------------

describe('Given the user has github_role admin in user_organisations', () => {
  it('When loadAssessmentDetail is called, Then caller_role in the response is admin', async () => {
    setupValidAssessment();
    setupAdminRole();
    myParticipationResult = { data: null, error: null };

    const result = await callLoader();

    expect(result?.caller_role).toBe('admin');
  });
});

// ---------------------------------------------------------------------------
// Property 5a — For a non-admin user (github_role='member'), caller_role is 'participant'
// [lld §T2, issue #376]
// ---------------------------------------------------------------------------

describe('Given the user has github_role member in user_organisations', () => {
  it('When loadAssessmentDetail is called, Then caller_role in the response is participant', async () => {
    setupValidAssessment();
    orgMembershipResult = { data: { github_role: 'member' }, error: null };
    myParticipationResult = { data: makeMyParticipantRow(), error: null };

    const result = await callLoader();

    expect(result?.caller_role).toBe('participant');
  });
});

// ---------------------------------------------------------------------------
// Property 5b — For a user with no org row, caller_role is 'participant'
// [lld §T2, issue #376]
// ---------------------------------------------------------------------------

describe('Given the user has no row in user_organisations', () => {
  it('When loadAssessmentDetail is called, Then caller_role in the response is participant', async () => {
    setupValidAssessment();
    setupParticipantRole();
    myParticipationResult = { data: makeMyParticipantRow(), error: null };

    const result = await callLoader();

    expect(result?.caller_role).toBe('participant');
  });
});

// ---------------------------------------------------------------------------
// Property 6 — my_participation reflects the user's own participation row
// [issue #376]
// ---------------------------------------------------------------------------

describe('Given the user has a participation row with status submitted', () => {
  it('When loadAssessmentDetail is called, Then my_participation reflects that row', async () => {
    setupValidAssessment();
    setupParticipantRole();
    myParticipationResult = {
      data: makeMyParticipantRow({ status: 'submitted', submitted_at: '2026-04-10T12:00:00Z' }),
      error: null,
    };

    const result = await callLoader();

    expect(result?.my_participation).toEqual({
      participant_id: PARTICIPANT_ID,
      status: 'submitted',
      submitted_at: '2026-04-10T12:00:00Z',
    });
  });
});

describe('Given the user has no participation row', () => {
  it('When loadAssessmentDetail is called, Then my_participation is null', async () => {
    setupValidAssessment();
    setupParticipantRole();
    myParticipationResult = { data: null, error: null };

    const result = await callLoader();

    expect(result?.my_participation).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Property 7 — For type='fcs', fcs_prs and fcs_issues are populated
// [lld §I1, T1 AC, issue #376]
// ---------------------------------------------------------------------------

describe('Given an FCS assessment with PRs and issues', () => {
  it('When loadAssessmentDetail is called, Then fcs_prs is populated from fcs_merged_prs', async () => {
    setupValidAssessment({ type: 'fcs' });
    setupAdminRole();
    myParticipationResult = { data: null, error: null };
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

    const result = await callLoader();

    expect(result?.fcs_prs).toEqual([
      { pr_number: 12, pr_title: 'Add billing service' },
      { pr_number: 15, pr_title: 'Fix invoice rounding' },
    ]);
  });

  it('When loadAssessmentDetail is called, Then fcs_issues is populated from fcs_issue_sources', async () => {
    setupValidAssessment({ type: 'fcs' });
    setupAdminRole();
    myParticipationResult = { data: null, error: null };
    fcsPrsResult = { data: [], error: null };
    fcsIssuesResult = {
      data: [{ issue_number: 7, issue_title: 'Stripe webhook drops events' }],
      error: null,
    };

    const result = await callLoader();

    expect(result?.fcs_issues).toEqual([
      { issue_number: 7, issue_title: 'Stripe webhook drops events' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Property 8 — For type='prcc', fcs_prs and fcs_issues are empty arrays
// [lld §T1 AC, issue #376]
// ---------------------------------------------------------------------------

describe('Given a PRCC assessment', () => {
  it('When loadAssessmentDetail is called, Then fcs_prs is an empty array', async () => {
    setupValidAssessment({ type: 'prcc', pr_number: 42, pr_head_sha: 'abc123' });
    setupAdminRole();
    myParticipationResult = { data: null, error: null };

    const result = await callLoader();

    expect(result?.fcs_prs).toEqual([]);
  });

  it('When loadAssessmentDetail is called, Then fcs_issues is an empty array', async () => {
    setupValidAssessment({ type: 'prcc', pr_number: 42, pr_head_sha: 'abc123' });
    setupAdminRole();
    myParticipationResult = { data: null, error: null };

    const result = await callLoader();

    expect(result?.fcs_issues).toEqual([]);
  });

  it('When loadAssessmentDetail is called, Then fcs_merged_prs is not queried', async () => {
    setupValidAssessment({ type: 'prcc', pr_number: 42, pr_head_sha: 'abc123' });
    setupAdminRole();
    myParticipationResult = { data: null, error: null };

    await callLoader();

    const tablesQueried = mockAdminClient.from.mock.calls.map((c: unknown[]) => c[0]);
    expect(tablesQueried).not.toContain('fcs_merged_prs');
    expect(tablesQueried).not.toContain('fcs_issue_sources');
  });
});

// ---------------------------------------------------------------------------
// Property 9 — repository_full_name is composed as org_name/repo_name
// [issue #376, lld §T1 buildResponse]
// ---------------------------------------------------------------------------

describe('Given an assessment with a specific org and repo name', () => {
  it('When loadAssessmentDetail is called, Then repository_full_name is org/repo', async () => {
    setupValidAssessment({
      organisations: { github_org_name: 'myorg' },
      repositories: { github_repo_name: 'my-repo' },
    });
    setupParticipantRole();
    myParticipationResult = { data: makeMyParticipantRow(), error: null };

    const result = await callLoader();

    expect(result?.repository_full_name).toBe('myorg/my-repo');
  });

  it('When loadAssessmentDetail is called, Then repository_name is the bare repo name', async () => {
    setupValidAssessment({
      organisations: { github_org_name: 'myorg' },
      repositories: { github_repo_name: 'my-repo' },
    });
    setupParticipantRole();
    myParticipationResult = { data: makeMyParticipantRow(), error: null };

    const result = await callLoader();

    expect(result?.repository_name).toBe('my-repo');
  });
});

// ---------------------------------------------------------------------------
// Property 10 — Questions are fetched using adminSupabase (not userClient)
// [issue #376 — org_id-scoped service-role access works for questions]
// ---------------------------------------------------------------------------

describe('Given a valid FCS assessment', () => {
  it('When loadAssessmentDetail is called, Then questions are fetched via the admin client', async () => {
    setupValidAssessment({ type: 'fcs' });
    setupAdminRole();
    myParticipationResult = { data: null, error: null };
    questionsResult = {
      data: [
        {
          id: 'q-001',
          question_number: 1,
          naur_layer: 'world_to_program',
          question_text: 'What does this feature do?',
          weight: 2,
          reference_answer: 'It does X.',
          hint: null,
          aggregate_score: null,
        },
      ],
      error: null,
    };

    await callLoader();

    const adminTablesQueried = mockAdminClient.from.mock.calls.map((c: unknown[]) => c[0]);
    expect(adminTablesQueried).toContain('assessment_questions');
  });

  it('When loadAssessmentDetail is called, Then assessment_questions is NOT queried on the user client', async () => {
    setupValidAssessment({ type: 'fcs' });
    setupAdminRole();
    myParticipationResult = { data: null, error: null };

    await callLoader();

    const userTablesQueried = mockUserClient.from.mock.calls.map((c: unknown[]) => c[0]);
    expect(userTablesQueried).not.toContain('assessment_questions');
  });
});

// ---------------------------------------------------------------------------
// Regression — #376: relative-URL fetch replaced by direct Supabase call
// The function under test must NOT call global fetch() at all.
// If it did, a Node.js server component would throw ERR_INVALID_URL.
// ---------------------------------------------------------------------------

describe('Regression #376 — no relative-URL fetch', () => {
  it('When loadAssessmentDetail is called, Then global fetch is never called', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    setupValidAssessment();
    setupParticipantRole();
    myParticipationResult = { data: makeMyParticipantRow(), error: null };

    await callLoader();

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Shape contract — the returned object matches the full AssessmentDetailResponse shape
// [issue #376, lld §T1]
// ---------------------------------------------------------------------------

describe('Given a valid FCS assessment viewed by an admin', () => {
  it('When loadAssessmentDetail is called, Then the response includes all required top-level fields', async () => {
    setupValidAssessment({
      type: 'fcs',
      status: 'active',
      feature_name: 'Scoring Engine',
      feature_description: 'Measures comprehension',
      pr_number: null,
      pr_head_sha: null,
      aggregate_score: null,
      scoring_incomplete: false,
      artefact_quality: null,
      conclusion: null,
      config_enforcement_mode: 'advisory',
      config_score_threshold: 70,
      config_question_count: 3,
      created_at: '2026-04-01T00:00:00Z',
    });
    setupAdminRole();
    myParticipationResult = { data: null, error: null };
    allParticipantsResult = {
      data: [
        { id: 'p-001', status: 'submitted', github_username: 'alice' },
        { id: 'p-002', status: 'pending', github_username: 'bob' },
      ],
      error: null,
    };
    fcsPrsResult = { data: [{ pr_number: 42, pr_title: 'Add scoring engine' }], error: null };
    fcsIssuesResult = { data: [{ issue_number: 7, issue_title: 'Fix calculation bug' }], error: null };

    const result = await callLoader();

    expect(result).not.toBeNull();
    // Core identification fields
    expect(result?.id).toBe(ASSESSMENT_ID);
    expect(result?.type).toBe('fcs');
    expect(result?.status).toBe('active');
    // Repository fields
    expect(result?.repository_name).toBe('feature-comprehension-score');
    expect(result?.repository_full_name).toBe('acme/feature-comprehension-score');
    // Rubric fields
    expect(result).toHaveProperty('rubric_progress');
    expect(result).toHaveProperty('rubric_progress_updated_at');
    expect(result).toHaveProperty('rubric_error_code');
    expect(result).toHaveProperty('rubric_retry_count');
    expect(result).toHaveProperty('rubric_error_retryable');
    // Role
    expect(result?.caller_role).toBe('admin');
    // Config
    expect(result?.config).toEqual({
      enforcement_mode: 'advisory',
      score_threshold: 70,
      question_count: 3,
    });
    // created_at
    expect(result?.created_at).toBe('2026-04-01T00:00:00Z');
    // skip_info null when skip_reason and skipped_at are both null
    expect(result?.skip_info).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// skip_info — present when assessment has skip_reason and skipped_at
// [issue #376]
// ---------------------------------------------------------------------------

describe('Given an assessment with skip_reason and skipped_at', () => {
  it('When loadAssessmentDetail is called, Then skip_info is populated', async () => {
    setupValidAssessment({
      skip_reason: 'author-excluded',
      skipped_at: '2026-04-15T09:00:00Z',
    });
    setupParticipantRole();
    myParticipationResult = { data: makeMyParticipantRow(), error: null };

    const result = await callLoader();

    expect(result?.skip_info).toEqual({
      reason: 'author-excluded',
      skipped_at: '2026-04-15T09:00:00Z',
    });
  });
});

// ---------------------------------------------------------------------------
// Admin caller receives full participant list; participant caller receives summary
// [lld §I2, T1 AC, issue #376]
// ---------------------------------------------------------------------------

describe('Given an FCS assessment viewed by an admin', () => {
  it('When loadAssessmentDetail is called, Then participants is an array of { github_login, status }', async () => {
    setupValidAssessment({ type: 'fcs' });
    setupAdminRole();
    myParticipationResult = { data: null, error: null };
    allParticipantsResult = {
      data: [
        { id: 'p-001', status: 'submitted', github_username: 'alice' },
        { id: 'p-002', status: 'pending', github_username: 'bob' },
      ],
      error: null,
    };

    const result = await callLoader();

    expect(Array.isArray(result?.participants)).toBe(true);
    expect(result?.participants).toEqual([
      { github_login: 'alice', status: 'submitted' },
      { github_login: 'bob', status: 'pending' },
    ]);
  });
});

describe('Given an FCS assessment viewed by a participant', () => {
  it('When loadAssessmentDetail is called, Then participants is a { total, completed } summary', async () => {
    setupValidAssessment({ type: 'fcs' });
    setupParticipantRole();
    myParticipationResult = { data: makeMyParticipantRow(), error: null };
    allParticipantsResult = {
      data: [
        { id: 'p-001', status: 'submitted', github_username: 'alice' },
        { id: 'p-002', status: 'pending', github_username: 'bob' },
      ],
      error: null,
    };

    const result = await callLoader();

    expect(Array.isArray(result?.participants)).toBe(false);
    expect(result?.participants).toEqual({ total: 2, completed: 1 });
  });
});

// ---------------------------------------------------------------------------
// Adversarial — parallel query DB error propagates as thrown Error
// [evaluator gap: no test documented the throw contract for parallel failures]
//
// When a parallel DB query fails, fetchParallelData throws. loadAssessmentDetail
// does not catch this — the error propagates to the page. This test documents
// the current contract so regressions are caught if the error handling is changed.
// Issue #376 AC: "renders without a 500 error" — the page currently 500s on
// parallel query failures, which is a known boundary of the current fix.
// ---------------------------------------------------------------------------

describe('Given the assessment row exists but a parallel DB query fails', () => {
  it('When loadAssessmentDetail is called, Then it throws (does not silently return null)', async () => {
    setupValidAssessment({ type: 'fcs' });
    setupAdminRole();
    // Simulate a questions query DB error (not not-found, but a real DB failure)
    questionsResult = { data: null, error: { code: '08006', message: 'connection closed unexpectedly' } };

    await expect(callLoader()).rejects.toThrow('Internal server error');
  });
});
