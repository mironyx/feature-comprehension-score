// Tests for /assessments/[id] — assessment answering page.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.5
// Issue: #61

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ---------------------------------------------------------------------------
// Module mocks
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
import { redirect, notFound } from 'next/navigation';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockCreateSecret = vi.mocked(createSecretSupabaseClient);
const mockRedirect = vi.mocked(redirect);
const mockNotFound = vi.mocked(notFound);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const USER_ID = 'user-001';
const ASSESSMENT_ID = 'assessment-001';
const GITHUB_PROVIDER_ID = '12345';

function makeAssessment(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSESSMENT_ID,
    org_id: 'org-001',
    type: 'fcs',
    status: 'active',
    feature_name: 'Scoring Engine',
    feature_description: null,
    pr_number: null,
    repositories: { github_repo_name: 'feature-comprehension-score' },
    organisations: { github_org_name: 'acme' },
    config_enforcement_mode: 'advisory',
    config_score_threshold: 70,
    config_question_count: 3,
    ...overrides,
  };
}

function makeParticipant(status: 'pending' | 'submitted' = 'pending') {
  return { id: `participant-001`, status, submitted_at: status === 'submitted' ? '2026-03-20T10:00:00Z' : null };
}

function makeQuestion(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `question-00${n}`,
    question_number: n,
    naur_layer: 'world_to_program',
    question_text: `Question ${n}?`,
    weight: 1,
    hint: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

interface SecretClientOptions {
  assessment: object | null;
  participant: object | null;
  questions: object[];
}

function makeSecretClient(opts: SecretClientOptions) {
  const { assessment, participant, questions } = opts;
  const rpcSpy = vi.fn().mockResolvedValue({ data: null, error: null });
  const client = {
    rpc: rpcSpy,
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
  return { client, rpcSpy };
}

function makeServerClient(user: { id: string; user_metadata?: Record<string, unknown> } | null) {
  const rpcSpy = vi.fn().mockResolvedValue({ data: null, error: null });
  return {
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user },
          error: user ? null : new Error('no session'),
        }),
      },
      rpc: rpcSpy,
    },
    rpcSpy,
  };
}

function makeParams(id = ASSESSMENT_ID) {
  return Promise.resolve({ id });
}

const AUTHED_USER = { id: USER_ID, user_metadata: { provider_id: GITHUB_PROVIDER_ID } };

async function arrange(opts: SecretClientOptions, user: { id: string; user_metadata?: Record<string, unknown> } | null = AUTHED_USER) {
  const { client: serverClient, rpcSpy: serverRpcSpy } = makeServerClient(user);
  mockCreateServer.mockResolvedValue(serverClient as never);
  const { client: secretClient, rpcSpy: secretRpcSpy } = makeSecretClient(opts);
  mockCreateSecret.mockReturnValue(secretClient as never);
  const { default: AssessmentPage } = await import('@/app/(authenticated)/assessments/[id]/page');
  return { AssessmentPage, serverRpcSpy, secretRpcSpy };
}

const defaultOpts: SecretClientOptions = {
  assessment: null,
  participant: null,
  questions: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Assessment answering page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Given an unauthenticated user', () => {
    it('then it redirects to /auth/sign-in', async () => {
      const { AssessmentPage } = await arrange(defaultOpts, null);
      await expect(AssessmentPage({ params: makeParams() })).rejects.toThrow(
        'NEXT_REDIRECT:/auth/sign-in',
      );
      expect(mockRedirect).toHaveBeenCalledWith('/auth/sign-in');
    });
  });

  describe('Given the assessment does not exist', () => {
    it('then it calls notFound', async () => {
      const { AssessmentPage } = await arrange(defaultOpts);
      await expect(AssessmentPage({ params: makeParams() })).rejects.toThrow('NEXT_NOT_FOUND');
      expect(mockNotFound).toHaveBeenCalled();
    });
  });

  describe('Given a valid assessment with an authenticated user', () => {
    it.each([
      [
        'a non-participant renders the access denied page',
        { assessment: makeAssessment(), participant: null, questions: [] },
      ],
      [
        'an already-submitted participant renders the completion page',
        { assessment: makeAssessment(), participant: makeParticipant('submitted'), questions: [] },
      ],
      [
        'a pending FCS participant renders the answering form',
        { assessment: makeAssessment(), participant: makeParticipant('pending'), questions: [makeQuestion(1), makeQuestion(2), makeQuestion(3)] },
      ],
      [
        'a pending participant on a PRCC assessment renders the answering form',
        { assessment: makeAssessment({ type: 'prcc', pr_number: 42 }), participant: makeParticipant('pending'), questions: [makeQuestion(1)] },
      ],
    ])('When %s', async (_label, opts) => {
      const { AssessmentPage } = await arrange(opts);
      const result = await AssessmentPage({ params: makeParams() });
      expect(result).toBeTruthy();
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockNotFound).not.toHaveBeenCalled();
    });
  });

  describe('Given an authenticated participant visiting their assessment', () => {
    it('then link_participant RPC is called on the user client (not admin) so auth.uid() resolves', async () => {
      const opts = {
        assessment: makeAssessment(),
        participant: makeParticipant('pending'),
        questions: [makeQuestion(1)],
      };
      const { AssessmentPage, serverRpcSpy, secretRpcSpy } = await arrange(opts);
      await AssessmentPage({ params: makeParams() });
      expect(serverRpcSpy).toHaveBeenCalledWith('link_participant', {
        p_assessment_id: ASSESSMENT_ID,
        p_github_user_id: parseInt(GITHUB_PROVIDER_ID, 10),
      });
      expect(secretRpcSpy).not.toHaveBeenCalled();
    });
  });

  // Issue #221, AC-3: hint flows page → AnsweringForm → QuestionCard → rendered HTML.
  describe('Hint passthrough', () => {
    async function renderPage(hint: string | null): Promise<string> {
      const { AssessmentPage } = await arrange({
        assessment: makeAssessment(),
        participant: makeParticipant('pending'),
        questions: [makeQuestion(1, { hint })],
      });
      const element = await AssessmentPage({ params: makeParams() });
      return renderToStaticMarkup(element as React.ReactElement);
    }

    it('Given a non-null hint, then the hint text renders in the answering form', async () => {
      const HINT_TEXT = 'Describe the key design trade-offs in 2–3 sentences.';
      const html = await renderPage(HINT_TEXT);
      expect(html).toContain(HINT_TEXT);
    });

    it('Given a null hint, then the form renders without a hint element', async () => {
      const html = await renderPage(null);
      expect(html).toContain('Question 1?');
      expect(html).not.toContain('italic');
    });
  });
});
