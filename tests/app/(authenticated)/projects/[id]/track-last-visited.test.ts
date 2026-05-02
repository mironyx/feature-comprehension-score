// Tests for TrackLastVisitedProject client component.
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md §A.4, §B.3
// Requirements reference: docs/requirements/v11-requirements.md §Story 4.6
// Issue: #434

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted spies — must be defined before vi.mock() calls
// ---------------------------------------------------------------------------

const { setLastVisitedProjectSpy } = vi.hoisted(() => ({
  setLastVisitedProjectSpy: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/last-visited-project', () => ({
  setLastVisitedProject: setLastVisitedProjectSpy,
  getLastVisitedProject: vi.fn(),
  clearLastVisitedProject: vi.fn(),
  LAST_VISITED_PROJECT_KEY: 'fcs:lastVisitedProjectId',
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

import { TrackLastVisitedProject } from '@/app/(authenticated)/projects/[id]/track-last-visited';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TrackLastVisitedProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Property 1: setLastVisitedProject is called with the provided projectId
  // [req §Story 4.6 AC1] [lld §A.4 "Write: client component … writes to localStorage on mount"]
  // -------------------------------------------------------------------------

  describe('Given the component mounts with projectId="proj-1"', () => {
    it('then setLastVisitedProject is called with "proj-1"', () => {
      TrackLastVisitedProject({ projectId: 'proj-1' });

      expect(setLastVisitedProjectSpy).toHaveBeenCalledWith('proj-1');
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: setLastVisitedProject is called with a different projectId prop
  // [req §Story 4.6 AC1] [lld §B.3 "useEffect(() => { setLastVisitedProject(projectId); })"]
  // -------------------------------------------------------------------------

  describe('Given the component mounts with projectId="proj-2"', () => {
    it('then setLastVisitedProject is called with "proj-2"', () => {
      TrackLastVisitedProject({ projectId: 'proj-2' });

      expect(setLastVisitedProjectSpy).toHaveBeenCalledWith('proj-2');
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: Component returns null (no rendered output)
  // [lld §B.3 "return null"]
  // -------------------------------------------------------------------------

  describe('Given the component is rendered', () => {
    it('then it returns null (no DOM output)', () => {
      const result = TrackLastVisitedProject({ projectId: 'proj-1' });

      expect(result).toBeNull();
    });
  });
});
