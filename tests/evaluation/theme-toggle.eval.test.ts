// Adversarial evaluation tests for issue #343 — theme toggle + persistence.
// Requirements: docs/requirements/v7-requirements.md § Story 2.2
// LLD: docs/design/lld-v7-frontend-ux.md § T4
//
// Coverage audit found two genuine gaps in the test-author's 18+3 tests:
//
// GAP-1 (AC-11): No test asserts that <ThemeToggle /> is present inside NavBar.
//   nav-bar.test.ts serialises the output but never checks for the toggle node.
//   The spec says "a theme toggle button (sun/moon icon) is visible" in the NavBar.
//
// GAP-2 (AC-12): No test verifies the init script rejects invalid localStorage
//   values before setting data-theme. The implementation guards with
//   `s==='light'||s==='dark'?s:(matchMedia...)`, but the layout test only
//   confirms the string 'fcs-theme' exists in the script, not the validation.
//
// GAP-3 (AC-6): The LLD explicitly notes the script is wrapped in try/catch so a
//   SecurityError from a restricted-storage context does not crash the page.
//   The layout test does not assert the presence of try/catch.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Source file reader — used for static assertions on the init script content
// ---------------------------------------------------------------------------

const root = resolve(__dirname, '../../src');

function src(relPath: string): string {
  return readFileSync(resolve(root, relPath), 'utf8');
}

// ---------------------------------------------------------------------------
// Module mocks — declared before imports per vitest hoisting rules
// ---------------------------------------------------------------------------

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => ({
    type: 'a',
    props: { href, children, className },
  }),
}));

vi.mock('@/components/org-switcher', () => ({
  OrgSwitcher: () => null,
}));

// NavLinks is a client component — stub it to avoid usePathname in node env.
vi.mock('@/components/nav-links', () => ({
  NavLinks: () => null,
}));

// ThemeToggle is the subject of AC-11: we do NOT mock it here so the real
// function reference appears in the rendered tree. This is intentional — the
// test inspects the JSX tree shape, not the expanded DOM output, which is
// the same approach used in nav-bar.test.ts.
// (ThemeToggle returns JSX; useState/useEffect are not called during SSR-style
//  direct invocation without a renderer, so no hook environment is needed.)
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  const useState = vi.fn(() => ['dark', vi.fn()]);
  const useEffect = vi.fn();
  return { ...actual, useState, useEffect };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { NavBar } from '@/components/nav-bar';
import type { Database } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Factories — reuse the same shape as nav-bar.test.ts
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

function renderNavBar(overrides: Partial<Parameters<typeof NavBar>[0]> = {}) {
  return NavBar({
    username: 'alice',
    isAdmin: false,
    currentOrg: makeOrg(),
    allOrgs: [],
    ...overrides,
  });
}

// Recursively walk a JSX tree and collect all nested children into a flat list.
// We need this because NavBar returns a tree where ThemeToggle is a nested
// function reference inside the `ml-auto` flex container.
function flattenTree(node: unknown): unknown[] {
  if (node == null || typeof node !== 'object') return [node];
  const el = node as { type?: unknown; props?: { children?: unknown } };
  const result: unknown[] = [el];
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) result.push(...flattenTree(child));
  } else if (children != null) {
    result.push(...flattenTree(children));
  }
  return result;
}

// ---------------------------------------------------------------------------
// GAP-1: ThemeToggle is rendered inside NavBar
// AC-11 [req §Story 2.2]: "a theme toggle button (sun/moon icon) is visible" in NavBar
// ---------------------------------------------------------------------------

describe('NavBar — ThemeToggle integration (AC-11)', () => {
  describe('Given NavBar is rendered for any user', () => {
    it('then the ThemeToggle function component is present in the rendered tree', () => {
      // The ThemeToggle is a React function component. When NavBar() is called
      // directly (without a renderer), its JSX tree contains ThemeToggle as a
      // `{ type: ThemeToggle, props: {} }` node — the function is not yet
      // invoked. We confirm the node exists by name to ensure NavBar includes
      // the toggle at all.
      const tree = renderNavBar();
      const nodes = flattenTree(tree);
      const hasThemeToggle = nodes.some(
        (n) =>
          n != null &&
          typeof n === 'object' &&
          typeof (n as { type?: unknown }).type === 'function' &&
          ((n as { type?: { name?: string } }).type?.name === 'ThemeToggle' ||
            // Also match the display name if minified
            String((n as { type?: unknown }).type).includes('ThemeToggle'))
      );
      expect(hasThemeToggle).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// GAP-2: Init script rejects invalid localStorage values  (AC-12)
// "Avoid flash of wrong theme" implies only 'light'|'dark' are accepted.
// The script must not set data-theme to an arbitrary string.
// ---------------------------------------------------------------------------

describe('Root layout init script — invalid localStorage guard (AC-12)', () => {
  describe('Given the inline theme init script', () => {
    it('then it validates the stored value is "light" or "dark" before applying it', () => {
      // Static check: the script must contain an equality check against both
      // 'light' and 'dark' before applying the value to data-theme.
      const layoutSrc = src('app/layout.tsx');
      // Extract the themeInitScript value from the source
      const scriptMatch = layoutSrc.match(/const themeInitScript\s*=\s*`([^`]+)`/);
      expect(scriptMatch, 'themeInitScript constant not found in layout.tsx').toBeTruthy();
      const script = scriptMatch![1];
      // The script must guard with both string checks
      expect(script).toContain("==='light'");
      expect(script).toContain("==='dark'");
    });

    it('then an invalid stored value falls back to prefers-color-scheme (not applied raw)', () => {
      // Verify the ternary structure: condition ? stored : matchMedia(...)
      // The condition must gate the use of the stored value.
      const layoutSrc = src('app/layout.tsx');
      const scriptMatch = layoutSrc.match(/const themeInitScript\s*=\s*`([^`]+)`/);
      const script = scriptMatch![1];
      // The fallback path must include matchMedia — confirming that when the stored
      // value is not 'light'|'dark', the result is derived from the media query.
      const guardIndex = script.indexOf("==='light'");
      const matchMediaIndex = script.indexOf('matchMedia');
      expect(guardIndex).toBeGreaterThan(-1);
      expect(matchMediaIndex).toBeGreaterThan(-1);
      // The matchMedia call must appear AFTER the guard (in the else branch)
      expect(matchMediaIndex).toBeGreaterThan(guardIndex);
    });
  });
});

// ---------------------------------------------------------------------------
// GAP-3: Init script is wrapped in try/catch  (AC-6)
// LLD § T4 explicitly notes this prevents a SecurityError from crashing the page.
// ---------------------------------------------------------------------------

describe('Root layout init script — try/catch guard (AC-6)', () => {
  describe('Given the inline theme init script', () => {
    it('then it is wrapped in a try/catch block so localStorage errors do not crash the page', () => {
      const layoutSrc = src('app/layout.tsx');
      const scriptMatch = layoutSrc.match(/const themeInitScript\s*=\s*`([^`]+)`/);
      expect(scriptMatch, 'themeInitScript constant not found in layout.tsx').toBeTruthy();
      const script = scriptMatch![1];
      expect(script).toContain('try{');
      expect(script).toContain('catch');
    });
  });
});
