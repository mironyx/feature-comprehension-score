// Tests for role-based rendering on /assessments/[id] — T2 of V8 Assessment Detail View.
// Design reference: docs/design/lld-v8-assessment-detail.md §T2
// Issue: #364

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/secret', () => ({
  createSecretSupabaseClient: vi.fn(() => ({})),
}));

vi.mock('@/app/(authenticated)/projects/[id]/assessments/[aid]/load-assessment-detail', () => ({
  loadAssessmentDetail: vi.fn(),
}));

vi.mock('@/app/(authenticated)/assessments/polling-status-badge', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- vi.mock factories run before ESM imports; require() is the only option here
  const React = require('react') as typeof import('react');
  return {
    PollingStatusBadge: ({ assessmentId }: { assessmentId: string; initialStatus: string }) =>
      React.createElement('span', { className: 'polling-status-badge-mock', 'data-id': assessmentId }),
  };
});

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
import { redirect, notFound } from 'next/navigation';
import { loadAssessmentDetail } from '@/app/(authenticated)/projects/[id]/assessments/[aid]/load-assessment-detail';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockRedirect = vi.mocked(redirect);
const mockNotFound = vi.mocked(notFound);
const mockLoadDetail = vi.mocked(loadAssessmentDetail);

// ---------------------------------------------------------------------------
// Type imports (interface only — not implementation bodies)
// ---------------------------------------------------------------------------

// These types are declared in the API route — we import them for factory typing.
// We do not import or inspect implementation bodies.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'user-001';
const ASSESSMENT_ID = 'assessment-abc';
const PROJECT_ID = 'project-test-id';
const GITHUB_PROVIDER_ID = '99999';

// ---------------------------------------------------------------------------
// Factories — AssessmentDetailResponse shape (mirrors the route.ts contract)
// ---------------------------------------------------------------------------

function makeAdminDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSESSMENT_ID,
    type: 'fcs' as const,
    status: 'active',
    repository_name: 'feature-comprehension-score',
    repository_full_name: 'acme/feature-comprehension-score',
    pr_number: null,
    pr_head_sha: null,
    feature_name: 'Scoring Engine',
    feature_description: 'Measures engineering comprehension',
    aggregate_score: null,
    scoring_incomplete: false,
    artefact_quality: null,
    conclusion: null,
    config: { enforcement_mode: 'advisory', score_threshold: 70, question_count: 3 },
    questions: [],
    participants: [
      { github_login: 'alice', status: 'pending' as const },
      { github_login: 'bob', status: 'submitted' as const },
    ],
    my_participation: null,
    fcs_prs: [{ pr_number: 42, pr_title: 'Add scoring engine' }],
    fcs_issues: [{ issue_number: 7, issue_title: 'Fix calculation bug' }],
    caller_role: 'admin' as const,
    skip_info: null,
    rubric_progress: null,
    rubric_progress_updated_at: null,
    rubric_error_code: null,
    rubric_retry_count: 0,
    rubric_error_retryable: null,
    created_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function makeParticipantDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...makeAdminDetail(),
    caller_role: 'participant' as const,
    my_participation: {
      participant_id: 'p-001',
      status: 'pending' as const,
      submitted_at: null,
    },
    participants: { total: 2, completed: 1 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock client builders
// ---------------------------------------------------------------------------

/**
 * Builds a minimal server-side Supabase client (user-scoped).
 * Controls `auth.getUser` and the `rpc` call for `link_participant`.
 */
function makeServerClient(
  user: { id: string; user_metadata?: Record<string, unknown> } | null,
  rpcResult: { data: unknown; error: unknown } = { data: null, error: null },
) {
  const rpcSpy = vi.fn().mockResolvedValue(rpcResult);
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error('no session'),
      }),
    },
    rpc: rpcSpy,
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: ASSESSMENT_ID, project_id: PROJECT_ID },
            error: null,
          }),
        }),
      }),
    }),
  };
  return { client, rpcSpy };
}

function makeParams(projectId = PROJECT_ID, aid = ASSESSMENT_ID) {
  return Promise.resolve({ id: projectId, aid });
}

const AUTHED_USER = { id: USER_ID, user_metadata: { provider_id: GITHUB_PROVIDER_ID } };

/**
 * Sets up the mock environment and dynamically re-imports AssessmentPage.
 *
 * `detail` — what the API fetch returns (null = 404).
 * `refreshedDetail` — what the second fetch returns after link_participant (defaults to same as detail).
 */
async function arrangePage(opts: {
  detail: ReturnType<typeof makeAdminDetail> | null;
  refreshedDetail?: ReturnType<typeof makeAdminDetail> | null;
  user?: { id: string; user_metadata?: Record<string, unknown> } | null;
  linkRpcResult?: { data: unknown; error: unknown };
}) {
  const {
    detail,
    refreshedDetail = detail,
    user = AUTHED_USER,
    linkRpcResult = { data: null, error: null },
  } = opts;

  const { client: serverClient, rpcSpy: serverRpcSpy } = makeServerClient(user, linkRpcResult);
  mockCreateServer.mockResolvedValue(serverClient as never);

  // Mock the direct Supabase loader (replaces the old global.fetch stub — #376)
  let loadCallCount = 0;
  mockLoadDetail.mockImplementation(() => {
    loadCallCount += 1;
    return Promise.resolve(loadCallCount === 1 ? detail : refreshedDetail);
  });

  const { default: AssessmentPage } = await import(
    '@/app/(authenticated)/projects/[id]/assessments/[aid]/page'
  );
  return { AssessmentPage, serverRpcSpy };
}

// ---------------------------------------------------------------------------
// Tests — AssessmentPage role-based rendering (T2)
// ---------------------------------------------------------------------------

describe('AssessmentPage — role-based rendering (T2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // P1 — unauthenticated user redirects [lld §T2]
  describe('Given an unauthenticated user', () => {
    it('then it redirects to /auth/sign-in', async () => {
      const { AssessmentPage } = await arrangePage({ detail: makeAdminDetail(), user: null });
      await expect(AssessmentPage({ params: makeParams() })).rejects.toThrow(
        'NEXT_REDIRECT:/auth/sign-in',
      );
      expect(mockRedirect).toHaveBeenCalledWith('/auth/sign-in');
    });
  });

  // P2 — API returns non-200 → notFound() [lld §T2]
  describe('Given the API returns 404', () => {
    it('then it calls notFound()', async () => {
      const { AssessmentPage } = await arrangePage({ detail: null });
      await expect(AssessmentPage({ params: makeParams() })).rejects.toThrow('NEXT_NOT_FOUND');
      expect(mockNotFound).toHaveBeenCalled();
    });
  });

  // P3 — caller_role === 'admin' → AssessmentAdminView rendered, not AccessDeniedPage [lld §T2, issue AC]
  describe('Given caller_role is admin', () => {
    it('then renders AssessmentAdminView (not AccessDeniedPage)', async () => {
      const { AssessmentPage } = await arrangePage({ detail: makeAdminDetail() });
      const result = await AssessmentPage({ params: makeParams() });
      const html = renderToStaticMarkup(result as React.ReactElement);
      // Admin view must be rendered — no "Access Denied" text
      expect(html).not.toContain('Access Denied');
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockNotFound).not.toHaveBeenCalled();
    });

    it('then renders the feature name in the admin view', async () => {
      const detail = makeAdminDetail({ feature_name: 'My Admin Feature' });
      const { AssessmentPage } = await arrangePage({ detail });
      const result = await AssessmentPage({ params: makeParams() });
      const html = renderToStaticMarkup(result as React.ReactElement);
      expect(html).toContain('My Admin Feature');
    });
  });

  // P4 — caller_role === 'participant', status === 'pending' → AnsweringForm [lld §T2]
  describe('Given caller_role is participant and status is pending', () => {
    it('then renders the answering form', async () => {
      const detail = makeParticipantDetail({
        my_participation: { participant_id: 'p-001', status: 'pending', submitted_at: null },
      });
      const { AssessmentPage } = await arrangePage({ detail });
      const result = await AssessmentPage({ params: makeParams() });
      const html = renderToStaticMarkup(result as React.ReactElement);
      // The answering form should render — not an error page
      expect(html).not.toContain('Access Denied');
      expect(html).not.toContain('Already Submitted');
    });
  });

  // P5 — caller_role === 'participant', status === 'submitted' → AlreadySubmittedPage [lld §T2, issue AC]
  describe('Given caller_role is participant and status is submitted', () => {
    it('then renders AlreadySubmittedPage', async () => {
      const detail = makeParticipantDetail({
        my_participation: {
          participant_id: 'p-001',
          status: 'submitted',
          submitted_at: '2026-04-10T10:00:00Z',
        },
      });
      const { AssessmentPage } = await arrangePage({ detail });
      const result = await AssessmentPage({ params: makeParams() });
      const html = renderToStaticMarkup(result as React.ReactElement);
      expect(html).toContain('Already Submitted');
    });
  });

  // P6 — participant, my_participation === null, link succeeds → AnsweringForm [lld §T2]
  describe('Given caller_role is participant and my_participation is null, and link_participant succeeds', () => {
    it('then renders the answering form after linking', async () => {
      const initial = makeParticipantDetail({ my_participation: null });
      const refreshed = makeParticipantDetail({
        my_participation: { participant_id: 'p-new', status: 'pending', submitted_at: null },
      });
      const { AssessmentPage } = await arrangePage({ detail: initial, refreshedDetail: refreshed });
      const result = await AssessmentPage({ params: makeParams() });
      const html = renderToStaticMarkup(result as React.ReactElement);
      expect(html).not.toContain('Access Denied');
      expect(html).not.toContain('Already Submitted');
    });
  });

  // P7 — participant, my_participation === null, no GitHub user id → AccessDeniedPage [lld §T2]
  describe('Given caller_role is participant and user has no github provider_id', () => {
    it('then renders AccessDeniedPage', async () => {
      const detail = makeParticipantDetail({ my_participation: null });
      const userWithoutGithubId = { id: USER_ID, user_metadata: {} };
      const { AssessmentPage } = await arrangePage({
        detail,
        user: userWithoutGithubId,
      });
      const result = await AssessmentPage({ params: makeParams() });
      const html = renderToStaticMarkup(result as React.ReactElement);
      expect(html).toContain('Access Denied');
    });
  });

  // P8 — participant, link succeeds but still null after refresh → AccessDeniedPage [lld §T2]
  describe('Given caller_role is participant, link_participant runs, but my_participation is still null after refresh', () => {
    it('then renders AccessDeniedPage', async () => {
      const initial = makeParticipantDetail({ my_participation: null });
      const refreshed = makeParticipantDetail({ my_participation: null });
      const { AssessmentPage } = await arrangePage({
        detail: initial,
        refreshedDetail: refreshed,
      });
      const result = await AssessmentPage({ params: makeParams() });
      const html = renderToStaticMarkup(result as React.ReactElement);
      expect(html).toContain('Access Denied');
    });
  });

  // P9 — link_participant RPC is called on the user client, not the secret client [lld §T2, issue]
  describe('Given caller_role is participant with my_participation null', () => {
    it('then link_participant RPC is called on the user supabase client (not admin)', async () => {
      const initial = makeParticipantDetail({ my_participation: null });
      const refreshed = makeParticipantDetail({
        my_participation: { participant_id: 'p-new', status: 'pending', submitted_at: null },
      });
      const { AssessmentPage, serverRpcSpy } = await arrangePage({ detail: initial, refreshedDetail: refreshed });
      await AssessmentPage({ params: makeParams() });
      expect(serverRpcSpy).toHaveBeenCalledWith('link_participant', {
        p_assessment_id: ASSESSMENT_ID,
        p_github_user_id: parseInt(GITHUB_PROVIDER_ID, 10),
      });
    });
  });

  // P10 — Regression #376: page must NOT use global.fetch (relative-URL self-fetch)
  describe('Given the page renders for an admin', () => {
    it('then it does not make an HTTP fetch to /api/assessments/[id] (regression #376)', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');
      const { AssessmentPage } = await arrangePage({ detail: makeAdminDetail() });
      await AssessmentPage({ params: makeParams() });
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — AssessmentAdminView component
// ---------------------------------------------------------------------------

describe('AssessmentAdminView', () => {
  // We call the component directly with props and inspect the JSX tree / rendered HTML.
  // These tests do not depend on the page fetch — they test the pure render component.

  async function importAdminView() {
    const mod = await import(
      '@/app/(authenticated)/projects/[id]/assessments/[aid]/assessment-admin-view'
    );
    return mod.AssessmentAdminView;
  }

  // A1 — shows feature_name as page heading [lld §T2, issue AC]
  describe('Given an assessment with feature_name', () => {
    it('then shows feature_name as the page heading', async () => {
      const AssessmentAdminView = await importAdminView();
      const detail = makeAdminDetail({ feature_name: 'Scoring Engine v2' });
      const html = renderToStaticMarkup(
        AssessmentAdminView({ assessment: detail }) as React.ReactElement,
      );
      expect(html).toContain('Scoring Engine v2');
    });
  });

  // A2 — shows feature_description as subtitle when non-null [lld §T2]
  describe('Given feature_description is non-null', () => {
    it('then shows feature_description as subtitle text', async () => {
      const AssessmentAdminView = await importAdminView();
      const detail = makeAdminDetail({ feature_description: 'A detailed description' });
      const html = renderToStaticMarkup(
        AssessmentAdminView({ assessment: detail }) as React.ReactElement,
      );
      expect(html).toContain('A detailed description');
    });
  });

  // A3 — Back to Organisation link points to /organisation [lld §T2, issue AC]
  describe('Given the admin view header', () => {
    it('then shows a Back to Organisation link pointing to /organisation', async () => {
      const AssessmentAdminView = await importAdminView();
      const detail = makeAdminDetail();
      const html = renderToStaticMarkup(
        AssessmentAdminView({ assessment: detail }) as React.ReactElement,
      );
      expect(html).toContain('/organisation');
    });
  });

  // A4 — shows repository_full_name [lld §T2, issue AC]
  describe('Given an assessment with a repository', () => {
    it('then shows repository_full_name', async () => {
      const AssessmentAdminView = await importAdminView();
      const detail = makeAdminDetail({ repository_full_name: 'myorg/my-repo' });
      const html = renderToStaticMarkup(
        AssessmentAdminView({ assessment: detail }) as React.ReactElement,
      );
      expect(html).toContain('myorg/my-repo');
    });
  });

  // A5 — renders AssessmentSourceList when type is fcs [lld §T2]
  describe('Given type is fcs', () => {
    it('then AssessmentSourceList is present in the rendered output', async () => {
      const AssessmentAdminView = await importAdminView();
      const detail = makeAdminDetail({
        type: 'fcs',
        fcs_prs: [{ pr_number: 1, pr_title: 'Initial commit' }],
        fcs_issues: [],
      });
      const html = renderToStaticMarkup(
        AssessmentAdminView({ assessment: detail }) as React.ReactElement,
      );
      // Source list section must appear (contains PR content)
      expect(html).toContain('Initial commit');
    });
  });

  // A6 — does NOT render AssessmentSourceList when type is prcc [lld §T2]
  describe('Given type is prcc', () => {
    it('then AssessmentSourceList is not rendered', async () => {
      const AssessmentAdminView = await importAdminView();
      const detail = makeAdminDetail({
        type: 'prcc',
        fcs_prs: [],
        fcs_issues: [],
      });
      const html = renderToStaticMarkup(
        AssessmentAdminView({ assessment: detail }) as React.ReactElement,
      );
      // No PR/issue section content for prcc type
      expect(html).not.toContain('Pull Requests');
    });
  });

  // A7 — shows participant list with one row per participant [lld §T2, issue AC]
  describe('Given participants array', () => {
    it('then each participant github_login appears in the rendered output', async () => {
      const AssessmentAdminView = await importAdminView();
      const detail = makeAdminDetail({
        participants: [
          { github_login: 'alice', status: 'pending' },
          { github_login: 'charlie', status: 'submitted' },
        ],
      });
      const html = renderToStaticMarkup(
        AssessmentAdminView({ assessment: detail }) as React.ReactElement,
      );
      expect(html).toContain('alice');
      expect(html).toContain('charlie');
    });
  });

  // A8 — shows StatusBadge per participant row [lld §T2, issue AC]
  describe('Given participants with statuses', () => {
    it('then participant status text appears for each row', async () => {
      const AssessmentAdminView = await importAdminView();
      const detail = makeAdminDetail({
        participants: [
          { github_login: 'dave', status: 'pending' },
          { github_login: 'eve', status: 'submitted' },
        ],
      });
      const html = renderToStaticMarkup(
        AssessmentAdminView({ assessment: detail }) as React.ReactElement,
      );
      // Both status values must appear somewhere in the rendered output
      expect(html.toLowerCase()).toContain('pending');
      expect(html.toLowerCase()).toContain('submitted');
    });
  });

  // A9 — renders PollingStatusBadge for rubric_generation status (#444)
  describe('Given assessment.status === rubric_generation', () => {
    it('renders PollingStatusBadge when assessment.status === rubric_generation', async () => {
      const AssessmentAdminView = await importAdminView();
      const detail = makeAdminDetail({ status: 'rubric_generation' });
      const html = renderToStaticMarkup(
        AssessmentAdminView({ assessment: detail }) as React.ReactElement,
      );
      expect(html).toContain('polling-status-badge-mock');
    });
  });

  // A10 — renders static StatusBadge for terminal statuses (#444)
  describe('Given assessment.status is a terminal status', () => {
    it('renders static StatusBadge for terminal statuses', async () => {
      const AssessmentAdminView = await importAdminView();
      const detail = makeAdminDetail({ status: 'awaiting_responses' });
      const html = renderToStaticMarkup(
        AssessmentAdminView({ assessment: detail }) as React.ReactElement,
      );
      expect(html).not.toContain('polling-status-badge-mock');
    });

    it('renders static StatusBadge when status is rubric_failed', async () => {
      const AssessmentAdminView = await importAdminView();
      const detail = makeAdminDetail({ status: 'rubric_failed' });
      const html = renderToStaticMarkup(
        AssessmentAdminView({ assessment: detail }) as React.ReactElement,
      );
      expect(html).not.toContain('polling-status-badge-mock');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — AssessmentSourceList component
// ---------------------------------------------------------------------------

describe('AssessmentSourceList', () => {
  async function importSourceList() {
    const mod = await import(
      '@/app/(authenticated)/projects/[id]/assessments/[aid]/assessment-source-list'
    );
    return mod.AssessmentSourceList;
  }

  // S1 — renders PR list with #pr_number and pr_title [lld §T2, issue]
  describe('Given a non-empty prs array', () => {
    it('then renders each PR with its number and title', async () => {
      const AssessmentSourceList = await importSourceList();
      const result = AssessmentSourceList({
        prs: [
          { pr_number: 42, pr_title: 'Add scoring engine' },
          { pr_number: 99, pr_title: 'Fix edge case' },
        ],
        issues: [],
      });
      const html = renderToStaticMarkup(result as React.ReactElement);
      expect(html).toContain('42');
      expect(html).toContain('Add scoring engine');
      expect(html).toContain('99');
      expect(html).toContain('Fix edge case');
    });
  });

  // S2 — renders issues list with #issue_number and issue_title [lld §T2, issue]
  describe('Given a non-empty issues array', () => {
    it('then renders each issue with its number and title', async () => {
      const AssessmentSourceList = await importSourceList();
      const result = AssessmentSourceList({
        prs: [],
        issues: [
          { issue_number: 7, issue_title: 'Fix calculation bug' },
          { issue_number: 11, issue_title: 'Add test coverage' },
        ],
      });
      const html = renderToStaticMarkup(result as React.ReactElement);
      expect(html).toContain('7');
      expect(html).toContain('Fix calculation bug');
      expect(html).toContain('11');
      expect(html).toContain('Add test coverage');
    });
  });

  // S3 — returns null when both arrays are empty [lld §T2, issue BDD]
  describe('Given both prs and issues arrays are empty', () => {
    it('then returns null (renders nothing)', async () => {
      const AssessmentSourceList = await importSourceList();
      const result = AssessmentSourceList({ prs: [], issues: [] });
      expect(result).toBeNull();
    });
  });

  // S4 — shows only PR section when issues array is empty [lld §T2]
  describe('Given prs is non-empty and issues is empty', () => {
    it('then renders PR content but no issue section', async () => {
      const AssessmentSourceList = await importSourceList();
      const result = AssessmentSourceList({
        prs: [{ pr_number: 5, pr_title: 'New feature' }],
        issues: [],
      });
      const html = renderToStaticMarkup(result as React.ReactElement);
      expect(html).toContain('New feature');
    });
  });

  // S5 — shows only issues section when prs array is empty [lld §T2]
  describe('Given issues is non-empty and prs is empty', () => {
    it('then renders issue content but no PR section', async () => {
      const AssessmentSourceList = await importSourceList();
      const result = AssessmentSourceList({
        prs: [],
        issues: [{ issue_number: 3, issue_title: 'Design question' }],
      });
      const html = renderToStaticMarkup(result as React.ReactElement);
      expect(html).toContain('Design question');
    });
  });
});
