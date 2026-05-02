// Tests for BreadcrumbsBar (context-aware), BreadcrumbProvider, and SetBreadcrumbs.
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md §B.2
// Requirements: docs/requirements/v11-requirements.md §Epic 4 Story 4.3
// Issue: #433

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports per vitest hoisting rules.
// ---------------------------------------------------------------------------

// Configurable pathname stub for next/navigation.
const pathnameHolder = { value: '/assessments' };

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameHolder.value,
}));

// React hook spies — hoisted so vi.mock factory can reference them.
const { useContextSpy, useStateSpy, useEffectSpy } = vi.hoisted(() => ({
  useContextSpy: vi.fn(),
  useStateSpy: vi.fn(),
  useEffectSpy: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useContext: useContextSpy,
    useState: useStateSpy,
    useEffect: useEffectSpy,
  };
});

// next/link stub — returns a plain object so JSON.stringify picks up href.
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => ({
    type: 'a',
    props: { href, children, className },
  }),
}));

// Breadcrumbs (presentational) stub — surface segments so assertions can read
// labels and hrefs without depending on the presentational component.
vi.mock('@/components/ui/breadcrumbs', () => ({
  Breadcrumbs: ({ segments }: { segments: ReadonlyArray<{ label: string; href?: string }> }) => ({
    type: 'nav',
    props: {
      'aria-label': 'Breadcrumb',
      'data-segments': JSON.stringify(segments),
      children: null,
    },
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks.
// ---------------------------------------------------------------------------

import type { BreadcrumbSegment } from '@/components/ui/breadcrumbs';
import { BreadcrumbsBar } from '@/components/breadcrumbs-bar';
import { BreadcrumbProvider, useBreadcrumbSegments } from '@/components/breadcrumb-provider';
import { SetBreadcrumbs } from '@/components/set-breadcrumbs';

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

// Recursively expand function-component nodes into their plain-object form.
// Matches the pattern used in nav-bar.test.ts and theme-toggle.test.ts.
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
      ? newProps.children.map(renderTree)
      : renderTree(newProps.children as RenderNode);
  }
  return { ...el, props: newProps };
}

/** Serialise a tree to a string for substring assertions. */
function serialise(node: RenderNode): string {
  return JSON.stringify(renderTree(node));
}

// The most recently captured effect callback and its cleanup, set whenever
// useEffectSpy fires.
let capturedEffectCallback: (() => void | (() => void)) | null = null;

/** Invoke the effect captured during the last render call. Returns its cleanup. */
function runMountEffect(): (() => void) | undefined {
  const result = capturedEffectCallback?.();
  return typeof result === 'function' ? result : undefined;
}

// ---------------------------------------------------------------------------
// Default hook configuration helpers.
// ---------------------------------------------------------------------------

/** Configure context spy to return empty segments (no SetBreadcrumbs mounted). */
function withEmptyContext(): void {
  useContextSpy.mockReturnValue({ segments: [], setSegments: vi.fn() });
}

/** Configure context spy to return the given segments. */
function withContextSegments(segments: BreadcrumbSegment[]): void {
  useContextSpy.mockReturnValue({ segments, setSegments: vi.fn() });
}

/** Configure hooks for a SetBreadcrumbs render (captures the effect). */
function configureSetBreadcrumbsHooks(setSegments: ReturnType<typeof vi.fn>): void {
  // SetBreadcrumbs calls useBreadcrumbSegments() (which internally calls
  // useContext). We re-use the useContextSpy for that.
  useContextSpy.mockReturnValue({ segments: [], setSegments });
  capturedEffectCallback = null;
  useEffectSpy.mockImplementationOnce(
    (fn: () => void | (() => void), _deps?: unknown[]) => {
      capturedEffectCallback = fn;
    },
  );
}

// ---------------------------------------------------------------------------
// beforeEach / afterEach.
// ---------------------------------------------------------------------------

beforeEach(() => {
  pathnameHolder.value = '/assessments';
  capturedEffectCallback = null;

  // Sensible defaults — tests override as needed.
  withEmptyContext();
  useStateSpy.mockReturnValue([[], vi.fn()]);
  useEffectSpy.mockImplementation(
    (fn: () => void | (() => void), _deps?: unknown[]) => {
      capturedEffectCallback = fn;
    },
  );
});

afterEach(() => {
  vi.resetAllMocks();
});

// ===========================================================================
// BreadcrumbsBar — static ROUTE_MAP fallback (no context segments)
// ===========================================================================

describe('BreadcrumbsBar — static ROUTE_MAP fallback', () => {

  // -------------------------------------------------------------------------
  // Property 1a: /assessments → "My Assessments" segment
  // [lld §B.2] "falls back to existing static ROUTE_MAP for non-project routes"
  // [req §Story 4.3 AC] "Static routes (/assessments, /organisation) still use ROUTE_MAP"
  // -------------------------------------------------------------------------
  describe('Given no context segments and pathname is /assessments', () => {
    it('then it renders the "My Assessments" breadcrumb segment', () => {
      // [lld §B.2 I3] BreadcrumbsBar falls back to ROUTE_MAP when context is empty.
      pathnameHolder.value = '/assessments';
      withEmptyContext();
      const html = serialise(BreadcrumbsBar());
      expect(html).toContain('My Assessments');
    });
  });

  // -------------------------------------------------------------------------
  // Property 1b: /organisation → "Organisation" segment
  // [lld §B.2] static ROUTE_MAP fallback
  // -------------------------------------------------------------------------
  describe('Given no context segments and pathname is /organisation', () => {
    it('then it renders the "Organisation" breadcrumb segment', () => {
      // [lld §B.2] static map includes /organisation
      pathnameHolder.value = '/organisation';
      withEmptyContext();
      const html = serialise(BreadcrumbsBar());
      expect(html).toContain('Organisation');
    });
  });

  // -------------------------------------------------------------------------
  // Property 1c: /assessments/new → "New Assessment" segment
  // [lld §B.2] static ROUTE_MAP fallback
  // -------------------------------------------------------------------------
  describe('Given no context segments and pathname is /assessments/new', () => {
    it('then it renders the "New Assessment" breadcrumb segment', () => {
      // [lld §B.2] static map includes /assessments/new
      pathnameHolder.value = '/assessments/new';
      withEmptyContext();
      const html = serialise(BreadcrumbsBar());
      expect(html).toContain('New Assessment');
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: Unknown route with no context → null
  // [lld §B.2] "if (!segments) return null"
  // -------------------------------------------------------------------------
  describe('Given no context segments and pathname is not in ROUTE_MAP', () => {
    it('then BreadcrumbsBar returns null', () => {
      // [lld §B.2 I3] Unknown routes with empty context produce no breadcrumbs.
      pathnameHolder.value = '/projects/abc';
      withEmptyContext();
      const result = BreadcrumbsBar();
      expect(result).toBeNull();
    });
  });

});

// ===========================================================================
// BreadcrumbsBar — context-driven rendering (project-scoped routes)
// ===========================================================================

describe('BreadcrumbsBar — context-driven rendering', () => {

  // -------------------------------------------------------------------------
  // Property 3a: /projects/123 with context → Projects > Project Alpha
  // [lld §B.2 BDD spec] "/projects/[id] shows Projects > [Project Name]"
  // [req §Story 4.3 AC 1]
  // -------------------------------------------------------------------------
  describe('Given context has segments for /projects/[id]', () => {
    it('then it renders Projects and the project name', () => {
      // [lld §B.2] "BreadcrumbsBar renders those segments regardless of pathname"
      pathnameHolder.value = '/projects/123';
      withContextSegments([
        { label: 'Projects', href: '/projects' },
        { label: 'Project Alpha' },
      ]);
      const html = serialise(BreadcrumbsBar());
      expect(html).toContain('Projects');
      expect(html).toContain('Project Alpha');
    });
  });

  // -------------------------------------------------------------------------
  // Property 3b: /projects/123/settings with context → Projects > Project Alpha > Settings
  // [lld §B.2 BDD spec] "/projects/[id]/settings shows Projects > [Project Name] > Settings"
  // [req §Story 4.3 AC 2]
  // -------------------------------------------------------------------------
  describe('Given context has segments for /projects/[id]/settings', () => {
    it('then it renders Projects, the project name, and Settings', () => {
      // [lld §B.2] context segments are used for project-scoped settings page
      pathnameHolder.value = '/projects/123/settings';
      withContextSegments([
        { label: 'Projects', href: '/projects' },
        { label: 'Project Alpha', href: '/projects/123' },
        { label: 'Settings' },
      ]);
      const html = serialise(BreadcrumbsBar());
      expect(html).toContain('Projects');
      expect(html).toContain('Project Alpha');
      expect(html).toContain('Settings');
    });
  });

  // -------------------------------------------------------------------------
  // Property 3c: /projects/123/assessments/abc with context → Projects > Project Alpha > Assessment
  // [lld §B.2 BDD spec] "/projects/[id]/assessments/[aid] shows Projects > [Project Name] > Assessment"
  // [req §Story 4.3 AC 3]
  // -------------------------------------------------------------------------
  describe('Given context has segments for /projects/[id]/assessments/[aid]', () => {
    it('then it renders Projects, the project name, and Assessment', () => {
      // [lld §B.2] admin path on assessment detail — context set by SetBreadcrumbs
      pathnameHolder.value = '/projects/123/assessments/abc';
      withContextSegments([
        { label: 'Projects', href: '/projects' },
        { label: 'Project Alpha', href: '/projects/123' },
        { label: 'Assessment' },
      ]);
      const html = serialise(BreadcrumbsBar());
      expect(html).toContain('Projects');
      expect(html).toContain('Project Alpha');
      expect(html).toContain('Assessment');
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: Context wins over static map — known static route + context segments
  // [lld §B.2] "contextSegments.length > 0 → contextSegments (takes precedence)"
  // -------------------------------------------------------------------------
  describe('Given pathname is in ROUTE_MAP AND context has non-empty segments', () => {
    it('then context segments take precedence over the static map', () => {
      // [lld §B.2 I3] Regression guard: context beats ROUTE_MAP when non-empty.
      pathnameHolder.value = '/assessments';
      withContextSegments([
        { label: 'Projects', href: '/projects' },
        { label: 'Custom Project' },
      ]);
      const html = serialise(BreadcrumbsBar());
      // Context wins — should NOT show the static "My Assessments" segment
      expect(html).not.toContain('My Assessments');
      expect(html).toContain('Custom Project');
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: Empty context segments → fall back to static map
  // [lld §B.2] "contextSegments.length > 0" guard — empty context uses fallback
  // -------------------------------------------------------------------------
  describe('Given context has an empty segments array and pathname is in ROUTE_MAP', () => {
    it('then it falls back to the static ROUTE_MAP entry', () => {
      // [lld §B.2] Empty segments = initial state, no SetBreadcrumbs mounted
      pathnameHolder.value = '/assessments';
      withEmptyContext();
      const html = serialise(BreadcrumbsBar());
      expect(html).toContain('My Assessments');
    });
  });

  describe('Given context has an empty segments array and pathname is unknown', () => {
    it('then it returns null (unknown route, empty context)', () => {
      // [lld §B.2] Empty context + unknown route → null (I3)
      pathnameHolder.value = '/projects/xyz/unknown';
      withEmptyContext();
      const result = BreadcrumbsBar();
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: "Projects" segment links to /projects
  // [lld §B.2 BDD spec] "Projects breadcrumb segment links to /projects"
  // [req §Story 4.3 AC] "Projects breadcrumb segment links to /projects"
  // -------------------------------------------------------------------------
  describe('Given context has a Projects segment with href /projects', () => {
    it('then the rendered output contains a link to /projects', () => {
      // [lld §B.2 BDD spec] first breadcrumb is always a link to /projects
      pathnameHolder.value = '/projects/123';
      withContextSegments([
        { label: 'Projects', href: '/projects' },
        { label: 'My Project' },
      ]);
      const html = serialise(BreadcrumbsBar());
      expect(html).toContain('/projects');
    });
  });

  // -------------------------------------------------------------------------
  // Property 7: Project name segment links to /projects/[id]
  // [lld §B.2 BDD spec] "Project name breadcrumb segment links to /projects/[id]"
  // [req §Story 4.3 AC]
  // -------------------------------------------------------------------------
  describe('Given context has a project name segment with href /projects/123', () => {
    it('then the rendered output contains a link to /projects/123', () => {
      // [lld §B.2 BDD spec] second breadcrumb links back to the project dashboard
      pathnameHolder.value = '/projects/123/settings';
      withContextSegments([
        { label: 'Projects', href: '/projects' },
        { label: 'My Project', href: '/projects/123' },
        { label: 'Settings' },
      ]);
      const html = serialise(BreadcrumbsBar());
      expect(html).toContain('/projects/123');
    });
  });

  // -------------------------------------------------------------------------
  // Property 8: Member on /projects/[id]/assessments/[aid] → no breadcrumbs (I4)
  // [lld §B.2 BDD spec] "Member on /projects/[id]/assessments/[aid] sees no breadcrumbs"
  // [lld §A.3 I4] Members never call SetBreadcrumbs — context stays empty
  // -------------------------------------------------------------------------
  describe('Given context is empty and pathname is a project-scoped assessment route', () => {
    it('then BreadcrumbsBar returns null — member sees no breadcrumbs (invariant I4)', () => {
      // [lld §B.2 I4] Member path: no SetBreadcrumbs rendered → context empty → null
      pathnameHolder.value = '/projects/123/assessments/abc';
      withEmptyContext();
      const result = BreadcrumbsBar();
      expect(result).toBeNull();
    });
  });

});

// ===========================================================================
// SetBreadcrumbs — component contract
// ===========================================================================

describe('SetBreadcrumbs', () => {

  // -------------------------------------------------------------------------
  // Property 9: SetBreadcrumbs renders null (no DOM output)
  // [lld §B.2] "return null;"
  // -------------------------------------------------------------------------
  describe('Given SetBreadcrumbs is rendered with any segments', () => {
    it('then it returns null (no DOM output)', () => {
      // [lld §B.2] SetBreadcrumbs is a side-effect-only component, renders nothing.
      const setSegments = vi.fn();
      configureSetBreadcrumbsHooks(setSegments);
      const result = SetBreadcrumbs({
        segments: [{ label: 'Projects', href: '/projects' }, { label: 'Alpha' }],
      });
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Property 10: SetBreadcrumbs registers segments via context on mount
  // [lld §B.2] "useEffect(() => { setSegments(segments); ... })"
  // -------------------------------------------------------------------------
  describe('Given SetBreadcrumbs is mounted inside a BreadcrumbProvider', () => {
    it('then it calls setSegments with the provided segments on mount', () => {
      // [lld §B.2] Effect fires → setSegments is called with the prop value.
      const setSegments = vi.fn();
      const segments: BreadcrumbSegment[] = [
        { label: 'Projects', href: '/projects' },
        { label: 'Project Alpha' },
      ];
      configureSetBreadcrumbsHooks(setSegments);
      SetBreadcrumbs({ segments });
      runMountEffect();
      expect(setSegments).toHaveBeenCalledWith(segments);
    });
  });

  // -------------------------------------------------------------------------
  // Property 11: SetBreadcrumbs clears segments on unmount
  // [lld §B.2] "return () => setSegments([]);" — cleanup in useEffect
  // -------------------------------------------------------------------------
  describe('Given SetBreadcrumbs is unmounted', () => {
    it('then it calls setSegments with an empty array (cleanup)', () => {
      // [lld §B.2] Cleanup function resets context to [] on unmount.
      const setSegments = vi.fn();
      const segments: BreadcrumbSegment[] = [
        { label: 'Projects', href: '/projects' },
        { label: 'Project Alpha' },
      ];
      configureSetBreadcrumbsHooks(setSegments);
      SetBreadcrumbs({ segments });
      const cleanup = runMountEffect();
      expect(cleanup).toBeDefined();
      cleanup!();
      expect(setSegments).toHaveBeenCalledWith([]);
    });
  });

});

// ===========================================================================
// BreadcrumbProvider — context contract
// ===========================================================================

describe('BreadcrumbProvider', () => {

  // -------------------------------------------------------------------------
  // Property 12: BreadcrumbProvider initial state — segments is []
  // [lld §B.2] "const [segments, setSegments] = useState<BreadcrumbSegment[]>([])"
  // -------------------------------------------------------------------------
  describe('Given BreadcrumbProvider is rendered with no SetBreadcrumbs mounted', () => {
    it('then useBreadcrumbSegments returns segments: [] initially', () => {
      // [lld §B.2] Provider initialises with empty segments.
      // We test the default context value here: the BreadcrumbContext is created
      // with segments: [] as the default, which is what useContext returns
      // before a provider wraps the consumer.
      useContextSpy.mockReturnValue({ segments: [], setSegments: vi.fn() });
      const { segments } = useBreadcrumbSegments();
      expect(segments).toEqual([]);
    });

    it('then useBreadcrumbSegments returns a setSegments function', () => {
      // [lld §B.2] Provider exposes setSegments for SetBreadcrumbs to call.
      useContextSpy.mockReturnValue({ segments: [], setSegments: vi.fn() });
      const { setSegments } = useBreadcrumbSegments();
      expect(typeof setSegments).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // Property 12c: BreadcrumbProvider wraps children with the context value
  // [lld §B.2] Provider renders children inside BreadcrumbContext.Provider
  // -------------------------------------------------------------------------
  describe('Given BreadcrumbProvider is rendered with children', () => {
    it('then it renders its children (not null, not an error)', () => {
      // [lld §B.2] Provider must wrap children; rendering must succeed.
      useStateSpy.mockReturnValue([[], vi.fn()]);
      const child = { type: 'span', props: { children: 'test-child' } };
      // BreadcrumbProvider is a function component — call it directly.
      const result = BreadcrumbProvider({ children: child as unknown as import('react').ReactNode });
      // The result should be a React element (not null, not an error).
      expect(result).not.toBeNull();
      expect(typeof result).toBe('object');
    });
  });

});
