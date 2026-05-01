// Tests for InlineEditHeader — pencil affordance for project name and description.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.6
// Requirements: docs/requirements/v11-requirements.md Story 1.4
// Issue: #399

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must precede component imports (vitest hoisting rules)
// ---------------------------------------------------------------------------

// Spy replacements for React hooks used by InlineEditHeader.
// Hoisted so vi.mock factories run before module-scope statements.
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

// Stub lucide-react icons as serialisable plain objects
vi.mock('lucide-react', () => ({
  Pencil: () => ({ type: 'svg', props: { 'data-testid': 'icon-pencil' } }),
  X: () => ({ type: 'svg', props: { 'data-testid': 'icon-x' } }),
  Check: () => ({ type: 'svg', props: { 'data-testid': 'icon-check' } }),
}));

// Stub the Button component as a serialisable plain object
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, 'aria-label': ariaLabel, disabled }: {
    children?: unknown;
    onClick?: () => void;
    'aria-label'?: string;
    disabled?: boolean;
  }) => ({
    type: 'button',
    props: { children, onClick, 'aria-label': ariaLabel, disabled },
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { InlineEditHeader } from '@/app/(authenticated)/projects/[id]/inline-edit-header';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-001';
const INITIAL_NAME = 'Payment Service';
const INITIAL_DESC = 'Handles all payment flows';

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
// State configuration helper
//
// InlineEditHeader calls useState in this order:
//   1. name             (initialName)
//   2. description      (initialDescription)
//   3. editing          (false)
//   4. editName         (initialName)
//   5. editDescription  (initialDescription ?? '')
//   6. error            (null)
//   7. saving           (false)
//
// Call configureState() FIRST, then override useCallbackSpy if needed.
// (configureState always sets a pass-through useCallback by default.)
// ---------------------------------------------------------------------------

type StateSetter = (v: unknown) => void;

function configureState({
  name = INITIAL_NAME,
  nameSet = vi.fn() as StateSetter,
  description = INITIAL_DESC as string | null,
  descSet = vi.fn() as StateSetter,
  editing = false,
  editingSet = vi.fn() as StateSetter,
  editName = INITIAL_NAME,
  editNameSet = vi.fn() as StateSetter,
  editDescription = INITIAL_DESC,
  editDescSet = vi.fn() as StateSetter,
  error = null as string | null,
  errorSet = vi.fn() as StateSetter,
  saving = false,
  savingSet = vi.fn() as StateSetter,
}: {
  name?: string;
  nameSet?: StateSetter;
  description?: string | null;
  descSet?: StateSetter;
  editing?: boolean;
  editingSet?: StateSetter;
  editName?: string;
  editNameSet?: StateSetter;
  editDescription?: string;
  editDescSet?: StateSetter;
  error?: string | null;
  errorSet?: StateSetter;
  saving?: boolean;
  savingSet?: StateSetter;
} = {}) {
  useStateSpy
    .mockReturnValueOnce([name, nameSet])
    .mockReturnValueOnce([description, descSet])
    .mockReturnValueOnce([editing, editingSet])
    .mockReturnValueOnce([editName, editNameSet])
    .mockReturnValueOnce([editDescription, editDescSet])
    .mockReturnValueOnce([error, errorSet])
    .mockReturnValueOnce([saving, savingSet]);
  useEffectSpy.mockImplementation(() => undefined);
  // Default: pass callbacks through unchanged.
  // Tests that need to capture a specific callback should override this
  // AFTER calling configureState().
  useCallbackSpy.mockImplementation((fn: unknown) => fn);
}

/**
 * Capture all useCallback callbacks in order (handleEdit=0, handleCancel=1, handleSave=2).
 * Must be called AFTER configureState() to avoid being overridden by it.
 */
function captureCallbacks(): { get: (index: number) => (() => unknown) | null } {
  const captured: Array<() => unknown> = [];
  useCallbackSpy.mockImplementation((fn: unknown) => {
    captured.push(fn as () => unknown);
    return fn;
  });
  return { get: (i) => captured[i] ?? null };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InlineEditHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Property: Renders project name in view mode
  // [req §Story 1.3 AC1] "shows the project name"
  // -------------------------------------------------------------------------

  describe('Given the component is in view mode (editing=false)', () => {
    it('renders the project name', () => {
      configureState();
      const tree = JSON.stringify(renderTree(InlineEditHeader({
        projectId: PROJECT_ID,
        initialName: INITIAL_NAME,
        initialDescription: INITIAL_DESC,
      })));
      expect(tree).toContain(INITIAL_NAME);
    });
  });

  // -------------------------------------------------------------------------
  // Property: Renders project description when non-null in view mode
  // [req §Story 1.3 AC1] "shows the project … description"
  // -------------------------------------------------------------------------

  describe('Given the component is in view mode with a non-null description', () => {
    it('renders the project description', () => {
      configureState();
      const tree = JSON.stringify(renderTree(InlineEditHeader({
        projectId: PROJECT_ID,
        initialName: INITIAL_NAME,
        initialDescription: INITIAL_DESC,
      })));
      expect(tree).toContain(INITIAL_DESC);
    });
  });

  // -------------------------------------------------------------------------
  // Property: Pencil/edit button is present in view mode
  // [req §Story 1.3 AC1] "inline edit affordance"; [lld §B.6 "pencil"]
  // -------------------------------------------------------------------------

  describe('Given the component is in view mode', () => {
    it('renders a pencil icon edit button', () => {
      configureState();
      const tree = JSON.stringify(renderTree(InlineEditHeader({
        projectId: PROJECT_ID,
        initialName: INITIAL_NAME,
        initialDescription: INITIAL_DESC,
      })));
      expect(tree).toContain('icon-pencil');
    });
  });

  // -------------------------------------------------------------------------
  // Property: Edit button has aria-label
  // [lld §B.6] accessibility affordance
  // -------------------------------------------------------------------------

  describe('Given the component is in view mode', () => {
    it('edit button has an aria-label referencing the edit action', () => {
      configureState();
      const tree = JSON.stringify(renderTree(InlineEditHeader({
        projectId: PROJECT_ID,
        initialName: INITIAL_NAME,
        initialDescription: INITIAL_DESC,
      })));
      expect(tree).toMatch(/[Ee]dit/);
    });
  });

  // -------------------------------------------------------------------------
  // Property: Edit mode shows input pre-filled with current name
  // [req §Story 1.4 AC1] "submits a new name and description"
  // -------------------------------------------------------------------------

  describe('Given the component is in edit mode (editing=true)', () => {
    it('renders an input with the current project name as value', () => {
      configureState({ editing: true });
      const tree = JSON.stringify(renderTree(InlineEditHeader({
        projectId: PROJECT_ID,
        initialName: INITIAL_NAME,
        initialDescription: INITIAL_DESC,
      })));
      expect(tree).toContain(INITIAL_NAME);
    });

    it('renders a textarea with the current description as value', () => {
      configureState({ editing: true });
      const tree = JSON.stringify(renderTree(InlineEditHeader({
        projectId: PROJECT_ID,
        initialName: INITIAL_NAME,
        initialDescription: INITIAL_DESC,
      })));
      expect(tree).toContain(INITIAL_DESC);
    });
  });

  // -------------------------------------------------------------------------
  // Property: Edit mode renders Save and Cancel buttons
  // [req §Story 1.4 AC1]; [lld §B.6]
  // -------------------------------------------------------------------------

  describe('Given the component is in edit mode', () => {
    it('renders a Save button', () => {
      configureState({ editing: true });
      const tree = JSON.stringify(renderTree(InlineEditHeader({
        projectId: PROJECT_ID,
        initialName: INITIAL_NAME,
        initialDescription: INITIAL_DESC,
      })));
      expect(tree).toMatch(/[Ss]ave/);
    });

    it('renders a Cancel button', () => {
      configureState({ editing: true });
      const tree = JSON.stringify(renderTree(InlineEditHeader({
        projectId: PROJECT_ID,
        initialName: INITIAL_NAME,
        initialDescription: INITIAL_DESC,
      })));
      expect(tree).toMatch(/[Cc]ancel/);
    });
  });

  // -------------------------------------------------------------------------
  // Property: handleSave sends PATCH to /api/projects/[id] with {name, description}
  // [req §Story 1.4 AC1] "PATCH /api/projects/[id] … {name, description}"
  // [lld §B.6 "inline edit submits PATCH /api/projects/[id] with {name, description}"]
  // Uses vi.stubGlobal('fetch') because MSW requires absolute URLs in Node env.
  // -------------------------------------------------------------------------

  describe('Given the user saves edits', () => {
    it('sends PATCH to /api/projects/{projectId} with {name, description}', async () => {
      const newName = 'Updated Payment Service';
      const newDesc = 'Updated description';
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: PROJECT_ID, name: newName, description: newDesc }),
      });
      vi.stubGlobal('fetch', fetchSpy);

      // configureState first, then capture callbacks
      configureState({ editName: newName, editDescription: newDesc });
      const cb = captureCallbacks();

      InlineEditHeader({ projectId: PROJECT_ID, initialName: INITIAL_NAME, initialDescription: INITIAL_DESC });

      const handleSave = cb.get(2) as (() => Promise<void>) | null; // index 2 = handleSave
      expect(handleSave).not.toBeNull();
      await handleSave!();

      const calls = fetchSpy.mock.calls as [string, RequestInit][];
      const patchCall = calls.find(([url, opts]) => url.includes(PROJECT_ID) && opts?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall![1].body as string) as Record<string, unknown>;
      expect(body['name']).toBe(newName);
    });
  });

  // -------------------------------------------------------------------------
  // Property: On 200 response, optimistic name update is committed (setName called)
  // [req §Story 1.4 AC1] "dashboard re-renders with the new values"
  // -------------------------------------------------------------------------

  describe('Given PATCH returns 200 with updated values', () => {
    it('calls setName with the new name (optimistic update committed)', async () => {
      const newName = 'Renamed Project';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: PROJECT_ID, name: newName, description: INITIAL_DESC }),
      }));

      const setNameSpy = vi.fn();
      configureState({ nameSet: setNameSpy, editName: newName, editDescription: INITIAL_DESC });
      const cb = captureCallbacks();

      InlineEditHeader({ projectId: PROJECT_ID, initialName: INITIAL_NAME, initialDescription: INITIAL_DESC });
      const handleSave = cb.get(2) as (() => Promise<void>) | null;
      expect(handleSave).not.toBeNull();
      await handleSave!();

      // handleSave does setName(editName) optimistically before awaiting fetch
      expect(setNameSpy).toHaveBeenCalledWith(newName);
    });
  });

  // -------------------------------------------------------------------------
  // Property: On 409, reverts optimistic name update
  // [req §Story 1.4 AC2] "409 for duplicate"; [lld §B.6 "error toast on 409"]
  // -------------------------------------------------------------------------

  describe('Given PATCH returns 409 (duplicate name)', () => {
    it('reverts name to the previous value after 409', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409 }));

      const setNameSpy = vi.fn();
      // name=INITIAL_NAME (current); editName='Duplicate Name' (new, duplicate)
      configureState({ nameSet: setNameSpy, editName: 'Duplicate Name', editDescription: INITIAL_DESC });
      const cb = captureCallbacks();

      InlineEditHeader({ projectId: PROJECT_ID, initialName: INITIAL_NAME, initialDescription: INITIAL_DESC });
      const handleSave = cb.get(2) as (() => Promise<void>) | null;
      expect(handleSave).not.toBeNull();
      await handleSave!();

      // After 409: setName(prevName) is called to revert the optimistic update
      const revertCalls = setNameSpy.mock.calls.filter(([v]: [unknown]) => v === INITIAL_NAME);
      expect(revertCalls.length).toBeGreaterThan(0);
    });

    it('sets an error message (non-empty string) on 409', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409 }));

      const setErrorSpy = vi.fn();
      configureState({ errorSet: setErrorSpy, editName: 'Duplicate Name', editDescription: INITIAL_DESC });
      const cb = captureCallbacks();

      InlineEditHeader({ projectId: PROJECT_ID, initialName: INITIAL_NAME, initialDescription: INITIAL_DESC });
      const handleSave = cb.get(2) as (() => Promise<void>) | null;
      expect(handleSave).not.toBeNull();
      await handleSave!();

      const errorMessages = setErrorSpy.mock.calls
        .map(([v]: [unknown]) => v)
        .filter((v: unknown): v is string => typeof v === 'string' && v.length > 0);
      expect(errorMessages.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Property: Error message rendered with role="alert" when error state is set
  // [lld §B.6 "error toast on 409"]
  // -------------------------------------------------------------------------

  describe('Given an error message is present (error state is non-null)', () => {
    it('renders the error text in an element with role="alert"', () => {
      const errorText = 'A project with that name already exists.';
      configureState({ error: errorText });
      const tree = JSON.stringify(renderTree(InlineEditHeader({
        projectId: PROJECT_ID,
        initialName: INITIAL_NAME,
        initialDescription: INITIAL_DESC,
      })));
      expect(tree).toContain(errorText);
      expect(tree).toContain('"alert"');
    });
  });

  // -------------------------------------------------------------------------
  // Property: Cancel reverts to view mode without calling fetch
  // [req §Story 1.4] "cancel" path; [lld §B.6]
  // -------------------------------------------------------------------------

  describe('Given the user clicks Cancel in edit mode', () => {
    it('does not call fetch', () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const setEditingSpy = vi.fn();
      configureState({ editing: true, editingSet: setEditingSpy });
      const cb = captureCallbacks();

      InlineEditHeader({ projectId: PROJECT_ID, initialName: INITIAL_NAME, initialDescription: INITIAL_DESC });

      const handleCancel = cb.get(1) as (() => void) | null; // index 1 = handleCancel
      expect(handleCancel).not.toBeNull();
      handleCancel!();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('calls setEditing(false) to exit edit mode', () => {
      vi.stubGlobal('fetch', vi.fn());

      const setEditingSpy = vi.fn();
      configureState({ editing: true, editingSet: setEditingSpy });
      const cb = captureCallbacks();

      InlineEditHeader({ projectId: PROJECT_ID, initialName: INITIAL_NAME, initialDescription: INITIAL_DESC });

      const handleCancel = cb.get(1) as (() => void) | null;
      expect(handleCancel).not.toBeNull();
      handleCancel!();

      expect(setEditingSpy).toHaveBeenCalledWith(false);
    });
  });

  // -------------------------------------------------------------------------
  // Property: No error rendered in clean view mode
  // [lld §B.6] prohibition — role="alert" must not appear when error is null
  // -------------------------------------------------------------------------

  describe('Given the component is in clean view mode (no error)', () => {
    it('does not render role="alert"', () => {
      configureState({ error: null });
      const tree = JSON.stringify(renderTree(InlineEditHeader({
        projectId: PROJECT_ID,
        initialName: INITIAL_NAME,
        initialDescription: INITIAL_DESC,
      })));
      expect(tree).not.toContain('"alert"');
    });
  });

  // -------------------------------------------------------------------------
  // Property: PATCH body keys are limited to {name, description}
  // [req §Story 1.4 Note] "header pencil submits {name, description}"
  // -------------------------------------------------------------------------

  describe('Given the user saves edits via the inline header', () => {
    it('PATCH body contains only name and optionally description (no extra fields)', async () => {
      const newName = 'Payload Check';
      const newDesc = 'Only these two fields';
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: PROJECT_ID, name: newName, description: newDesc }),
      });
      vi.stubGlobal('fetch', fetchSpy);

      configureState({ editName: newName, editDescription: newDesc });
      const cb = captureCallbacks();

      InlineEditHeader({ projectId: PROJECT_ID, initialName: INITIAL_NAME, initialDescription: INITIAL_DESC });
      const handleSave = cb.get(2) as (() => Promise<void>) | null;
      expect(handleSave).not.toBeNull();
      await handleSave!();

      const calls = fetchSpy.mock.calls as [string, RequestInit][];
      const patchCall = calls.find(([url, opts]) => url.includes(PROJECT_ID) && opts?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall![1].body as string) as Record<string, unknown>;
      for (const key of Object.keys(body)) {
        expect(['name', 'description']).toContain(key);
      }
      expect(body['name']).toBe(newName);
    });
  });
});
