// Tests for MobileNavMenu component — hamburger menu for mobile viewports.
// Design reference: docs/design/lld-v7-frontend-ux.md § T7
// Requirements reference: docs/requirements/v7-requirements.md § Story 3.3
// Issue: #346

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports per vitest hoisting rules
// ---------------------------------------------------------------------------

// Spy replacements for React hooks. We replace useState, useEffect, and useRef
// so the component can be called in Node without a DOM renderer, while tests
// can inspect and invoke hook side-effects directly.
// Hoisted because vi.mock factories run before module-scope statements.
const { useStateSpy, useEffectSpy, useRefSpy } = vi.hoisted(() => ({
  useStateSpy: vi.fn(),
  useEffectSpy: vi.fn(),
  useRefSpy: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: useStateSpy,
    useEffect: useEffectSpy,
    useRef: useRefSpy,
  };
});

// Stub lucide-react icons so tests can identify rendered icons without
// importing the full SVG implementation.
vi.mock('lucide-react', () => ({
  Menu: ({ size }: { size?: number }) => ({
    type: 'svg',
    props: { 'data-testid': 'icon-menu', size },
  }),
  X: ({ size }: { size?: number }) => ({
    type: 'svg',
    props: { 'data-testid': 'icon-x', size },
  }),
}));

// Stub next/link — returns a plain object with href and children so we can
// inspect link props without framework internals. Mirrors nav-bar.test.ts.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    onClick,
  }: {
    href: string;
    children: unknown;
    className?: string;
    onClick?: () => void;
  }) => ({
    type: 'a',
    props: { href, children, className, onClick },
  }),
}));

// Stub OrgSwitcher — captures currentOrg and allOrgs props for verification.
vi.mock('@/components/org-switcher', () => ({
  OrgSwitcher: (props: {
    currentOrg: { github_org_name: string };
    allOrgs: unknown[];
  }) => ({
    type: 'div',
    props: {
      'data-testid': 'org-switcher',
      'data-org': props.currentOrg.github_org_name,
    },
  }),
}));

// Stub SignOutButton — represented as a form with the same action so existing
// sign-out assertions still pass without coupling to the inline form structure.
vi.mock('@/components/sign-out-button', () => ({
  SignOutButton: () => ({
    type: 'form',
    props: {
      method: 'POST',
      action: '/auth/sign-out',
      'data-testid': 'sign-out-button',
    },
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { MobileNavMenu } from '@/components/mobile-nav-menu';
import type { NavLink } from '@/components/nav-links';
import type { Database } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Factories  (copied from nav-bar.test.ts — repo convention is local copies)
// ---------------------------------------------------------------------------

type OrgRow = Database['public']['Tables']['organisations']['Row'];

function makeOrg(overrides: Partial<OrgRow> = {}): OrgRow {
  return {
    id: 'org-001',
    github_org_name: 'acme',
    github_org_id: 1001,
    installation_id: 9001,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ASSESSMENTS_LINK: NavLink = {
  href: '/assessments',
  label: 'My Assessments',
  matchPrefix: '/assessments',
};

const ORGANISATION_LINK: NavLink = {
  href: '/organisation',
  label: 'Organisation',
  matchPrefix: '/organisation',
};

const DEFAULT_LINKS: readonly NavLink[] = [ASSESSMENTS_LINK, ORGANISATION_LINK];

const DEFAULT_ORG = makeOrg();
const DEFAULT_ALL_ORGS: readonly OrgRow[] = [DEFAULT_ORG];

// ---------------------------------------------------------------------------
// Helpers — recursive component tree expander
// ---------------------------------------------------------------------------

// Recursively invoke function-component nodes so stubs (Menu, X, OrgSwitcher,
// next/link) expand into their plain-object form. useRef stubs return
// { current: null } by default so renderTree never calls them.
// (Copied verbatim from theme-toggle.test.ts and extended for useRef.)
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

// ---------------------------------------------------------------------------
// Helpers — hook configuration
// ---------------------------------------------------------------------------

// Captured effect callbacks — the component may register multiple effects.
// We capture them by order of registration.
let capturedEffects: Array<() => void | (() => void)> = [];

// menuRef object passed back from useRef — tests can set .current to simulate
// a real DOM node being inside or outside the click target.
let menuRefStub: { current: Element | null };

type StateSetter = (value: boolean | ((prev: boolean) => boolean)) => void;

/**
 * Configure useStateSpy / useEffectSpy / useRefSpy for one render call.
 * @param isOpen  — initial value of the open state (default false = closed)
 * @param setter  — optional spy for the state setter; defaults to a new vi.fn()
 */
function configureHooks(
  isOpen = false,
  setter: StateSetter = vi.fn()
): StateSetter {
  menuRefStub = { current: null };

  useStateSpy.mockReturnValueOnce([isOpen, setter]);
  useRefSpy.mockReturnValueOnce(menuRefStub);
  useEffectSpy.mockImplementation(
    (fn: () => void | (() => void), _deps?: unknown[]) => {
      capturedEffects.push(fn);
    }
  );

  return setter;
}

/**
 * Run the Nth effect callback (0-indexed). The component typically registers
 * a single mount effect for keyboard/outside-click listeners.
 */
function runEffect(index = 0): void {
  capturedEffects[index]?.();
}

// ---------------------------------------------------------------------------
// Helper — default render
// ---------------------------------------------------------------------------

function renderMenu(overrides: {
  links?: readonly NavLink[];
  username?: string;
  currentOrg?: OrgRow;
  allOrgs?: readonly OrgRow[];
} = {}): RenderNode {
  return renderTree(
    MobileNavMenu({
      links: overrides.links ?? DEFAULT_LINKS,
      username: overrides.username ?? 'alice',
      currentOrg: overrides.currentOrg ?? DEFAULT_ORG,
      allOrgs: overrides.allOrgs ?? DEFAULT_ALL_ORGS,
    })
  );
}

// ---------------------------------------------------------------------------
// Helpers — document stub for listener-based tests
// ---------------------------------------------------------------------------

// The vitest environment is 'node' — `document` does not exist. Tests that
// need to assert addEventListener/removeEventListener calls must stub the
// global document with a plain object that has spy-able methods.

type EventListenerRecord = {
  event: string;
  handler: EventListenerOrEventListenerObject;
};

function makeDocumentStub() {
  const listeners: EventListenerRecord[] = [];
  const stub = {
    addEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) => {
      listeners.push({ event, handler });
    }),
    removeEventListener: vi.fn(),
    // Expose the listener log for inspection.
    _listeners: listeners,
    // Fire all registered handlers for a given event.
    _fire(event: string, e: unknown) {
      for (const rec of listeners) {
        if (rec.event === event) {
          (rec.handler as (e: unknown) => void)(e);
        }
      }
    },
  };
  return stub;
}

// ---------------------------------------------------------------------------
// Test-local globals
// ---------------------------------------------------------------------------

let documentStub: ReturnType<typeof makeDocumentStub>;

beforeEach(() => {
  capturedEffects = [];
  menuRefStub = { current: null };
  documentStub = makeDocumentStub();

  // Default hooks: menu closed (isOpen = false), useRef returns { current: null }
  useStateSpy.mockReturnValue([false, vi.fn()]);
  useRefSpy.mockReturnValue({ current: null });
  useEffectSpy.mockImplementation(
    (fn: () => void | (() => void), _deps?: unknown[]) => {
      capturedEffects.push(fn);
    }
  );

  // Stub global document for all tests.
  vi.stubGlobal('document', documentStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MobileNavMenu', () => {

  // -------------------------------------------------------------------------
  // Property 1: Renders a hamburger toggle button with an aria-label
  // -------------------------------------------------------------------------

  describe('Given the component is rendered', () => {
    it('then it renders a button element', () => {
      // [lld §T7 BDD] "renders hamburger icon on mobile"
      // [req §Story 3.3] hamburger icon triggers panel
      const tree = JSON.stringify(renderMenu());
      expect(tree).toContain('"button"');
    });

    it('then the toggle button has an aria-label', () => {
      // [lld §T7] "accessible (has an aria-label)"
      // [req §Story 3.3 AC] "Given the user taps the hamburger icon"
      const tree = JSON.stringify(renderMenu());
      expect(tree).toContain('aria-label');
    });
  });

  // -------------------------------------------------------------------------
  // Property 2 & 3: Wrapper / button hidden on desktop via md:hidden
  // -------------------------------------------------------------------------

  describe('Given the component is rendered', () => {
    it('then the outermost element carries the md:hidden Tailwind class', () => {
      // [lld §T7] "hide hamburger on desktop (>= 768px)"
      // [req §Story 3.3 AC] "Given desktop viewports (>= 768px), current layout preserved"
      const tree = JSON.stringify(renderMenu());
      expect(tree).toContain('md:hidden');
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: Default state is closed — panel not rendered when isOpen=false
  // -------------------------------------------------------------------------

  describe('Given the menu is in its default (closed) state', () => {
    it('then the menu panel is not visible', () => {
      // [lld §T7 BDD] implicitly — open state triggers panel
      // [req §Story 3.3 AC] panel shown only after tap
      // We check the panel is absent or hidden when isOpen === false.
      // The tree should NOT contain the nav links in the panel section.
      // (Links are only rendered inside the panel, not outside it.)
      configureHooks(false);
      const tree = JSON.stringify(renderMenu());

      // When closed, the panel content (links, username, sign-out form) must
      // not be present — or the wrapper must carry a "hidden" class.
      // We accept either strategy: entirely absent OR class="hidden".
      // The pair (My Assessments link href AND sign-out form) appearing together
      // in the output would mean the panel is inadvertently rendered when closed.
      const hasOpenPanel =
        tree.includes('"/assessments"') &&
        tree.includes('/auth/sign-out');

      // If the panel IS in the tree it must be hidden.
      if (hasOpenPanel) {
        expect(tree).toContain('"hidden"');
      } else {
        // Panel simply not rendered — acceptable.
        expect(hasOpenPanel).toBe(false);
      }
    });

    it('then the Menu (hamburger) icon is shown, not X', () => {
      // [lld §T7] "Hamburger icon (Menu from lucide-react)"
      configureHooks(false);
      const tree = JSON.stringify(renderMenu());
      expect(tree).toContain('icon-menu');
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: Clicking the hamburger button opens the panel
  // -------------------------------------------------------------------------

  describe('Given the menu is closed and the hamburger button is clicked', () => {
    it('then the state setter is called (toggling open state)', () => {
      // [lld §T7 BDD] "opens menu panel on hamburger click"
      // [req §Story 3.3 AC] "user taps the hamburger icon → panel shows"
      const setter = vi.fn();
      configureHooks(false, setter);
      const tree = renderMenu() as { props?: Record<string, unknown> };
      // Find the button's onClick — it may be at the top level or nested.
      // We walk the JSON to find any onClick that will call setter.
      const treeStr = JSON.stringify(tree);
      // The rendered tree must contain an onClick reference somewhere.
      // Invoke it directly by locating the button node.
      function findButtonOnClick(node: RenderNode): (() => void) | undefined {
        if (!node || typeof node !== 'object') return undefined;
        if (Array.isArray(node)) {
          for (const child of node) {
            const found = findButtonOnClick(child);
            if (found) return found;
          }
          return undefined;
        }
        const el = node as { type?: unknown; props?: Record<string, unknown> };
        if (el.type === 'button' && typeof el.props?.onClick === 'function') {
          return el.props.onClick as () => void;
        }
        if (el.props) {
          for (const val of Object.values(el.props)) {
            const found = findButtonOnClick(val);
            if (found) return found;
          }
        }
        return undefined;
      }
      const onClick = findButtonOnClick(tree);
      expect(onClick, 'toggle button must expose an onClick handler').toBeDefined();
      onClick!();
      expect(setter).toHaveBeenCalled();
      // Avoid false positives from this assertion by checking treeStr is valid.
      expect(treeStr.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: Panel contains all nav links
  // -------------------------------------------------------------------------

  describe('Given the menu is open', () => {
    it('then all nav link hrefs appear in the rendered panel', () => {
      // [lld §T7 BDD] "contains all nav links, org name, and sign out"
      // [req §Story 3.3 AC] "panel shows all navigation items"
      configureHooks(true);
      const tree = JSON.stringify(renderMenu());
      expect(tree).toContain('"/assessments"');
      expect(tree).toContain('"/organisation"');
    });

    it('then all nav link labels appear in the rendered panel', () => {
      // [lld §T7 BDD] "contains all nav links"
      // [req §Story 3.3 AC] all nav items visible
      configureHooks(true);
      const tree = JSON.stringify(renderMenu());
      expect(tree).toContain('My Assessments');
      expect(tree).toContain('Organisation');
    });
  });

  // -------------------------------------------------------------------------
  // Property 7: Panel contains the username
  // -------------------------------------------------------------------------

  describe('Given the menu is open', () => {
    it('then the username is displayed in the panel', () => {
      // [lld §T7 BDD] "contains all nav links, org name, and sign out"
      // The username "bob" must appear somewhere in the rendered tree.
      configureHooks(true);
      const tree = JSON.stringify(renderMenu({ username: 'bob' }));
      expect(tree).toContain('bob');
    });
  });

  // -------------------------------------------------------------------------
  // Property 8: Panel contains the current org name (via OrgSwitcher)
  // -------------------------------------------------------------------------

  describe('Given the menu is open', () => {
    it('then the current org name is accessible in the panel', () => {
      // [lld §T7 BDD] "contains all nav links, org name, and sign out"
      // [req §Story 3.3 AC] org switcher appears in collapsed panel
      const orgWithName = makeOrg({ github_org_name: 'globex' });
      configureHooks(true);
      const tree = JSON.stringify(
        renderMenu({ currentOrg: orgWithName, allOrgs: [orgWithName] })
      );
      expect(tree).toContain('globex');
    });

    it('then the OrgSwitcher stub is present in the panel', () => {
      // [lld §T7] OrgSwitcher embedded in panel
      configureHooks(true);
      const tree = JSON.stringify(renderMenu());
      expect(tree).toContain('org-switcher');
    });
  });

  // -------------------------------------------------------------------------
  // Property 9: Panel contains a sign-out form posting to /auth/sign-out
  // -------------------------------------------------------------------------

  describe('Given the menu is open', () => {
    it('then a sign-out form is rendered in the panel', () => {
      // [lld §T7 BDD] "contains all nav links, org name, and sign out"
      // [req §Story 3.3] sign out must be accessible from mobile panel
      // Mirrors the nav-bar.test.ts assertion pattern.
      configureHooks(true);
      const tree = JSON.stringify(renderMenu());
      expect(tree).toContain('form');
      expect(tree).toContain('/auth/sign-out');
    });

    it('then the sign-out form uses HTTP POST method', () => {
      // [issue #346] sign out must be a POST form, never a GET link
      configureHooks(true);
      const tree = JSON.stringify(renderMenu());
      // The form action is /auth/sign-out and it must not appear as a plain anchor.
      // We assert POST is present (case-insensitive) near the sign-out action.
      const lowerTree = tree.toLowerCase();
      expect(lowerTree).toContain('post');
    });
  });

  // -------------------------------------------------------------------------
  // Property 10: Pressing Escape closes the panel
  // -------------------------------------------------------------------------

  describe('Given the menu is open and Escape is pressed', () => {
    it('then a document keydown listener is registered on mount', () => {
      // [lld §T7 BDD] "closes menu on Escape key"
      // [req §Story 3.3 AC] "pressing Escape closes it"
      // documentStub.addEventListener is a vi.fn() — inspect its calls directly.
      configureHooks(true);
      MobileNavMenu({
        links: DEFAULT_LINKS,
        username: 'alice',
        currentOrg: DEFAULT_ORG,
        allOrgs: DEFAULT_ALL_ORGS,
      });
      runEffect();

      const listenerRegistered = (documentStub.addEventListener.mock.calls as Array<[string, unknown]>)
        .some(([event]) => event === 'keydown');
      expect(listenerRegistered, 'keydown listener must be registered').toBe(true);
    });

    it('then the state setter is called when Escape key is fired', () => {
      // [lld §T7 BDD] "closes menu on Escape key"
      // [req §Story 3.3 AC] pressing Escape closes the panel
      const setter = vi.fn();
      configureHooks(true, setter);

      MobileNavMenu({
        links: DEFAULT_LINKS,
        username: 'alice',
        currentOrg: DEFAULT_ORG,
        allOrgs: DEFAULT_ALL_ORGS,
      });
      runEffect();

      // Fire the Escape keydown via the document stub.
      documentStub._fire('keydown', { key: 'Escape' });
      expect(setter).toHaveBeenCalled();
    });

    it('then a non-Escape key press does NOT close the panel', () => {
      // [req §Story 3.3] only Escape triggers close — not other keys
      const setter = vi.fn();
      configureHooks(true, setter);

      MobileNavMenu({
        links: DEFAULT_LINKS,
        username: 'alice',
        currentOrg: DEFAULT_ORG,
        allOrgs: DEFAULT_ALL_ORGS,
      });
      runEffect();

      documentStub._fire('keydown', { key: 'Enter' });
      expect(setter).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Property 11: Clicking outside the panel closes it
  // -------------------------------------------------------------------------

  describe('Given the menu is open and the user clicks outside the panel', () => {
    it('then a document mousedown or click listener is registered on mount', () => {
      // [lld §T7 BDD] implicitly via "closes on click outside"
      // [req §Story 3.3 AC] "tapping outside closes it"
      configureHooks(true);
      MobileNavMenu({
        links: DEFAULT_LINKS,
        username: 'alice',
        currentOrg: DEFAULT_ORG,
        allOrgs: DEFAULT_ALL_ORGS,
      });
      runEffect();

      const outsideListenerRegistered = (
        documentStub.addEventListener.mock.calls as Array<[string, unknown]>
      ).some(([event]) => event === 'mousedown' || event === 'click');
      expect(outsideListenerRegistered, 'outside-click listener must be registered').toBe(true);
    });

    it('then the state setter is called when a click target is outside the menu ref', () => {
      // [req §Story 3.3 AC] "tapping outside closes it"
      const setter = vi.fn();
      configureHooks(true, setter);

      // menuRefStub.current is null — any click target is "outside" null.
      // The implementation will call menuRef.current?.contains(target), which
      // returns undefined/false when current is null.
      menuRefStub.current = null;

      MobileNavMenu({
        links: DEFAULT_LINKS,
        username: 'alice',
        currentOrg: DEFAULT_ORG,
        allOrgs: DEFAULT_ALL_ORGS,
      });
      runEffect();

      // Simulate click on an element outside the menu.
      const outsideTarget = { nodeType: 1 } as unknown as Node;
      documentStub._fire('mousedown', { target: outsideTarget });
      documentStub._fire('click', { target: outsideTarget });
      expect(setter).toHaveBeenCalled();
    });

    it('then the state setter is NOT called when the click target is inside the menu', () => {
      // [req §Story 3.3] Clicking inside the panel must not accidentally close it.
      // We cannot use real DOM elements in the node test environment, so we
      // use a fake element with a contains() method that always returns true.
      const setter = vi.fn();
      configureHooks(true, setter);

      // Fake "inside" element — contains() will be called with this as `this`
      // (via menuRef.current.contains(target)).
      const insideTarget = { nodeType: 1 } as unknown as Node;
      const fakeMenuElement = {
        contains: (node: Node) => node === insideTarget,
      } as unknown as Element;
      menuRefStub.current = fakeMenuElement;

      MobileNavMenu({
        links: DEFAULT_LINKS,
        username: 'alice',
        currentOrg: DEFAULT_ORG,
        allOrgs: DEFAULT_ALL_ORGS,
      });
      runEffect();

      documentStub._fire('mousedown', { target: insideTarget });
      documentStub._fire('click', { target: insideTarget });
      expect(setter).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Property 12: Clicking a nav link inside the panel closes the menu
  // -------------------------------------------------------------------------

  describe('Given the menu is open and a nav link is clicked', () => {
    it('then each nav link has an onClick handler that closes the panel', () => {
      // [lld §T7 BDD] "closes menu when a link is clicked"
      // [req §Story 3.3] clicking a link should dismiss the panel
      const setter = vi.fn();
      configureHooks(true, setter);
      const tree = renderMenu();

      // Collect all "a" nodes (from the next/link stub) that have onClick.
      const linkOnClicks: Array<() => void> = [];
      function collectLinkOnClicks(node: RenderNode): void {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          for (const child of node) collectLinkOnClicks(child);
          return;
        }
        const el = node as { type?: unknown; props?: Record<string, unknown> };
        if (el.type === 'a' && typeof el.props?.onClick === 'function') {
          linkOnClicks.push(el.props.onClick as () => void);
        }
        if (el.props) {
          for (const val of Object.values(el.props)) {
            collectLinkOnClicks(val);
          }
        }
      }
      collectLinkOnClicks(tree);

      // At least one link must have an onClick that triggers the setter.
      expect(linkOnClicks.length, 'nav links must expose onClick handlers').toBeGreaterThan(0);
      linkOnClicks[0]!();
      expect(setter).toHaveBeenCalled();
    });

    it('then every nav link in the panel has an onClick handler', () => {
      // [lld §T7 BDD] all links close the panel on click, not just the first
      const setter = vi.fn();
      configureHooks(true, setter);
      const tree = renderMenu();

      const linkOnClicks: Array<() => void> = [];
      function collectLinkOnClicks(node: RenderNode): void {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          for (const child of node) collectLinkOnClicks(child);
          return;
        }
        const el = node as { type?: unknown; props?: Record<string, unknown> };
        if (el.type === 'a' && typeof el.props?.onClick === 'function') {
          linkOnClicks.push(el.props.onClick as () => void);
        }
        if (el.props) {
          for (const val of Object.values(el.props)) {
            collectLinkOnClicks(val);
          }
        }
      }
      collectLinkOnClicks(tree);

      // There are 2 links in DEFAULT_LINKS — each must have onClick.
      expect(linkOnClicks.length).toBeGreaterThanOrEqual(DEFAULT_LINKS.length);
      for (const onClick of linkOnClicks) {
        setter.mockClear();
        onClick();
        expect(setter).toHaveBeenCalled();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Property: effect registers listeners on mount and removes them on cleanup
  // -------------------------------------------------------------------------

  describe('Given the component mounts', () => {
    it('then the effect returns a cleanup function that removes document listeners', () => {
      // [req §Story 3.3] listeners must not leak after unmount.
      // documentStub.removeEventListener is a vi.fn() defined in makeDocumentStub().
      configureHooks(true);

      MobileNavMenu({
        links: DEFAULT_LINKS,
        username: 'alice',
        currentOrg: DEFAULT_ORG,
        allOrgs: DEFAULT_ALL_ORGS,
      });

      // Run the effect — it should return a cleanup function.
      const cleanup = capturedEffects[0]?.() as (() => void) | undefined;
      if (cleanup && typeof cleanup === 'function') {
        cleanup();
        expect(documentStub.removeEventListener).toHaveBeenCalled();
      } else {
        // If no cleanup was returned, the test must fail with a clear message.
        throw new Error(
          'Effect must return a cleanup function that removes document listeners'
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // Property: X icon shown when panel is open
  // -------------------------------------------------------------------------

  describe('Given the menu is open', () => {
    it('then the X (close) icon is rendered instead of Menu (hamburger)', () => {
      // [lld §T7] "Hamburger icon (Menu from lucide-react); panel may use X icon for close"
      configureHooks(true);
      const tree = JSON.stringify(renderMenu());
      // X icon should appear when open; or at minimum Menu icon must not be
      // the only indicator (the aria-label should change, see next test).
      // We verify the X icon is present when isOpen is true.
      expect(tree).toContain('icon-x');
    });
  });
});
