// Tests for AdminRootRedirect client component.
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md §A.2, §A.4, §B.3
// Requirements reference: docs/requirements/v11-requirements.md §Story 4.4, §Story 4.6
// Issue: #434

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted spies — must be defined before vi.mock() calls
// ---------------------------------------------------------------------------

const { clearLastVisitedProjectSpy, getLastVisitedProjectSpy, replaceSpy } = vi.hoisted(
  () => ({
    clearLastVisitedProjectSpy: vi.fn(),
    getLastVisitedProjectSpy: vi.fn<[], string | null>(),
    replaceSpy: vi.fn(),
  }),
);

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/last-visited-project', () => ({
  clearLastVisitedProject: clearLastVisitedProjectSpy,
  getLastVisitedProject: getLastVisitedProjectSpy,
  setLastVisitedProject: vi.fn(),
  LAST_VISITED_PROJECT_KEY: 'fcs:lastVisitedProjectId',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceSpy }),
}));

// Run useEffect synchronously so we can assert without act() or timers.
vi.mock('react', async (importActual) => {
  const actual = await importActual<typeof import('react')>();
  return {
    ...actual,
    useEffect: (fn: () => void) => fn(),
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { AdminRootRedirect } from '@/app/admin-root-redirect';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdminRootRedirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Property 1: Valid last-visited → router.replace called with /projects/[id]
  // [req §Story 4.4 AC1] [lld §A.2 "value present AND in projectIds"]
  // -------------------------------------------------------------------------

  describe('Given getLastVisitedProject returns an ID that is in projectIds', () => {
    it('then router.replace is called with /projects/[lastId]', () => {
      getLastVisitedProjectSpy.mockReturnValue('proj-1');

      AdminRootRedirect({ projectIds: ['proj-1', 'proj-2'] });

      expect(replaceSpy).toHaveBeenCalledWith('/projects/proj-1');
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: Valid last-visited → clearLastVisitedProject is NOT called
  // [req §Story 4.4 AC1] [lld §A.2 "value present AND in projectIds"]
  // -------------------------------------------------------------------------

  describe('Given getLastVisitedProject returns an ID that is in projectIds', () => {
    it('then clearLastVisitedProject is not called (value is valid)', () => {
      getLastVisitedProjectSpy.mockReturnValue('proj-1');

      AdminRootRedirect({ projectIds: ['proj-1', 'proj-2'] });

      expect(clearLastVisitedProjectSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: No last-visited (null) → router.replace called with /projects
  // [req §Story 4.4 AC2] [lld §A.2 "absent → router.replace(/projects)"]
  // -------------------------------------------------------------------------

  describe('Given getLastVisitedProject returns null', () => {
    it('then router.replace is called with /projects', () => {
      getLastVisitedProjectSpy.mockReturnValue(null);

      AdminRootRedirect({ projectIds: ['proj-1'] });

      expect(replaceSpy).toHaveBeenCalledWith('/projects');
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: No last-visited (null) → clearLastVisitedProject is NOT called
  // [req §Story 4.6 AC3 implicit] [lld §B.3 "if (lastId) clearLastVisitedProject()"]
  // -------------------------------------------------------------------------

  describe('Given getLastVisitedProject returns null', () => {
    it('then clearLastVisitedProject is not called (no stale value to clear)', () => {
      getLastVisitedProjectSpy.mockReturnValue(null);

      AdminRootRedirect({ projectIds: ['proj-1'] });

      expect(clearLastVisitedProjectSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: Stale last-visited (not in projectIds) → clearLastVisitedProject called
  // [req §Story 4.4 AC3] [req §Story 4.6 AC3] [lld §A.4 "Stale → Empty: root redirect detects & clears"]
  // -------------------------------------------------------------------------

  describe('Given getLastVisitedProject returns an ID that is NOT in projectIds', () => {
    it('then clearLastVisitedProject is called to remove the stale value', () => {
      getLastVisitedProjectSpy.mockReturnValue('proj-deleted');

      AdminRootRedirect({ projectIds: ['proj-1', 'proj-2'] });

      expect(clearLastVisitedProjectSpy).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: Stale last-visited → router.replace called with /projects (fallback)
  // [req §Story 4.4 AC3] [lld §A.2 "value present but not in projectIds → router.replace(/projects)"]
  // -------------------------------------------------------------------------

  describe('Given getLastVisitedProject returns an ID that is NOT in projectIds', () => {
    it('then router.replace is called with /projects as fallback', () => {
      getLastVisitedProjectSpy.mockReturnValue('proj-deleted');

      AdminRootRedirect({ projectIds: ['proj-1', 'proj-2'] });

      expect(replaceSpy).toHaveBeenCalledWith('/projects');
    });
  });

  // -------------------------------------------------------------------------
  // Property 7: Component returns null (no rendered output)
  // [lld §B.3 "return null"]
  // -------------------------------------------------------------------------

  describe('Given the component is rendered', () => {
    it('then it returns null (no DOM output)', () => {
      getLastVisitedProjectSpy.mockReturnValue(null);

      const result = AdminRootRedirect({ projectIds: [] });

      expect(result).toBeNull();
    });
  });
});
