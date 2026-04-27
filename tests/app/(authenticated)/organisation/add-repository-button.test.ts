// Tests for AddRepositoryButton client component.
// Design reference: docs/design/lld-v8-repository-management.md §T2
// Requirements:    docs/requirements/v8-requirements.md — Epic 2, Story 2.2
// Issue:           #366
//
// Testing approach (same as deleteable-assessment-table.test.ts):
//   Pattern (a) renderToStaticMarkup: observable initial-render output properties.
//   Pattern (b) readFileSync source-text: fetch wiring, state transitions and
//               router.refresh() calls that cannot be observed via static markup
//               because useState is stubbed to a noop setter in this environment.
//
// Why no @testing-library:
//   The package is not installed in this project (see package.json). The sibling
//   test files (deleteable-assessment-table.test.ts, repositories-tab.test.ts)
//   confirm the established pattern of renderToStaticMarkup + source-text.

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Module mocks — must precede component imports.
//
// AddRepositoryButton is a 'use client' component that calls useState and
// useRouter. Stub both so the component can be invoked in a node environment
// via renderToStaticMarkup.
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn((initial: unknown) => [initial, vi.fn()]),
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { AddRepositoryButton } from '@/app/(authenticated)/organisation/add-repository-button';

// ---------------------------------------------------------------------------
// Source-text fixture (pattern b)
// ---------------------------------------------------------------------------

const SRC_ROOT = resolve(
  __dirname,
  '../../../../src/app/(authenticated)/organisation',
);
const buttonSrc = readFileSync(resolve(SRC_ROOT, 'add-repository-button.tsx'), 'utf8');

// ---------------------------------------------------------------------------
// Render helper (pattern a)
// ---------------------------------------------------------------------------

function renderButton(props: {
  orgId?: string;
  githubRepoId?: number;
  githubRepoName?: string;
}): string {
  const result = AddRepositoryButton({
    orgId: props.orgId ?? 'org-uuid-001',
    githubRepoId: props.githubRepoId ?? 500,
    githubRepoName: props.githubRepoName ?? 'acme/new-service',
  });
  return renderToStaticMarkup(result as ReactElement);
}

// ---------------------------------------------------------------------------
// GROUP 1: Initial render — button element
// [lld §T2 AddRepositoryButton]
// ---------------------------------------------------------------------------

describe('AddRepositoryButton — initial render', () => {

  describe('Given default (non-loading) state', () => {
    it('then a button element is rendered', () => {
      // [lld §T2] The component must render a clickable button.
      const html = renderButton({});
      expect(html).toContain('<button');
    });

    it('then the button label is "Add" in the default state', () => {
      // [lld §T2 BDD spec] Initial label is "Add" (not "Adding…").
      // useState stub returns [initial, noop], so loading=false initially.
      const html = renderButton({});
      expect(html).toContain('Add');
    });

    it('then the button label does NOT contain "Adding" in the default state', () => {
      // Prohibition: "Adding…" only appears while the POST is in flight.
      // In the initial (non-loading) render the label must be "Add", not "Adding…".
      const html = renderButton({});
      expect(html).not.toContain('Adding');
    });

    it('then no error message is rendered in the default state', () => {
      // Prohibition: error text must not appear unless an error occurred.
      // The initial useState value for error is null; no error element must render.
      const html = renderButton({});
      // "Already registered" and "error" as meaningful content must not appear initially.
      expect(html).not.toContain('Already registered');
      expect(html).not.toContain('Network error');
    });
  });

  // -------------------------------------------------------------------------
  // Property: button is disabled while loading=true.
  // [lld §T2 AC] "button is disabled while loading"
  // Pattern (a): set useState initial to simulate loading=true state.
  // -------------------------------------------------------------------------

  describe('Given loading state is true (source-text assertions)', () => {
    it('then the button disabled attribute is wired to the loading state variable', () => {
      // [lld §T2 BDD spec] "button is disabled while loading"
      // Pattern (b): source-text assertion — disabled must be bound to loading, not hardcoded.
      expect(buttonSrc).toMatch(/disabled=\{loading\}/);
    });

    it('then the button shows "Adding…" label during loading (source-text)', () => {
      // [lld §T2 BDD spec] "shows 'Adding…' label while POST is in flight"
      // Observable via source-text: the JSX must render the loading label conditionally.
      expect(buttonSrc).toMatch(/Adding/);
    });
  });
});

// ---------------------------------------------------------------------------
// GROUP 2: Source-text assertions — fetch call wiring
// Pattern (b): state-mutation and side-effects invisible to renderToStaticMarkup.
// [lld §T2 AddRepositoryButton implementation]
// ---------------------------------------------------------------------------

describe('AddRepositoryButton — fetch wiring (source-text)', () => {

  describe('When the Add button is clicked', () => {
    it('then the source issues a POST request to the repositories API URL', () => {
      // [lld §T2] POST must go to /api/organisations/{orgId}/repositories.
      expect(buttonSrc).toMatch(/method\s*:\s*['"]POST['"]/);
      expect(buttonSrc).toMatch(/\/api\/organisations\/.*\/repositories/);
    });

    it('then the source sets the Content-Type header to application/json', () => {
      // [lld §T2] JSON body must be declared with correct Content-Type.
      expect(buttonSrc).toMatch(/['"]Content-Type['"]\s*:\s*['"]application\/json['"]/);
    });

    it('then the source serialises github_repo_id and github_repo_name in the request body', () => {
      // [lld §T2] Both fields from AddRepoBody must be sent to the API.
      expect(buttonSrc).toContain('github_repo_id');
      expect(buttonSrc).toContain('github_repo_name');
    });

    it('then the source sets loading=true before issuing the fetch call', () => {
      // [lld §T2 BDD spec] "shows 'Adding…' label while POST is in flight"
      // The loading setter must be called before fetch, not after.
      // A structural check: setLoading(true) must appear before the fetch call in source order.
      const setLoadingTrueIdx = buttonSrc.indexOf('setLoading(true)');
      const fetchIdx = buttonSrc.indexOf('fetch(');
      // Both must exist and setLoading(true) must precede fetch.
      expect(setLoadingTrueIdx).toBeGreaterThan(-1);
      expect(fetchIdx).toBeGreaterThan(-1);
      expect(setLoadingTrueIdx).toBeLessThan(fetchIdx);
    });

    it('then the source sets loading=false in the finally block (always resets)', () => {
      // [lld §T2] Loading must be cleared regardless of success, 409, or network error.
      // The finally block ensures the button is always re-enabled after the call completes.
      expect(buttonSrc).toContain('finally');
      expect(buttonSrc).toContain('setLoading(false)');
    });
  });

  // -------------------------------------------------------------------------
  // Property: router.refresh() called on 201.
  // [lld §T2 BDD spec] "calls router.refresh() after successful add"
  // -------------------------------------------------------------------------

  describe('When POST responds with 201 (success)', () => {
    it('then the source calls router.refresh()', () => {
      // [lld §T2 AC] After a successful add, the page must refresh to show the new repo.
      expect(buttonSrc).toContain('router.refresh()');
    });

    it('then the source calls router.refresh() only in the success branch', () => {
      // [lld §T2] router.refresh() must be conditional on the response being ok/201,
      // not called unconditionally or inside the error branch.
      // The refresh call must appear after a status/ok check, not inside catch.
      const catchBlockMatch = buttonSrc.match(/catch\s*[({][^}]{0,500}/);
      if (catchBlockMatch) {
        expect(catchBlockMatch[0]).not.toContain('router.refresh()');
      }
      // Also confirm refresh is NOT called in a 409 branch.
      const conflictBranchMatch = buttonSrc.match(/409[^}]{0,200}/);
      if (conflictBranchMatch) {
        expect(conflictBranchMatch[0]).not.toContain('router.refresh()');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Property: 409 response shows "Already registered" inline message.
  // [lld §T2 BDD spec] "shows 'Already registered' message on 409 response"
  // -------------------------------------------------------------------------

  describe('When POST responds with 409', () => {
    it('then the source sets an "Already registered" error state', () => {
      // [lld §T2 AC] "A 409 conflict shows an inline 'Already registered' message."
      // The 409 branch must assign a user-readable error message to the error state.
      expect(buttonSrc).toContain('Already registered');
    });

    it('then the source does NOT call router.refresh() on 409', () => {
      // Prohibition: a 409 must not cause a page refresh — the repo did not change.
      const conflictBranchMatch = buttonSrc.match(/409[^}]{0,300}/);
      if (conflictBranchMatch) {
        expect(conflictBranchMatch[0]).not.toContain('router.refresh()');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Property: network error shows error message.
  // [lld §T2 BDD spec] "shows error message on network failure"
  // -------------------------------------------------------------------------

  describe('When a network error occurs (fetch rejects)', () => {
    it('then the source sets an error state message in the catch block', () => {
      // [lld §T2 BDD spec] "shows error message on network failure"
      // The catch block must set an error string that will be rendered to the user.
      // Accept "Network error", "Failed", or similar user-facing language.
      const catchBlockMatch = buttonSrc.match(/catch\s*[({][^}]{0,500}/);
      expect(catchBlockMatch).not.toBeNull();
      if (catchBlockMatch) {
        // The catch block must contain a setError call or direct error assignment.
        expect(catchBlockMatch[0]).toMatch(/setError\s*\(|error\s*=/);
      }
    });

    it('then the source provides a user-readable network error message', () => {
      // [lld §T2] The error string must communicate a network or retry message to the user.
      // Accept "Network error", "try again", "failed", or similar.
      expect(buttonSrc).toMatch(/[Nn]etwork\s+error|[Ff]ailed|[Tt]ry\s+again/);
    });
  });

  // -------------------------------------------------------------------------
  // Property: error message is rendered in the JSX output.
  // [lld §T2] The error state must be conditionally rendered in the component JSX.
  // -------------------------------------------------------------------------

  describe('Given the component renders an error state', () => {
    it('then the source conditionally renders the error value in JSX', () => {
      // [lld §T2] The error text must appear to the user, not just be set in state.
      // Pattern: {error ? <span>...</span> : null} or {error && <span>}
      expect(buttonSrc).toMatch(/\{error[\s\S]{0,80}\{error\}|\{error\s*&&|\{error\s*\?/);
    });
  });
});

// ---------------------------------------------------------------------------
// GROUP 3: Source-text — component structure invariants
// [lld §T2 AddRepositoryButton]
// ---------------------------------------------------------------------------

describe('AddRepositoryButton — component structure (source-text)', () => {

  it('then the file contains "use client" directive', () => {
    // [lld §T2] AddRepositoryButton must be a client component (uses useState, useRouter).
    expect(buttonSrc).toContain("'use client'");
  });

  it('then the component uses useRouter from next/navigation', () => {
    // [lld §T2] router.refresh() requires useRouter import.
    expect(buttonSrc).toContain('useRouter');
  });

  it('then the component uses useState for loading state', () => {
    // [lld §T2] Loading state is required to show "Adding…" and disable the button.
    expect(buttonSrc).toContain('useState');
    expect(buttonSrc).toContain('loading');
  });

  it('then the component accepts orgId, githubRepoId, and githubRepoName props', () => {
    // [lld §T2 interface AddRepositoryButtonProps] All three props must be declared.
    expect(buttonSrc).toContain('orgId');
    expect(buttonSrc).toContain('githubRepoId');
    expect(buttonSrc).toContain('githubRepoName');
  });

  it('then the POST URL includes the orgId prop dynamically', () => {
    // [lld §T2] The endpoint must use the org-specific URL — not a hardcoded org ID.
    // The fetch URL must be a template literal or concatenation involving orgId.
    expect(buttonSrc).toMatch(/\/api\/organisations\/.*orgId|`[^`]*\/api\/organisations\/\$\{.*orgId/);
  });
});
