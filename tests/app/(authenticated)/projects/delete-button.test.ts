// Tests for DeleteButton client component.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.6
// Requirements: docs/requirements/v11-requirements.md Story 1.5
// Issue: #399
//
// Note: Kept in a separate file from dashboard-page.test.ts because that file
// mocks the delete-button module (for the server component tests) which would
// prevent testing the real implementation here.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must precede component imports (vitest hoisting rules)
// ---------------------------------------------------------------------------

const { useStateSpy, useCallbackSpy, useEffectSpy } = vi.hoisted(() => ({
  useStateSpy: vi.fn(),
  useCallbackSpy: vi.fn(),
  useEffectSpy: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: useStateSpy,
    useCallback: useCallbackSpy,
    useEffect: useEffectSpy,
  };
});

// Mock next/navigation for useRouter
const mockRouterPushGlobal = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockRouterPushGlobal })),
}));

// Stub Button to be a plain serialisable object so renderTree works
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, 'aria-label': ariaLabel, disabled, variant, size }: {
    children?: unknown;
    onClick?: () => void;
    'aria-label'?: string;
    disabled?: boolean;
    variant?: string;
    size?: string;
  }) => ({
    type: 'button',
    props: { children, onClick, 'aria-label': ariaLabel, disabled, variant, size },
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { DeleteButton } from '@/app/(authenticated)/projects/[id]/delete-button';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'del-project-123';

// ---------------------------------------------------------------------------
// Helpers — recursive tree expander (same pattern as theme-toggle.test.ts)
// ---------------------------------------------------------------------------

type RenderNode = unknown;

function renderTree(node: RenderNode): RenderNode {
  if (!node || typeof node !== 'object') return node;
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (typeof el.type === 'function') {
    const result = (el.type as (p: unknown) => RenderNode)(el.props ?? {});
    return renderTree(result);
  }
  if (!el.props) return node;
  const newProps: Record<string, unknown> = { ...el.props };
  if (newProps.children !== undefined) {
    newProps.children = Array.isArray(newProps.children)
      ? (newProps.children as RenderNode[]).map(renderTree)
      : renderTree(newProps.children as RenderNode);
  }
  return { ...el, props: newProps };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Configure React hook mocks for a single render of DeleteButton.
 * DeleteButton calls useState twice:
 *   1. error  (null)
 *   2. deleting (false)
 * And useCallback once:
 *   1. handleDelete
 */
function configureAndRender({
  error = null as string | null,
  errorSet = vi.fn(),
  deleting = false,
  deletingSet = vi.fn(),
  captureCallback = (fn: unknown) => fn,
}: {
  error?: string | null;
  errorSet?: ReturnType<typeof vi.fn>;
  deleting?: boolean;
  deletingSet?: ReturnType<typeof vi.fn>;
  captureCallback?: (fn: unknown) => unknown;
} = {}): { handleDelete: (() => Promise<void>) | null } {
  useStateSpy
    .mockReturnValueOnce([error, errorSet])
    .mockReturnValueOnce([deleting, deletingSet]);
  useEffectSpy.mockImplementation(() => undefined);

  let capturedHandleDelete: (() => Promise<void>) | null = null;
  useCallbackSpy.mockImplementation((fn: unknown) => {
    capturedHandleDelete = fn as () => Promise<void>;
    return captureCallback(fn);
  });

  DeleteButton({ projectId: PROJECT_ID });
  return { handleDelete: capturedHandleDelete };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeleteButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouterPushGlobal.mockReset();
    useStateSpy.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    useCallbackSpy.mockImplementation((fn: unknown) => fn);
    useEffectSpy.mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Ensure `window` is available in the Node test environment for components
  // that call window.confirm. In vitest node environment `window` is undefined,
  // so we stub it before each test that invokes handleDelete.
  function stubWindow(confirmReturnValue: boolean): ReturnType<typeof vi.fn> {
    const confirmSpy = vi.fn().mockReturnValue(confirmReturnValue);
    vi.stubGlobal('window', { confirm: confirmSpy });
    return confirmSpy;
  }

  // -------------------------------------------------------------------------
  // Property: Renders "Delete project" button text
  // [lld §B.6 BDD "DeleteButton — Renders 'Delete project' button"]
  // -------------------------------------------------------------------------

  describe('Given the DeleteButton is rendered', () => {
    it('renders a "Delete project" button', () => {
      const result = DeleteButton({ projectId: PROJECT_ID });
      const tree = JSON.stringify(renderTree(result as RenderNode));
      expect(tree).toContain('Delete project');
    });
  });

  // -------------------------------------------------------------------------
  // Property: handleDelete calls window.confirm before making fetch
  // [lld §B.6 BDD "Confirms before delete"]
  // -------------------------------------------------------------------------

  describe('Given the delete button is clicked', () => {
    it('calls window.confirm before sending DELETE', async () => {
      const confirmSpy = stubWindow(false);
      vi.stubGlobal('fetch', vi.fn());

      const { handleDelete } = configureAndRender();
      expect(handleDelete).not.toBeNull();
      await handleDelete!();

      expect(confirmSpy).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Property: If window.confirm returns false, no DELETE request is sent
  // [lld §B.6 BDD "if confirm returns false: no DELETE sent"]
  // -------------------------------------------------------------------------

  describe('Given the user cancels the confirm dialog', () => {
    it('does not call fetch', async () => {
      stubWindow(false);
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const { handleDelete } = configureAndRender();
      await handleDelete!();

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Property: On confirm + 204 → router.push('/projects')
  // [req §Story 1.5 AC1]; [lld §B.6 BDD "Redirects to /projects on 204"]
  // -------------------------------------------------------------------------

  describe('Given the user confirms and the DELETE returns 204', () => {
    it('calls router.push("/projects")', async () => {
      stubWindow(true);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 204 }));

      const { handleDelete } = configureAndRender();
      await handleDelete!();

      expect(mockRouterPushGlobal).toHaveBeenCalledWith('/projects');
    });

    it('does not set an error message', async () => {
      stubWindow(true);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 204 }));

      const setErrorSpy = vi.fn();
      const { handleDelete } = configureAndRender({ errorSet: setErrorSpy });
      await handleDelete!();

      const nonNullErrors = setErrorSpy.mock.calls.filter(
        ([v]: [unknown]) => typeof v === 'string' && v.length > 0,
      );
      expect(nonNullErrors).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Property: On confirm + 409 → "project not empty" error shown, no redirect
  // [req §Story 1.5 AC2]; [lld §B.6 BDD "Surfaces 'project not empty' on 409"]
  // -------------------------------------------------------------------------

  describe('Given the user confirms and the DELETE returns 409', () => {
    it('sets an error message containing "empty" or "assessments"', async () => {
      stubWindow(true);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 409 }));

      const setErrorSpy = vi.fn();
      const { handleDelete } = configureAndRender({ errorSet: setErrorSpy });
      await handleDelete!();

      const errorMessages = setErrorSpy.mock.calls
        .map(([v]: [unknown]) => v)
        .filter((v: unknown): v is string => typeof v === 'string' && v.length > 0);
      expect(errorMessages.length).toBeGreaterThan(0);
      const combined = errorMessages.join(' ').toLowerCase();
      expect(
        combined.includes('empty') || combined.includes('assessment'),
      ).toBe(true);
    });

    it('does NOT call router.push', async () => {
      stubWindow(true);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 409 }));

      const { handleDelete } = configureAndRender();
      await handleDelete!();

      expect(mockRouterPushGlobal).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Property: DELETE request is sent to /api/projects/[projectId]
  // [lld §B.6 "confirms then DELETEs /api/projects/[id]"]
  // -------------------------------------------------------------------------

  describe('Given the user confirms deletion', () => {
    it('sends DELETE to /api/projects/{projectId}', async () => {
      stubWindow(true);
      const fetchSpy = vi.fn().mockResolvedValue({ status: 204 });
      vi.stubGlobal('fetch', fetchSpy);

      const { handleDelete } = configureAndRender();
      await handleDelete!();

      expect(fetchSpy).toHaveBeenCalledWith(
        `/api/projects/${PROJECT_ID}`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property: Error message rendered with role="alert" when error state is set
  // [lld §B.6 inline error on 409]
  // -------------------------------------------------------------------------

  describe('Given an error message is set (e.g. after a 409)', () => {
    it('renders an element with role="alert" containing the error text', () => {
      const errorText = 'Project is not empty. Remove all assessments before deleting.';
      useStateSpy
        .mockReturnValueOnce([errorText, vi.fn()])   // error state
        .mockReturnValueOnce([false, vi.fn()]);       // deleting state
      useCallbackSpy.mockImplementation((fn: unknown) => fn);

      const result = DeleteButton({ projectId: PROJECT_ID });
      const tree = JSON.stringify(renderTree(result as RenderNode));

      expect(tree).toContain(errorText);
      expect(tree).toContain('"alert"');
    });
  });

  // -------------------------------------------------------------------------
  // Property: No error rendered in clean state
  // [lld §B.6] prohibition — role="alert" must not appear when error is null
  // -------------------------------------------------------------------------

  describe('Given the DeleteButton is in its initial (clean) state', () => {
    it('does not render role="alert"', () => {
      useStateSpy
        .mockReturnValueOnce([null, vi.fn()])    // error = null
        .mockReturnValueOnce([false, vi.fn()]);  // deleting = false
      useCallbackSpy.mockImplementation((fn: unknown) => fn);

      const result = DeleteButton({ projectId: PROJECT_ID });
      const tree = JSON.stringify(renderTree(result as RenderNode));

      expect(tree).not.toContain('"alert"');
    });
  });
});
