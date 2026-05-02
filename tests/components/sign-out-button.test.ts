// Tests for SignOutButton component.
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md § B.1
// Requirements reference: docs/requirements/v11-requirements.md § Story 4.6
// Issue: #432

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports per vitest hoisting rules
// ---------------------------------------------------------------------------

// Spy on clearLastVisitedProject so we can assert it is called on submit.
const { clearLastVisitedProjectSpy } = vi.hoisted(() => ({
  clearLastVisitedProjectSpy: vi.fn(),
}));

vi.mock('@/lib/last-visited-project', () => ({
  clearLastVisitedProject: clearLastVisitedProjectSpy,
  setLastVisitedProject: vi.fn(),
  getLastVisitedProject: vi.fn(),
  LAST_VISITED_PROJECT_KEY: 'lastVisitedProjectId',
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { SignOutButton } from '@/components/sign-out-button';

// ---------------------------------------------------------------------------
// Helpers — recursive component tree expander
// Mirrors the renderTree pattern from tests/components/mobile-nav-menu.test.ts.
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

// Walk a rendered tree recursively to find a node matching a predicate.
function findNode(
  node: RenderNode,
  predicate: (el: { type?: unknown; props?: Record<string, unknown> }) => boolean,
): { type?: unknown; props?: Record<string, unknown> } | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
    return undefined;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (predicate(el)) return el;
  if (el.props) {
    for (const val of Object.values(el.props)) {
      const found = findNode(val, predicate);
      if (found) return found;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SignOutButton', () => {

  // -------------------------------------------------------------------------
  // Property 1: Renders a <form> element
  // -------------------------------------------------------------------------

  describe('Given the component is rendered', () => {
    it('then it contains a form element', () => {
      // [lld §B.1] "return <form method="POST" action="/auth/sign-out">"
      const html = JSON.stringify(renderTree(SignOutButton()));
      expect(html).toContain('"form"');
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: Form method is "POST"
  // -------------------------------------------------------------------------

  describe('Given the component is rendered', () => {
    it('then the form method is "POST"', () => {
      // [lld §B.1] form method="POST"
      // [req §Story 4.6 AC2] sign-out must POST to clear the session server-side
      const html = JSON.stringify(renderTree(SignOutButton()));
      expect(html).toContain('POST');
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: Form action is "/auth/sign-out"
  // -------------------------------------------------------------------------

  describe('Given the component is rendered', () => {
    it('then the form action is "/auth/sign-out"', () => {
      // [lld §B.1] action="/auth/sign-out"
      const html = JSON.stringify(renderTree(SignOutButton()));
      expect(html).toContain('/auth/sign-out');
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: Form has an onSubmit handler
  // -------------------------------------------------------------------------

  describe('Given the component is rendered', () => {
    it('then the form node exposes an onSubmit handler', () => {
      // [lld §B.1] onSubmit={() => clearLastVisitedProject()}
      const tree = renderTree(SignOutButton());
      const formNode = findNode(tree, (el) => el.type === 'form');
      expect(formNode, 'form node must exist in the tree').toBeDefined();
      expect(typeof formNode?.props?.onSubmit).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: Submitting the form calls clearLastVisitedProject()
  // -------------------------------------------------------------------------

  describe('Given the form is submitted', () => {
    it('then clearLastVisitedProject is called', () => {
      // [req §Story 4.6 AC2] "sign-out clears lastVisitedProjectId from localStorage"
      // [lld §B.1] onSubmit={() => clearLastVisitedProject()}
      // [lld §A.4 / I7] sign-out clears the stored value
      clearLastVisitedProjectSpy.mockClear();
      const tree = renderTree(SignOutButton());
      const formNode = findNode(tree, (el) => el.type === 'form');
      const onSubmit = formNode?.props?.onSubmit as (() => void) | undefined;
      expect(onSubmit, 'onSubmit must be a function').toBeDefined();
      onSubmit!();
      expect(clearLastVisitedProjectSpy).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: Renders a <button type="submit"> with text "Sign out"
  // -------------------------------------------------------------------------

  describe('Given the component is rendered', () => {
    it('then it contains a submit button', () => {
      // [lld §B.1] "<button type="submit" ...>"
      const html = JSON.stringify(renderTree(SignOutButton()));
      expect(html).toContain('"button"');
      expect(html).toContain('submit');
    });

    it('then the submit button text is "Sign out"', () => {
      // [lld §B.1] button label "Sign out"
      const html = JSON.stringify(renderTree(SignOutButton()));
      expect(html).toContain('Sign out');
    });
  });

  // -------------------------------------------------------------------------
  // Property 7: Button uses the expected CSS class tokens
  // -------------------------------------------------------------------------

  describe('Given the component is rendered', () => {
    it('then the button carries the "text-label" class token', () => {
      // [lld §B.1] className="text-label text-text-secondary hover:text-accent"
      // Style guard mirrors the nav-bar.test.ts assertion pattern.
      const html = JSON.stringify(renderTree(SignOutButton()));
      expect(html).toContain('text-label');
    });

    it('then the button carries the "text-text-secondary" class token', () => {
      // [lld §B.1] className="text-label text-text-secondary hover:text-accent"
      const html = JSON.stringify(renderTree(SignOutButton()));
      expect(html).toContain('text-text-secondary');
    });

    it('then the button carries the "hover:text-accent" class token', () => {
      // [lld §B.1] className="text-label text-text-secondary hover:text-accent"
      const html = JSON.stringify(renderTree(SignOutButton()));
      expect(html).toContain('hover:text-accent');
    });
  });

  // -------------------------------------------------------------------------
  // Regression: clearLastVisitedProject is NOT called on render, only on submit
  // -------------------------------------------------------------------------

  describe('Given the component is merely rendered (not submitted)', () => {
    it('then clearLastVisitedProject is not called at render time', () => {
      // [issue #432] clearLastVisitedProject must fire on sign-out, not on mount
      clearLastVisitedProjectSpy.mockClear();
      renderTree(SignOutButton());
      expect(clearLastVisitedProjectSpy).not.toHaveBeenCalled();
    });
  });
});
