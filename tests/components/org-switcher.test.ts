// Tests for OrgSwitcher and OrgPickerDropdown components.
// Design reference: docs/design/lld-v9-org-switcher.md
// Requirements reference: docs/requirements/v9-requirements.md § Epic 1 Stories 1.1–1.3
// Issue: #372

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

// Stub lucide-react ChevronDown icon so tests can detect its presence without
// importing the full SVG implementation.
vi.mock('lucide-react', () => ({
  ChevronDown: ({ size }: { size?: number }) => ({
    type: 'svg',
    props: { 'data-testid': 'icon-chevron-down', size },
  }),
}));

// Stub useDismissEffect — the component wires it up; tests verify it is called.
const { useDismissEffectSpy } = vi.hoisted(() => ({
  useDismissEffectSpy: vi.fn(),
}));

vi.mock('@/hooks/use-dismiss-effect', () => ({
  useDismissEffect: useDismissEffectSpy,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { OrgSwitcher, OrgPickerDropdown } from '@/components/org-switcher';
import type { Database } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

type OrgRow = Database['public']['Tables']['organisations']['Row'];

function makeOrg(overrides: Partial<OrgRow> = {}): OrgRow {
  return {
    id: 'org-001',
    github_org_name: 'acme',
    github_org_id: 1001,
    installation_id: 9001,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const CURRENT_ORG = makeOrg({ id: 'org-001', github_org_name: 'acme' });
const OTHER_ORG = makeOrg({ id: 'org-002', github_org_name: 'globex', github_org_id: 1002 });

// ---------------------------------------------------------------------------
// Helpers — recursive component tree expander
// Mirrors the established pattern from mobile-nav-menu.test.ts verbatim.
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
      ? newProps.children.map(renderTree)
      : renderTree(newProps.children as RenderNode);
  }
  return { ...el, props: newProps };
}

// ---------------------------------------------------------------------------
// Helpers — hook configuration
// ---------------------------------------------------------------------------

// Captured effect callbacks — the component may register multiple effects.
let capturedEffects: Array<() => void | (() => void)> = [];

// Stubs for the two refs the component creates (triggerRef, containerRef).
// useRef is called twice in the multi-org path; we configure them with
// mockReturnValueOnce in the order the component calls useRef.
let triggerRefStub: { current: { focus: ReturnType<typeof vi.fn> } | null };
let containerRefStub: { current: Element | null };

type StateSetter = (value: boolean | ((prev: boolean) => boolean)) => void;

/**
 * Configure hooks for one render call of OrgSwitcher (multi-org path).
 *
 * Call order expected by the component:
 *   1. useState(false)         → [isOpen, setter]
 *   2. useRef(null)            → triggerRef
 *   3. useRef(null)            → containerRef
 *
 * @param isOpen   — initial value of the open state
 * @param setter   — optional spy for the state setter
 */
function configureHooks(
  isOpen = false,
  setter: StateSetter = vi.fn(),
): StateSetter {
  triggerRefStub = { current: { focus: vi.fn() } };
  containerRefStub = { current: null };

  useStateSpy.mockReturnValueOnce([isOpen, setter]);
  useRefSpy.mockReturnValueOnce(triggerRefStub);   // triggerRef — first useRef call
  useRefSpy.mockReturnValueOnce(containerRefStub); // containerRef — second useRef call
  useEffectSpy.mockImplementation(
    (fn: () => void | (() => void), _deps?: unknown[]) => {
      capturedEffects.push(fn);
    },
  );

  return setter;
}

// ---------------------------------------------------------------------------
// Helpers — document stub for listener-based tests
// (Mirrors the makeDocumentStub pattern from mobile-nav-menu.test.ts.)
// ---------------------------------------------------------------------------

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
    _listeners: listeners,
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
// Tree-walking helpers (shared across suites)
// ---------------------------------------------------------------------------

/** Recursively walk a rendered tree and collect all nodes matching a predicate. */
function collectNodes(
  node: RenderNode,
  predicate: (el: { type?: unknown; props?: Record<string, unknown> }) => boolean,
): Array<{ type?: unknown; props?: Record<string, unknown> }> {
  const found: Array<{ type?: unknown; props?: Record<string, unknown> }> = [];
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const child of node) found.push(...collectNodes(child, predicate));
    return found;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (predicate(el)) found.push(el);
  if (el.props) {
    for (const val of Object.values(el.props)) {
      found.push(...collectNodes(val, predicate));
    }
  }
  return found;
}

function findFirst(
  node: RenderNode,
  predicate: (el: { type?: unknown; props?: Record<string, unknown> }) => boolean,
): { type?: unknown; props?: Record<string, unknown> } | undefined {
  const results = collectNodes(node, predicate);
  return results[0];
}

// ---------------------------------------------------------------------------
// Test-local globals
// ---------------------------------------------------------------------------

let documentStub: ReturnType<typeof makeDocumentStub>;

beforeEach(() => {
  capturedEffects = [];
  triggerRefStub = { current: { focus: vi.fn() } };
  containerRefStub = { current: null };
  documentStub = makeDocumentStub();

  // Default safe no-op hook implementations so tests that don't call
  // configureHooks() explicitly do not throw from unmocked calls.
  useStateSpy.mockReturnValue([false, vi.fn()]);
  useRefSpy.mockReturnValue({ current: null });
  useEffectSpy.mockImplementation(
    (fn: () => void | (() => void), _deps?: unknown[]) => {
      capturedEffects.push(fn);
    },
  );

  vi.stubGlobal('document', documentStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// OrgSwitcher — single-org user (Story 1.1, I1, AC1)
// ---------------------------------------------------------------------------

describe('OrgSwitcher — single org', () => {
  const singleOrg = CURRENT_ORG;
  const allOrgs = [singleOrg];

  it('renders the org name as plain text (span element)', () => {
    // [req §Story 1.1 AC] "nav bar shows the org name as plain text"
    // [lld §I1] "renders only <span>"
    // Single-org does not need open/closed state; hooks not wired.
    useStateSpy.mockReturnValue([false, vi.fn()]);
    const tree = JSON.stringify(
      renderTree(OrgSwitcher({ currentOrg: singleOrg, allOrgs })),
    );
    expect(tree).toContain('span');
    expect(tree).toContain('acme');
  });

  it('renders no trigger button', () => {
    // [req §Story 1.1 AC] "no interactive switcher controls"
    // [lld §I1] "no trigger"
    useStateSpy.mockReturnValue([false, vi.fn()]);
    const tree = JSON.stringify(
      renderTree(OrgSwitcher({ currentOrg: singleOrg, allOrgs })),
    );
    expect(tree).not.toContain('"button"');
  });

  it('renders no org list (ul/li)', () => {
    // [req §Story 1.1 AC] "no interactive switcher controls"
    // [lld §I1] "no dropdown"
    useStateSpy.mockReturnValue([false, vi.fn()]);
    const tree = JSON.stringify(
      renderTree(OrgSwitcher({ currentOrg: singleOrg, allOrgs })),
    );
    expect(tree).not.toContain('"ul"');
    expect(tree).not.toContain('"li"');
  });

  it('renders no chevron icon', () => {
    // [req §Story 1.1 AC] "no trigger button, chevron, or dropdown is rendered"
    // [lld §I1]
    useStateSpy.mockReturnValue([false, vi.fn()]);
    const tree = JSON.stringify(
      renderTree(OrgSwitcher({ currentOrg: singleOrg, allOrgs })),
    );
    expect(tree).not.toContain('icon-chevron-down');
  });
});

// ---------------------------------------------------------------------------
// OrgSwitcher — multi-org passive state (Story 1.2, I2, AC2, AC3, I6)
// ---------------------------------------------------------------------------

describe('OrgSwitcher — multi org, passive state', () => {
  const allOrgs = [CURRENT_ORG, OTHER_ORG];

  it('renders the current org name', () => {
    // [req §Story 1.2 AC] "nav bar shows the current org name"
    // [lld §AC2]
    configureHooks(false);
    const tree = JSON.stringify(
      renderTree(OrgSwitcher({ currentOrg: CURRENT_ORG, allOrgs })),
    );
    expect(tree).toContain('acme');
  });

  it('renders a trigger button element', () => {
    // [req §Story 1.2 AC] "a trigger button (e.g. chevron-down icon) adjacent to it"
    // [lld §AC2, AC3]
    configureHooks(false);
    const tree = JSON.stringify(
      renderTree(OrgSwitcher({ currentOrg: CURRENT_ORG, allOrgs })),
    );
    expect(tree).toContain('"button"');
  });

  it('trigger button has aria-label "Switch organisation"', () => {
    // [req §Story 1.2] "trigger button must have aria-label=\"Switch organisation\""
    // [lld §I6, AC3]
    configureHooks(false);
    const tree = JSON.stringify(
      renderTree(OrgSwitcher({ currentOrg: CURRENT_ORG, allOrgs })),
    );
    expect(tree).toContain('Switch organisation');
    expect(tree).toContain('aria-label');
  });

  it('does not render the org list on initial render (picker is closed)', () => {
    // [req §Story 1.2 AC] "no org list is visible — only the current org name and trigger"
    // [lld §I2] "Picker is always closed on initial render"
    configureHooks(false);
    const tree = JSON.stringify(
      renderTree(OrgSwitcher({ currentOrg: CURRENT_ORG, allOrgs })),
    );
    expect(tree).not.toContain('"ul"');
  });

  it('trigger button carries focus-visible ring class for keyboard accessibility', () => {
    // [req §Story 1.2 AC] "trigger button is focused via keyboard → receives focus ring"
    // [lld §AC3]
    configureHooks(false);
    const expanded = renderTree(OrgSwitcher({ currentOrg: CURRENT_ORG, allOrgs }));
    const button = findFirst(expanded, (el) => el.type === 'button');
    expect(button).toBeDefined();
    const className = String(button?.props?.className ?? '');
    expect(className).toContain('focus-visible');
  });

  it('renders the chevron icon inside the trigger button', () => {
    // [req §Story 1.2] "chevron-down icon" adjacent to name
    // [lld §AC2]
    configureHooks(false);
    const tree = JSON.stringify(
      renderTree(OrgSwitcher({ currentOrg: CURRENT_ORG, allOrgs })),
    );
    expect(tree).toContain('icon-chevron-down');
  });
});

// ---------------------------------------------------------------------------
// OrgSwitcher — multi-org, picker open via trigger click (Story 1.3, AC4)
// ---------------------------------------------------------------------------

describe('OrgSwitcher — multi org, picker open', () => {
  const allOrgs = [CURRENT_ORG, OTHER_ORG];

  it('clicking the trigger button calls the state setter to open picker', () => {
    // [req §Story 1.3 AC] "trigger button is clicked → inline dropdown opens"
    // [lld §AC4, Flow 1]
    const setter = vi.fn();
    configureHooks(false, setter);
    const expanded = renderTree(OrgSwitcher({ currentOrg: CURRENT_ORG, allOrgs }));
    const button = findFirst(expanded, (el) => el.type === 'button');
    expect(button, 'trigger button must be present').toBeDefined();
    const onClick = button?.props?.onClick as (() => void) | undefined;
    expect(onClick, 'trigger button must have onClick').toBeDefined();
    onClick!();
    expect(setter).toHaveBeenCalled();
  });

  it('org list is rendered when isOpen is true', () => {
    // [req §Story 1.3 AC] "inline dropdown opens listing all orgs"
    // [lld §AC4]
    configureHooks(true);
    const tree = JSON.stringify(
      renderTree(OrgSwitcher({ currentOrg: CURRENT_ORG, allOrgs })),
    );
    expect(tree).toContain('"ul"');
  });

  it('wires useDismissEffect with containerRef and setter for outside-click/Escape', () => {
    // [req §Story 1.3 AC] "picker closes on click outside" / Escape
    // [lld §AC7, AC8, I4]
    configureHooks(true);
    OrgSwitcher({ currentOrg: CURRENT_ORG, allOrgs });
    expect(useDismissEffectSpy).toHaveBeenCalledWith(
      containerRefStub,
      expect.any(Function),
    );
  });
});

// ---------------------------------------------------------------------------
// OrgSwitcher — Escape key returns focus to trigger (I3, AC8)
// ---------------------------------------------------------------------------

describe('OrgSwitcher — Escape key behaviour', () => {
  const allOrgs = [CURRENT_ORG, OTHER_ORG];

  it('pressing Escape calls triggerRef.current.focus() before closing picker', () => {
    // [lld §I3] "Escape returns focus to the trigger button"
    // [req §Story 1.3 AC] "focus returns to the trigger button"
    // The implementation attaches an onKeyDown handler on the container div.
    const setter = vi.fn();
    configureHooks(true, setter);
    const expanded = renderTree(OrgSwitcher({ currentOrg: CURRENT_ORG, allOrgs }));

    // Find the container div (the outermost div with ref) via onKeyDown prop.
    const container = findFirst(
      expanded,
      (el) => el.type === 'div' && typeof el.props?.onKeyDown === 'function',
    );
    expect(container, 'container div must expose onKeyDown').toBeDefined();

    const onKeyDown = container!.props!.onKeyDown as (e: { key: string; stopPropagation: () => void }) => void;
    onKeyDown({ key: 'Escape', stopPropagation: vi.fn() });

    // focus() must be called first, then the setter.
    expect(triggerRefStub.current?.focus).toHaveBeenCalled();
    expect(setter).toHaveBeenCalledWith(false);
  });

  it('pressing a non-Escape key does not close the picker', () => {
    // [req §Story 1.3] Escape is the only key that triggers dismiss via onKeyDown
    const setter = vi.fn();
    configureHooks(true, setter);
    const expanded = renderTree(OrgSwitcher({ currentOrg: CURRENT_ORG, allOrgs }));

    const container = findFirst(
      expanded,
      (el) => el.type === 'div' && typeof el.props?.onKeyDown === 'function',
    );
    if (!container) return; // no handler → test trivially passes

    const onKeyDown = container.props!.onKeyDown as (e: { key: string }) => void;
    onKeyDown({ key: 'Tab' });
    expect(setter).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// OrgPickerDropdown — aria-current on current org (I7, AC5)
// ---------------------------------------------------------------------------

describe('OrgPickerDropdown — aria-current marking', () => {
  const allOrgs = [CURRENT_ORG, OTHER_ORG];
  const onClose = vi.fn();

  it('current org item has aria-current="true"', () => {
    // [req §Story 1.3 AC] "current org item has aria-current=\"true\""
    // [lld §I7, AC5]
    const tree = JSON.stringify(
      renderTree(OrgPickerDropdown({ allOrgs, currentOrg: CURRENT_ORG, onClose })),
    );
    expect(tree).toContain('aria-current');
    expect(tree).toContain('"true"');
  });

  it('non-current org items do NOT have aria-current="true"', () => {
    // [lld §I7] only the current org receives this attribute
    const expanded = renderTree(
      OrgPickerDropdown({ allOrgs, currentOrg: CURRENT_ORG, onClose }),
    );
    // Collect all li nodes and check which ones carry aria-current.
    const liNodes = collectNodes(expanded, (el) => el.type === 'li');
    const currentLiNodes = liNodes.filter(
      (li) => li.props?.['aria-current'] === 'true',
    );
    // Exactly one li should have aria-current="true".
    expect(currentLiNodes).toHaveLength(1);
    // That li's key should correspond to CURRENT_ORG.
    // We can verify by checking the child text content contains the current org name.
    const currentLiText = JSON.stringify(currentLiNodes[0]);
    expect(currentLiText).toContain('acme');
    expect(currentLiText).not.toContain('globex');
  });
});

// ---------------------------------------------------------------------------
// OrgPickerDropdown — navigation hrefs (AC6, I5)
// ---------------------------------------------------------------------------

describe('OrgPickerDropdown — navigation links', () => {
  const allOrgs = [CURRENT_ORG, OTHER_ORG];
  const onClose = vi.fn();

  it('non-current org is rendered as an anchor with correct /api/org-select href', () => {
    // [req §Story 1.3 AC] "browser navigates to /api/org-select?orgId=<id>"
    // [lld §AC6]
    const tree = JSON.stringify(
      renderTree(OrgPickerDropdown({ allOrgs, currentOrg: CURRENT_ORG, onClose })),
    );
    expect(tree).toContain('/api/org-select?orgId=org-002');
  });

  it('current org is NOT rendered as a navigation anchor (no org-select href for it)', () => {
    // [lld §I5] "Clicking the current org closes picker but does not navigate"
    // [lld §AC9]
    const tree = JSON.stringify(
      renderTree(OrgPickerDropdown({ allOrgs, currentOrg: CURRENT_ORG, onClose })),
    );
    expect(tree).not.toContain('/api/org-select?orgId=org-001');
  });

  it('each non-current org href encodes the correct org id', () => {
    // [req §Story 1.3 AC] href contains the org id from the org row
    // [lld §AC6]
    const thirdOrg = makeOrg({ id: 'org-003', github_org_name: 'initech', github_org_id: 1003 });
    const tree = JSON.stringify(
      renderTree(
        OrgPickerDropdown({
          allOrgs: [CURRENT_ORG, OTHER_ORG, thirdOrg],
          currentOrg: CURRENT_ORG,
          onClose,
        }),
      ),
    );
    expect(tree).toContain('/api/org-select?orgId=org-002');
    expect(tree).toContain('/api/org-select?orgId=org-003');
  });
});

// ---------------------------------------------------------------------------
// OrgPickerDropdown — onClose behaviour for current org click (I5, AC9)
// ---------------------------------------------------------------------------

describe('OrgPickerDropdown — clicking current org closes picker without navigation', () => {
  const allOrgs = [CURRENT_ORG, OTHER_ORG];

  it('clicking the current org calls onClose', () => {
    // [req §Story 1.3 AC] "picker closes and no org switch occurs"
    // [lld §I5, AC9]
    const onClose = vi.fn();
    const expanded = renderTree(
      OrgPickerDropdown({ allOrgs, currentOrg: CURRENT_ORG, onClose }),
    );

    // The current org renders as a button (not an anchor) — find it in the tree
    // as a button element whose text content includes the current org name.
    const buttons = collectNodes(expanded, (el) => el.type === 'button');
    const currentOrgButton = buttons.find((btn) =>
      JSON.stringify(btn).includes('acme'),
    );
    expect(currentOrgButton, 'current org must render as a button').toBeDefined();

    const onClick = currentOrgButton!.props?.onClick as (() => void) | undefined;
    expect(onClick, 'current org button must have onClick').toBeDefined();
    onClick!();
    expect(onClose).toHaveBeenCalled();
  });

  it('Enter keypress on current org item fires the same action as click (calls onClose)', () => {
    // [req §Story 1.3 AC] "user tabs through the org list and presses Enter → same action as click"
    // [lld §AC10]
    const onClose = vi.fn();
    const expanded = renderTree(
      OrgPickerDropdown({ allOrgs, currentOrg: CURRENT_ORG, onClose }),
    );

    // A button element responds to Enter via browser default — its onClick fires on Enter.
    // We verify the button has an onClick (same contract as a click test).
    // The browser bridges Enter → onClick on <button>; we assert the handler is present.
    const buttons = collectNodes(expanded, (el) => el.type === 'button');
    const currentOrgButton = buttons.find((btn) =>
      JSON.stringify(btn).includes('acme'),
    );
    expect(currentOrgButton).toBeDefined();
    // Simulate Enter by invoking onClick (same action).
    const onClick = currentOrgButton!.props?.onClick as (() => void) | undefined;
    onClick!();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// OrgPickerDropdown — Enter on different org fires navigation (AC10)
// ---------------------------------------------------------------------------

describe('OrgPickerDropdown — Enter keypress on different org', () => {
  it('non-current org anchor is keyboard-activatable (href present for Enter to follow)', () => {
    // [req §Story 1.3 AC] "presses Enter on an org → same action fires as a click"
    // [lld §AC10] — native <a> elements follow href on Enter; assert href is present
    const onClose = vi.fn();
    const expanded = renderTree(
      OrgPickerDropdown({
        allOrgs: [CURRENT_ORG, OTHER_ORG],
        currentOrg: CURRENT_ORG,
        onClose,
      }),
    );

    const anchors = collectNodes(expanded, (el) => el.type === 'a');
    const otherOrgAnchor = anchors.find((a) =>
      String(a.props?.href ?? '').includes('org-002'),
    );
    expect(otherOrgAnchor, 'non-current org must render as anchor').toBeDefined();
    // Anchor must have href so native Enter keypress triggers navigation.
    expect(otherOrgAnchor!.props?.href).toContain('/api/org-select?orgId=org-002');
  });
});

// ---------------------------------------------------------------------------
// OrgPickerDropdown — all orgs are listed (AC4)
// ---------------------------------------------------------------------------

describe('OrgPickerDropdown — org list completeness', () => {
  it('renders all org names in the dropdown list', () => {
    // [req §Story 1.3 AC] "dropdown opens listing all orgs the user belongs to"
    // [lld §AC4]
    const onClose = vi.fn();
    const thirdOrg = makeOrg({ id: 'org-003', github_org_name: 'initech', github_org_id: 1003 });
    const tree = JSON.stringify(
      renderTree(
        OrgPickerDropdown({
          allOrgs: [CURRENT_ORG, OTHER_ORG, thirdOrg],
          currentOrg: CURRENT_ORG,
          onClose,
        }),
      ),
    );
    expect(tree).toContain('acme');
    expect(tree).toContain('globex');
    expect(tree).toContain('initech');
  });
});

// ---------------------------------------------------------------------------
// OrgPickerDropdown — AC5 visual differentiation (adversarial: gap in test-author coverage)
// AC5 requires aria-current="true" AND visual differentiation (accent colour, bold weight).
// The test-author covered aria-current but not the CSS classes.
// ---------------------------------------------------------------------------

describe('OrgPickerDropdown — AC5 visual differentiation of current org', () => {
  const allOrgs = [CURRENT_ORG, OTHER_ORG];
  const onClose = vi.fn();

  it('current org button carries accent and font-medium classes; other org anchor does not', () => {
    // [req §Story 1.3 AC5] "visually differentiated (e.g. accent colour, bold weight)"
    // [lld §AC5] design tokens: current org text-accent font-medium; other text-text-primary
    const expanded = renderTree(
      OrgPickerDropdown({ allOrgs, currentOrg: CURRENT_ORG, onClose }),
    );

    // Current org is rendered as a button — verify its className carries the required tokens.
    const buttons = collectNodes(expanded, (el) => el.type === 'button');
    const currentOrgButton = buttons.find((btn) => JSON.stringify(btn).includes('acme'));
    expect(currentOrgButton, 'current org must render as a button').toBeDefined();
    const currentClass = String(currentOrgButton!.props?.className ?? '');
    expect(currentClass).toContain('text-accent');
    expect(currentClass).toContain('font-medium');

    // Other org is rendered as an anchor — its className must NOT carry accent/bold.
    const anchors = collectNodes(expanded, (el) => el.type === 'a');
    const otherOrgAnchor = anchors.find((a) => String(a.props?.href ?? '').includes('org-002'));
    expect(otherOrgAnchor, 'other org must render as an anchor').toBeDefined();
    const otherClass = String(otherOrgAnchor!.props?.className ?? '');
    expect(otherClass).not.toContain('text-accent');
    expect(otherClass).not.toContain('font-medium');
  });
});

// ---------------------------------------------------------------------------
// Regression — picker closed on initial render (I2)
// ---------------------------------------------------------------------------

describe('OrgSwitcher — regression: picker always closed on initial load', () => {
  it('initial render with multiple orgs does not render the org list (I2 regression)', () => {
    // [lld §I2] "Picker is always closed on initial render"
    // This is a regression guard: before the fix, OrgSwitcher always rendered
    // the full org list even without user interaction (#372).
    configureHooks(false);
    const tree = JSON.stringify(
      renderTree(OrgSwitcher({ currentOrg: CURRENT_ORG, allOrgs: [CURRENT_ORG, OTHER_ORG] })),
    );
    // The old persistent-list implementation would contain "globex" here.
    expect(tree).not.toContain('"ul"');
    // Other org name must not be visible in the passive state.
    expect(tree).not.toContain('globex');
  });
});
