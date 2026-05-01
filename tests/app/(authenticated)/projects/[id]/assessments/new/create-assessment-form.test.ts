// Tests for CreateAssessmentForm — client component that submits a new FCS assessment.
// Design reference: docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.4
// Requirements: docs/requirements/v1-requirements.md
// Issue: #413
//
// Contract under test:
//   - POST URL is /api/projects/${projectId}/assessments  (not /api/fcs)
//   - Request body does NOT include org_id
//   - On 201 success with assessment_id, router.push navigates to
//     /projects/${projectId}/assessments/${assessment_id}  (not /assessments/${aid})
//   - repositories prop renders all provided repos in the selector
//   - orgId is NOT a prop of the component
//
// Strategy: MSW intercepts fetch() calls from the form's submit handler.
// React hooks are stubbed so the component body runs in the Node test environment.
// Node's native fetch rejects relative URLs; a thin wrapper in beforeAll resolves
// them to http://localhost before MSW intercepts, matching absolute-URL handlers.

import { afterAll, afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { SyntheticEvent } from 'react';

// ---------------------------------------------------------------------------
// Module mocks — must precede component imports (vitest hoisting rules)
// ---------------------------------------------------------------------------

// Stub useRouter — required by CreateAssessmentForm
const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockRouterPush })),
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));

// Stub React hooks so the component can execute without a real React root.
// useState returns [initial, noop] so branch logic flows along the initial path.
// useCallback is a pass-through so handleSubmit is the actual function.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn((initial: unknown) => [initial, vi.fn()]),
    useCallback: vi.fn((fn: unknown) => fn),
  };
});

// Stub UI primitives — return plain objects (serialisable via JSON.stringify)
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, type, disabled }: { children?: unknown; type?: string; disabled?: boolean }) =>
    ({ type: 'button', props: { 'button-type': type, disabled, children } }),
}));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children?: unknown }) =>
    ({ type: 'div', props: { children } }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: unknown }) =>
    ({ type: 'a', props: { href, children } }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import CreateAssessmentForm from '@/app/(authenticated)/projects/[id]/assessments/new/create-assessment-form';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const server = setupServer();

const BASE = 'http://localhost';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  // Node's fetch rejects relative URLs before MSW can intercept them.
  // Wrap global.fetch to prepend http://localhost to relative paths so
  // MSW's absolute-URL handlers can match them.
  const mswFetch = global.fetch;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const resolved =
      typeof input === 'string' && input.startsWith('/')
        ? `${BASE}${input}`
        : input;
    return mswFetch(resolved as string, init);
  });
});
afterEach(() => { server.resetHandlers(); vi.clearAllMocks(); });
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'project-xyz';
const ASSESSMENT_ID = 'assessment-new-001';

const REPOSITORIES = [
  { id: 'repo-001', github_repo_name: 'acme/backend' },
  { id: 'repo-002', github_repo_name: 'acme/frontend' },
];

const VALID_FORM_STATE = {
  featureName: 'My Feature',
  featureDescription: '',
  repositoryId: 'repo-001',
  prNumbers: '42',
  issueNumbers: '',
  participants: 'alice',
  comprehensionDepth: 'conceptual' as const,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render the form to a plain object tree via JSON.stringify (no React root). */
function renderForm(projectId = PROJECT_ID, repos = REPOSITORIES): string {
  return JSON.stringify(CreateAssessmentForm({ projectId, repositories: repos }));
}

/** Walks the JSX element tree to find a form element's onSubmit handler. */
function findOnSubmit(
  node: unknown,
): ((e: SyntheticEvent<HTMLFormElement>) => Promise<void>) | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (typeof el.props?.onSubmit === 'function') {
    return el.props.onSubmit as (e: SyntheticEvent<HTMLFormElement>) => Promise<void>;
  }
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children as unknown[]) {
      const found = findOnSubmit(child);
      if (found) return found;
    }
  } else if (children) {
    return findOnSubmit(children);
  }
  return undefined;
}

function extractOnSubmit(projectId = PROJECT_ID, repos = REPOSITORIES) {
  const element = CreateAssessmentForm({ projectId, repositories: repos });
  return findOnSubmit(element);
}

function makeSubmitEvent(): SyntheticEvent<HTMLFormElement> {
  return { preventDefault: vi.fn() } as unknown as SyntheticEvent<HTMLFormElement>;
}

/** Override useState to return VALID_FORM_STATE so form validation passes. */
async function withValidFormState() {
  const { useState } = await import('react');
  vi.mocked(useState).mockImplementation((initial: unknown) => {
    if (initial !== null && typeof initial === 'object' && 'featureName' in (initial as object)) {
      return [VALID_FORM_STATE, vi.fn()] as [unknown, unknown] as ReturnType<typeof useState>;
    }
    return [initial, vi.fn()] as [unknown, unknown] as ReturnType<typeof useState>;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateAssessmentForm (§B.4)', () => {

  // -------------------------------------------------------------------------
  // Property 7: POST URL is /api/projects/${projectId}/assessments
  // [lld §B.4] [issue #413]
  // -------------------------------------------------------------------------

  describe('Given a valid form submission with VALID_FORM_STATE', () => {
    it('When handleSubmit is called, Then the fetch POST URL contains /api/projects/${projectId}/assessments', async () => {
      let capturedUrl: string | undefined;

      server.use(
        http.post(`${BASE}/api/projects/${PROJECT_ID}/assessments`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ assessment_id: ASSESSMENT_ID }, { status: 201 });
        }),
      );

      await withValidFormState();
      const onSubmit = extractOnSubmit();
      if (!onSubmit) { expect.fail('onSubmit handler not found in form JSX tree'); return; }

      await onSubmit(makeSubmitEvent());

      expect(capturedUrl).toBeDefined();
      expect(capturedUrl).toContain(`/api/projects/${PROJECT_ID}/assessments`);
    });
  });

  // -------------------------------------------------------------------------
  // Property 8: Request body does NOT include org_id
  // [lld §B.4] [issue #413]
  // -------------------------------------------------------------------------

  describe('Given a valid form submission', () => {
    it('When handleSubmit is called, Then the request body does not contain org_id', async () => {
      let capturedBody: Record<string, unknown> | undefined;

      server.use(
        http.post(`${BASE}/api/projects/${PROJECT_ID}/assessments`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ assessment_id: ASSESSMENT_ID }, { status: 201 });
        }),
      );

      await withValidFormState();
      const onSubmit = extractOnSubmit();
      if (!onSubmit) { expect.fail('onSubmit handler not found in form JSX tree'); return; }

      await onSubmit(makeSubmitEvent());

      expect(capturedBody).toBeDefined();
      expect(capturedBody).not.toHaveProperty('org_id');
    });
  });

  // -------------------------------------------------------------------------
  // Property 9: On 201 + assessment_id, router.push navigates to
  //             /projects/${projectId}/assessments/${assessment_id}
  // [lld §B.4] [issue #413]
  // -------------------------------------------------------------------------

  describe('Given the API returns 201 with an assessment_id', () => {
    it('When handleSubmit receives the response, Then router.push is called with /projects/…/assessments/…', async () => {
      server.use(
        http.post(`${BASE}/api/projects/${PROJECT_ID}/assessments`, () =>
          HttpResponse.json({ assessment_id: ASSESSMENT_ID }, { status: 201 }),
        ),
      );

      await withValidFormState();
      const onSubmit = extractOnSubmit();
      if (!onSubmit) { expect.fail('onSubmit handler not found in form JSX tree'); return; }

      await onSubmit(makeSubmitEvent());

      expect(mockRouterPush).toHaveBeenCalledWith(
        `/projects/${PROJECT_ID}/assessments/${ASSESSMENT_ID}`,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 9b: Navigation path starts with /projects/ not /assessments/
  // [lld §B.4] [issue #413]
  // -------------------------------------------------------------------------

  describe('Given the API returns 201 with an assessment_id', () => {
    it('When navigating on success, Then the router.push URL starts with /projects/ not /assessments/', async () => {
      server.use(
        http.post(`${BASE}/api/projects/${PROJECT_ID}/assessments`, () =>
          HttpResponse.json({ assessment_id: ASSESSMENT_ID }, { status: 201 }),
        ),
      );

      await withValidFormState();
      const onSubmit = extractOnSubmit();
      if (!onSubmit) { expect.fail('onSubmit handler not found in form JSX tree'); return; }

      await onSubmit(makeSubmitEvent());

      const pushedUrl = mockRouterPush.mock.calls[0]?.[0] as string | undefined;
      expect(pushedUrl).toBeDefined();
      expect(pushedUrl).toMatch(/^\/projects\//);
      expect(pushedUrl).not.toMatch(/^\/assessments\//);
    });
  });

  // -------------------------------------------------------------------------
  // Property: repositories prop populates the selector
  // [lld §B.4] [issue #413]
  // -------------------------------------------------------------------------

  describe('Given repositories prop contains two entries', () => {
    it('When the form is rendered, Then each repository name appears in the output', () => {
      const tree = renderForm();

      expect(tree).toContain('acme/backend');
      expect(tree).toContain('acme/frontend');
    });
  });

  // -------------------------------------------------------------------------
  // Property: orgId is NOT a prop of the component
  // [lld §B.4] [issue #413]
  // -------------------------------------------------------------------------

  describe('Given the form is rendered with only projectId and repositories', () => {
    it('When rendered, Then the HTML output does not contain org_id or orgId', () => {
      const tree = renderForm();

      expect(tree).not.toContain('org_id');
      expect(tree).not.toContain('orgId');
    });
  });

  // -------------------------------------------------------------------------
  // Regression: form must NOT post to /api/fcs
  // MSW onUnhandledRequest:'error' causes the test to fail if /api/fcs is called.
  // [lld §B.4] [issue #413]
  // -------------------------------------------------------------------------

  describe('Regression #413 — old form used /api/fcs endpoint', () => {
    it('When handleSubmit is called, Then fetch is NOT called with a URL containing /api/fcs', async () => {
      server.use(
        http.post(`${BASE}/api/projects/${PROJECT_ID}/assessments`, () =>
          HttpResponse.json({ assessment_id: ASSESSMENT_ID }, { status: 201 }),
        ),
      );

      await withValidFormState();
      const onSubmit = extractOnSubmit();
      if (!onSubmit) { expect.fail('onSubmit handler not found in form JSX tree'); return; }

      await expect(onSubmit(makeSubmitEvent())).resolves.not.toThrow();
    });
  });
});
