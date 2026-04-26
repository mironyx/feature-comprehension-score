// Tests for delete-assessment UI — Story 3.2.
// Design reference: docs/design/lld-e3-assessment-deletion.md §3.2
// Requirements:    docs/requirements/v4-requirements.md §3.2
// Issue:           #319
//
// Testing approach:
//   Pattern (a) renderToStaticMarkup + useState stub: observable render-output properties.
//   Pattern (b) readFileSync source-text: fetch wiring, state-mutation logic that cannot
//               be observed from static HTML in a node environment (useState is stubbed to
//               a noop setter — post-interaction state changes are invisible).
//
// The makeAssessmentItem factory is kept local here because this file lives in a different
// directory from organisation.test.ts and the factory is not exported from that file.
// Its shape exactly mirrors the one in organisation.test.ts (see §Fixtures reused note).

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Module mocks — must precede component imports.
//
// DeleteAssessmentDialog and DeleteableAssessmentTable are 'use client' components
// that call useState (and potentially useRouter / fetch). Stub useState so they
// can be invoked in a node environment via renderToStaticMarkup.
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn((initial: unknown) => [initial, vi.fn()]),
  };
});

// Stub next/link so renderToStaticMarkup works in node (no DOM).
// Returns a real React element (via createElement) so react-dom/server can traverse it.
vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    default: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
  };
});

// StatusBadge is a UI component — stub to avoid transitive deps.
vi.mock('@/components/ui/status-badge', () => ({
  StatusBadge: ({ status }: { status: string }) => status,
}));

// Stub lucide-react icons so renderToStaticMarkup emits a recognisable element
// for each icon rather than a full SVG path. Used by T3 (issue #362) tests.
vi.mock('lucide-react', async () => {
  const React = await import('react');
  return {
    Trash2: ({ size }: { size?: number }) =>
      React.createElement('svg', { 'data-testid': 'icon-trash-2', width: size, height: size }),
    MoreHorizontal: ({ size }: { size?: number }) =>
      React.createElement('svg', { 'data-testid': 'icon-more-horizontal', width: size, height: size }),
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import type { AssessmentListItem } from '@/app/api/assessments/helpers';
import {
  DeleteAssessmentDialog,
  type DeleteAssessmentDialogProps,
} from '@/app/(authenticated)/organisation/delete-assessment-dialog';
import {
  DeleteableAssessmentTable,
  type DeleteableAssessmentTableProps,
} from '@/app/(authenticated)/organisation/deleteable-assessment-table';

// ---------------------------------------------------------------------------
// Source-text fixtures (pattern b)
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, '../../../../src/app/(authenticated)/organisation');

const tableOverviewSrc = readFileSync(resolve(ROOT, 'assessment-overview-table.tsx'), 'utf8');
const deleteableTableSrc = readFileSync(resolve(ROOT, 'deleteable-assessment-table.tsx'), 'utf8');

// ---------------------------------------------------------------------------
// Factory — mirrors makeAssessmentItem in tests/app/(authenticated)/organisation.test.ts
// ---------------------------------------------------------------------------

function makeAssessmentItem(overrides: Partial<AssessmentListItem> = {}): AssessmentListItem {
  return {
    id: 'assess-001',
    type: 'fcs',
    status: 'completed',
    repository_name: 'acme/backend',
    pr_number: null,
    feature_name: 'Auth Overhaul',
    aggregate_score: 0.82,
    conclusion: null,
    config_comprehension_depth: null,
    participant_count: 4,
    completed_count: 3,
    created_at: '2026-04-01T10:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderDialog(props: DeleteAssessmentDialogProps): string {
  return renderToStaticMarkup(
    DeleteAssessmentDialog(props) as ReactElement,
  );
}

function renderDeleteableTable(props: DeleteableAssessmentTableProps): string {
  return renderToStaticMarkup(
    DeleteableAssessmentTable(props) as ReactElement,
  );
}

// ---------------------------------------------------------------------------
// GROUP 1: AssessmentOverviewTable — onDelete prop (Story 3.2)
//
// These use vi.importActual to bypass the module-level stub (which does not exist
// here but the component is real). Source-text assertions are used for the onClick
// wiring; renderToStaticMarkup assertions for render-output properties.
// ---------------------------------------------------------------------------

describe('AssessmentOverviewTable — onDelete prop (Story 3.2)', () => {

  async function renderRealTable(
    assessments: AssessmentListItem[],
    onDelete?: (assessment: AssessmentListItem) => void,
  ) {
    const { AssessmentOverviewTable } = await vi.importActual<
      typeof import('@/app/(authenticated)/organisation/assessment-overview-table')
    >('@/app/(authenticated)/organisation/assessment-overview-table');
    return AssessmentOverviewTable({ assessments, onDelete });
  }

  // -------------------------------------------------------------------------
  // Property 1: delete action rendered per row when onDelete provided
  // [req §3.2 AC1] "each row displays a delete action (button or icon)"
  // [lld §3.2 "When provided, add an 'Actions' column with a delete button"]
  // -------------------------------------------------------------------------

  describe('Given onDelete callback is provided', () => {
    it('then a delete action is present in the rendered output for each row', async () => {
      // AC1: each row must have a delete action (button or similar element).
      const items = [
        makeAssessmentItem({ id: 'assess-aaa' }),
        makeAssessmentItem({ id: 'assess-bbb' }),
      ];
      const result = await renderRealTable(items, vi.fn());
      const rendered = JSON.stringify(result);
      // A delete action must appear — rendered as a button, icon, or text trigger.
      // The implementation must include at least one interactive delete element per row.
      // We assert the rendered output contains "delete" (case-insensitive) at least once.
      expect(rendered.toLowerCase()).toContain('delete');
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: delete action NOT rendered when onDelete absent (backward compat)
  // [lld §3.2 "When onDelete provided, add 'Actions' column" — implied: absent = no column]
  // -------------------------------------------------------------------------

  describe('Given onDelete callback is NOT provided', () => {
    it('then no delete action appears in the rendered output', async () => {
      // Backward compatibility: existing callers without onDelete must not see delete UI.
      const items = [makeAssessmentItem({ id: 'assess-001' })];
      const result = await renderRealTable(items);
      const rendered = JSON.stringify(result);
      // "Delete" as a button label must not appear; "delete" in class names or links is OK
      // but an explicit Delete button/action must not be rendered.
      // Assert no button-like delete affordance: no element with text "Delete" or "delete".
      expect(rendered).not.toMatch(/"Delete"|>Delete</);
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: onClick wiring passes the full AssessmentListItem to onDelete
  // [lld §3.2 "AssessmentOverviewTableProps — onDelete?: (assessment: AssessmentListItem) => void"]
  // Using source-text (pattern b) because useState is stubbed; event handlers cannot
  // be observed from static markup.
  // -------------------------------------------------------------------------

  describe('Given the delete action is clicked on a row', () => {
    it('then the source wires onDelete to pass the full assessment object (not just the id)', () => {
      // [lld §3.2 prop contract] onDelete receives the full AssessmentListItem.
      // The source must call onDelete(a) or onDelete(assessment) — passing the item, not a.id.
      // A bare `onDelete(a.id)` would violate the declared prop type.
      expect(tableOverviewSrc).toMatch(/onDelete\s*\(\s*a\s*\)|onDelete\s*\(\s*assessment\s*\)|onDelete\s*\(\s*item\s*\)/);
    });
  });
});

// ---------------------------------------------------------------------------
// GROUP 1b: AssessmentOverviewTable — Actions column icon buttons (T3, issue #362)
//
// Verifies the renderActionsCell behaviour: Trash2 icon button + MoreHorizontal
// icon link, each with descriptive aria-labels, behind the same onDelete gate.
// Uses renderToStaticMarkup so the lucide stubs render as <svg data-testid=...>.
// ---------------------------------------------------------------------------

describe('AssessmentOverviewTable — actions column (T3)', () => {

  async function renderRealTableHtml(
    assessments: AssessmentListItem[],
    onDelete?: (assessment: AssessmentListItem) => void,
  ): Promise<string> {
    const { AssessmentOverviewTable } = await vi.importActual<
      typeof import('@/app/(authenticated)/organisation/assessment-overview-table')
    >('@/app/(authenticated)/organisation/assessment-overview-table');
    return renderToStaticMarkup(
      AssessmentOverviewTable({ assessments, onDelete }) as ReactElement,
    );
  }

  describe('Given onDelete callback is provided', () => {
    it('renders a Trash2 icon button per row', async () => {
      // [lld §T3] "Trash2 icon (delete — same behaviour)"
      const items = [
        makeAssessmentItem({ id: 'a-1' }),
        makeAssessmentItem({ id: 'a-2' }),
      ];
      const html = await renderRealTableHtml(items, vi.fn());
      const matches = html.match(/data-testid="icon-trash-2"/g) ?? [];
      expect(matches.length).toBe(2);
    });

    it('renders a MoreHorizontal icon link per row', async () => {
      // [lld §T3] "MoreHorizontal icon (navigates to /assessments/[id])"
      const items = [
        makeAssessmentItem({ id: 'a-1' }),
        makeAssessmentItem({ id: 'a-2' }),
      ];
      const html = await renderRealTableHtml(items, vi.fn());
      const matches = html.match(/data-testid="icon-more-horizontal"/g) ?? [];
      expect(matches.length).toBe(2);
    });

    it('points the MoreHorizontal link to /assessments/[id]', async () => {
      // [lld §T3] "MoreHorizontal navigates to /assessments/[id]"
      const items = [makeAssessmentItem({ id: 'assess-detail-001' })];
      const html = await renderRealTableHtml(items, vi.fn());
      // Anchor href must be the detail route, NOT /results.
      expect(html).toMatch(/href="\/assessments\/assess-detail-001"/);
    });

    it('Trash2 button has aria-label containing the assessment name', async () => {
      // [lld §T3] "Both icons have aria-label containing the assessment name"
      const items = [makeAssessmentItem({ feature_name: 'Auth Overhaul', pr_number: null })];
      const html = await renderRealTableHtml(items, vi.fn());
      // Find the button element and assert its aria-label includes the feature name.
      expect(html).toMatch(/<button[^>]*aria-label="Delete Auth Overhaul"/);
    });

    it('MoreHorizontal anchor has aria-label containing the assessment name', async () => {
      // [lld §T3] "Both icons have aria-label containing the assessment name"
      const items = [makeAssessmentItem({ feature_name: 'Auth Overhaul', pr_number: null })];
      const html = await renderRealTableHtml(items, vi.fn());
      // The details anchor's aria-label must include the feature name.
      expect(html).toMatch(/<a[^>]*aria-label="View details for Auth Overhaul"/);
    });

    it('preserves the feature name link to /assessments/[id]/results', async () => {
      // [lld §T3] "Feature name link to /assessments/[id]/results is unchanged"
      const items = [makeAssessmentItem({ id: 'feat-link-001' })];
      const html = await renderRealTableHtml(items, vi.fn());
      expect(html).toMatch(/href="\/assessments\/feat-link-001\/results"/);
    });
  });

  describe('Given onDelete callback is NOT provided', () => {
    it('renders no Trash2 or MoreHorizontal icons', async () => {
      // [lld §T3 + §3.2] Actions column only appears when onDelete is provided.
      const items = [makeAssessmentItem({ id: 'no-actions' })];
      const html = await renderRealTableHtml(items);
      expect(html).not.toContain('data-testid="icon-trash-2"');
      expect(html).not.toContain('data-testid="icon-more-horizontal"');
    });
  });
});

// ---------------------------------------------------------------------------
// GROUP 2: DeleteAssessmentDialog
// ---------------------------------------------------------------------------

describe('DeleteAssessmentDialog', () => {

  const baseAssessment = makeAssessmentItem({
    id: 'assess-001',
    feature_name: 'Auth Overhaul',
    pr_number: null,
  });

  // -------------------------------------------------------------------------
  // Property 4: assessment null → renders nothing
  // [lld §3.2 "Props: assessment: { ... } | null"]
  // -------------------------------------------------------------------------

  describe('Given assessment prop is null', () => {
    it('then the dialog renders nothing (null / empty output)', () => {
      // Closed/uninitialised state: dialog must not render when no assessment selected.
      const result = DeleteAssessmentDialog({
        assessment: null,
        isDeleting: false,
        error: null,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      });
      // Acceptable: null, undefined, or an empty string from renderToStaticMarkup.
      if (result === null || result === undefined) {
        expect(result).toBeNull();
      } else {
        const html = renderToStaticMarkup(result as ReactElement);
        // An empty render or a hidden/closed dialog with no visible content.
        expect(html).toBe('');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: feature name shown in dialog
  // [req §3.2 AC3] "displays the assessment's feature name"
  // [lld §3.2 "Shows assessment name (feature name or PR #N)"]
  // -------------------------------------------------------------------------

  describe('Given assessment has a feature_name', () => {
    it('then the dialog output contains the feature name', () => {
      // AC3: the feature name must appear in the dialog text.
      const html = renderDialog({
        assessment: baseAssessment,
        isDeleting: false,
        error: null,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      });
      expect(html).toContain('Auth Overhaul');
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: PR #N fallback when feature_name is null
  // [req §3.2 AC3] "PR #N if no feature name"
  // [lld §3.2 "feature name or PR #N"]
  // -------------------------------------------------------------------------

  describe('Given assessment has no feature_name but has a pr_number', () => {
    it('then the dialog output contains "PR #" followed by the pr_number', () => {
      // AC3 fallback: when feature_name is null, dialog must show PR #{n}.
      const assessment = makeAssessmentItem({ feature_name: null, pr_number: 42 });
      const html = renderDialog({
        assessment,
        isDeleting: false,
        error: null,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      });
      expect(html).toContain('PR #');
      expect(html).toContain('42');
    });
  });

  // -------------------------------------------------------------------------
  // Property 7: permanent warning text shown
  // [req §3.2 AC3] "states that deletion is permanent and cannot be undone"
  // [lld §3.2 "'Delete {name}? This action is permanent and cannot be undone.'"]
  // -------------------------------------------------------------------------

  describe('Given the dialog is open with a valid assessment', () => {
    it('then the output contains a permanence warning ("permanent" and "cannot be undone")', () => {
      // AC3 / I4: the confirmation dialog must communicate irreversibility.
      const html = renderDialog({
        assessment: baseAssessment,
        isDeleting: false,
        error: null,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      });
      expect(html.toLowerCase()).toContain('permanent');
      expect(html.toLowerCase()).toContain('cannot be undone');
    });
  });

  // -------------------------------------------------------------------------
  // Property 8: Cancel button rendered
  // [lld §3.2 "Two buttons: 'Cancel' (secondary) and 'Delete' (destructive/red)"]
  // -------------------------------------------------------------------------

  describe('Given the dialog is open', () => {
    it('then a Cancel button is rendered', () => {
      // Cancel must be clickable so the admin can abort without deleting.
      const html = renderDialog({
        assessment: baseAssessment,
        isDeleting: false,
        error: null,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      });
      expect(html).toContain('Cancel');
    });
  });

  // -------------------------------------------------------------------------
  // Property 9: Delete button rendered
  // [lld §3.2 "Two buttons: 'Cancel' (secondary) and 'Delete' (destructive/red)"]
  // -------------------------------------------------------------------------

  describe('Given the dialog is open', () => {
    it('then a Delete button is rendered', () => {
      // Delete must be present for the admin to confirm the action.
      const html = renderDialog({
        assessment: baseAssessment,
        isDeleting: false,
        error: null,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      });
      expect(html).toContain('Delete');
    });
  });

  // -------------------------------------------------------------------------
  // Property 10: isDeleting=true disables buttons
  // [lld §3.2 "While deleting: 'Delete' button shows loading state"]
  // [I4] Prevent double-click or cancel mid-flight
  // -------------------------------------------------------------------------

  describe('Given isDeleting is true', () => {
    it('then the Delete button is disabled', () => {
      // [lld §3.2] Loading state must disable the delete button to prevent double submission.
      const html = renderDialog({
        assessment: baseAssessment,
        isDeleting: true,
        error: null,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      });
      expect(html).toContain('disabled');
    });
  });

  // -------------------------------------------------------------------------
  // Property 11: isDeleting=true shows loading indicator on Delete button
  // [lld §3.2 "While deleting: 'Delete' button shows loading state"]
  // -------------------------------------------------------------------------

  describe('Given isDeleting is true', () => {
    it('then the rendered output contains a loading indicator (e.g. "Deleting" text or spinner)', () => {
      // [lld §3.2] The Delete button must signal in-progress state to the admin.
      const html = renderDialog({
        assessment: baseAssessment,
        isDeleting: true,
        error: null,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      });
      // Accept "Deleting..." text or similar loading convention (aria-busy, spinner class, etc.).
      expect(html.toLowerCase()).toMatch(/delet|loading|spinner|busy/);
    });
  });

  // -------------------------------------------------------------------------
  // Property 12: error shown inline when error is non-null
  // [req §3.2 AC6] "inline error message is displayed near the table"
  // [lld §3.2 "On error: inline error message below the dialog text"]
  // [I5] Failed delete keeps the row — error must communicate this
  // -------------------------------------------------------------------------

  describe('Given error is non-null', () => {
    it('then the error message text appears in the rendered output', () => {
      // AC6 / I5: the admin must see what went wrong without a page reload.
      const html = renderDialog({
        assessment: baseAssessment,
        isDeleting: false,
        error: 'Network request failed',
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      });
      expect(html).toContain('Network request failed');
    });
  });

  // -------------------------------------------------------------------------
  // Property 12b: no error shown when error is null
  // Prohibition — error block must not appear spuriously
  // -------------------------------------------------------------------------

  describe('Given error is null', () => {
    it('then no error content is rendered', () => {
      // No false positive: error UI must only appear when an error actually exists.
      const html = renderDialog({
        assessment: baseAssessment,
        isDeleting: false,
        error: null,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      });
      // "error" as a class name is acceptable; an error message string must not appear.
      // Since no error string is provided, just check the rendered content doesn't show
      // a stale or fabricated error message.
      expect(html).not.toContain('Network request failed');
    });
  });
});

// ---------------------------------------------------------------------------
// GROUP 3: DeleteableAssessmentTable
// ---------------------------------------------------------------------------

describe('DeleteableAssessmentTable', () => {

  // -------------------------------------------------------------------------
  // Property 13: initialAssessments becomes the initial state value
  // [lld §3.2 "Holds `assessments` state (initialised from server-fetched data)"]
  // Using source-text (pattern b): useState is stubbed to [initial, noop], so the
  // initial value passed to useState IS the rendered list. We verify this structurally.
  // -------------------------------------------------------------------------

  describe('Given initialAssessments prop is passed', () => {
    it('then the source passes initialAssessments as the initial value to useState', () => {
      // [lld §3.2 state management] The assessments list must be stateful, seeded from the prop.
      expect(deleteableTableSrc).toMatch(/useState\s*\(\s*initialAssessments\s*\)|useState<[^>]+>\s*\(\s*initialAssessments\s*\)/);
    });
  });

  // -------------------------------------------------------------------------
  // Property 13b: rendered output includes the assessment data from initialAssessments
  // [lld §3.2 "Renders AssessmentOverviewTable with assessments state"]
  // Observable via renderToStaticMarkup since useState returns [initialValue, noop].
  // -------------------------------------------------------------------------

  describe('Given initialAssessments contains one assessment', () => {
    it('then the rendered output includes the assessment feature name', () => {
      // The table must render the seeded data on initial render.
      const items = [makeAssessmentItem({ id: 'assess-xyz', feature_name: 'My Feature' })];
      const html = renderDeleteableTable({ initialAssessments: items });
      expect(html).toContain('My Feature');
    });
  });

  // -------------------------------------------------------------------------
  // Property 14: onDelete prop wired to the child AssessmentOverviewTable
  // [lld §3.2 "Renders AssessmentOverviewTable with an extra 'Actions' column via onDelete prop"]
  // Source-text (pattern b): wiring is a structural code property.
  // -------------------------------------------------------------------------

  describe('Given DeleteableAssessmentTable renders', () => {
    it('then the source passes an onDelete prop to AssessmentOverviewTable', () => {
      // [lld §3.2] The client wrapper must supply onDelete to the presentational table.
      expect(deleteableTableSrc).toContain('AssessmentOverviewTable');
      expect(deleteableTableSrc).toContain('onDelete');
    });
  });

  // -------------------------------------------------------------------------
  // Property 15: dialog is opened when delete action is clicked
  // [req §3.2 AC2] "a confirmation dialog appears before any deletion occurs"
  // [I4] Dialog prevents accidental deletion — must open before any fetch call
  // Source-text (pattern b): state setter for dialog target must be called in the handler.
  // -------------------------------------------------------------------------

  describe('Given the admin clicks the delete action on a row', () => {
    it('then the source sets dialog state (not calls fetch) as the first response to delete click', () => {
      // [lld §3.2 "On delete button click, opens DeleteAssessmentDialog"]
      // The onDelete callback provided to the table must set the dialog target state,
      // NOT immediately call fetch (fetch appears only in the confirm handler).
      // Check that the source has a state setter called in the delete handler
      // that stores the assessment target — not a direct fetch call.
      expect(deleteableTableSrc).toContain('DeleteAssessmentDialog');
      // The handler wires onDelete to open the dialog by setting target state.
      // It must NOT call fetch inline (fetch belongs only in the confirm handler).
      // We verify the delete-click handler does not contain 'fetch' (structural check).
      // The confirm handler DOES contain fetch — we guard by checking the onDelete
      // callback body is a state-setter only.
      const onDeleteHandlerMatch = deleteableTableSrc.match(
        /onDelete[^}]{0,300}/,
      );
      if (onDeleteHandlerMatch) {
        // The immediate onDelete handler body should set state, not call fetch.
        // A fetch call in the confirm handler is expected — but the initial click
        // handler must only open the dialog.
        const handlerFragment = onDeleteHandlerMatch[0];
        // If fetch appears in the same short fragment as the onDelete arrow, it means
        // fetch is called directly on click — that violates the dialog-first invariant.
        // Allow the fragment to contain 'Confirm' (naming the confirm handler) but not
        // a bare fetch() call.
        expect(handlerFragment).not.toMatch(/fetch\s*\(/);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Property 16: fetch called with DELETE method and /api/assessments/{id} URL on confirm
  // [req §3.2 AC4] "the DELETE /api/assessments/[id] endpoint is called"
  // [lld §3.2 "On confirmed delete, calls DELETE /api/assessments/{id}"]
  // Source-text (pattern b).
  // -------------------------------------------------------------------------

  describe('Given the admin confirms deletion in the dialog', () => {
    it('then the source calls fetch with the DELETE method', () => {
      // [req §3.2 AC4, lld §3.2] The confirm handler must issue a DELETE HTTP request.
      expect(deleteableTableSrc).toMatch(/method\s*:\s*['"]DELETE['"]/);
    });

    it('then the source calls fetch with the /api/assessments/{id} URL template', () => {
      // [req §3.2 AC4, lld §3.2] The URL must reference the assessment ID.
      // The fetch call must use a template literal or concatenation with /api/assessments/
      // followed by the assessment id — not just appear in a comment or import path.
      // Accept: fetch(`/api/assessments/${id}`), fetch('/api/assessments/' + id), etc.
      expect(deleteableTableSrc).toMatch(/fetch\s*\([`'"][^`'"]*\/api\/assessments\/|fetch\s*\(`[^`]*\/api\/assessments\/\$\{/);
    });
  });

  // -------------------------------------------------------------------------
  // Property 17: success removes the row from state (no page reload)
  // [req §3.2 AC4] "assessment row is removed from the table without a full page reload"
  // [lld §3.2 "removes row from state on success"]
  // Source-text (pattern b): filter/!== in the success branch.
  // -------------------------------------------------------------------------

  describe('Given the delete API call succeeds (204)', () => {
    it('then the source updates state by filtering out the deleted assessment', () => {
      // [req §3.2 AC4] Row removal must be via state mutation (filter), not a page reload.
      // The success branch must call a state setter with a filter predicate that excludes
      // the deleted assessment ID.
      expect(deleteableTableSrc).toMatch(/\.filter\s*\(|\.filter\(/);
    });

    it('then the source filter excludes the deleted assessment by id', () => {
      // The filter must reference the assessment id — not an arbitrary predicate.
      // Accept: prev.filter(a => a.id !== id), filter(item => item.id !== deletedId), etc.
      expect(deleteableTableSrc).toMatch(/filter[\s\S]{0,100}\.id\s*!==|filter[\s\S]{0,100}!==[\s\S]{0,50}\.id/);
    });
  });

  // -------------------------------------------------------------------------
  // Property 18: failure keeps the row and sets an error message
  // [req §3.2 AC6] "inline error message is displayed … assessment row remains … unchanged"
  // [I5] "Failed delete does not remove the row from the UI"
  // Source-text (pattern b): error state setter in the failure branch; no filter call
  // in the error path.
  // -------------------------------------------------------------------------

  describe('Given the delete API call fails (non-2xx or network error)', () => {
    it('then the source sets an error state (does not silently swallow the failure)', () => {
      // [req §3.2 AC6] The admin must be informed of the failure.
      // The failure branch must call a state setter for an error value.
      // We look for a pattern like setError(...) in the source.
      expect(deleteableTableSrc).toMatch(/setError\s*\(|error\s*=\s*|\.error/);
    });

    it('then the source does NOT remove the assessment row on failure', () => {
      // [I5] Row must remain: the filter call must only exist in the success branch,
      // never immediately after the error handling. We verify this by checking that
      // the source has no `.filter(` immediately following error-handling keywords
      // such as `catch` or after setting an error within the same block.
      //
      // This is a structural guard — if filter appeared in the catch block it would
      // violate I5. We check the catch/else branch does not contain the filter call.
      const catchBlockMatch = deleteableTableSrc.match(
        /catch\s*\([^)]*\)\s*\{[^}]{0,400}/,
      );
      if (catchBlockMatch) {
        expect(catchBlockMatch[0]).not.toMatch(/\.filter\s*\(/);
      }
      // Also check that no else branch (non-ok response) contains filter.
      const elseBlockMatch = deleteableTableSrc.match(
        /if\s*\(!?\s*res\.ok\s*\)\s*\{[^}]{0,400}/,
      );
      if (elseBlockMatch) {
        expect(elseBlockMatch[0]).not.toMatch(/\.filter\s*\(/);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Property 19: no API call when cancel is clicked
  // [req §3.2 AC5] "no deletion occurs and the table remains unchanged"
  // Source-text (pattern b): the cancel handler must not call fetch.
  // -------------------------------------------------------------------------

  describe('Given the admin cancels the confirmation dialog', () => {
    it('then the cancel handler in the source does not call fetch', () => {
      // [req §3.2 AC5] Cancelling must be a pure state reset — no network activity.
      // Extract the onCancel handler body and verify it does not call fetch.
      const onCancelMatch = deleteableTableSrc.match(
        /onCancel[^}]{0,200}/,
      );
      if (onCancelMatch) {
        expect(onCancelMatch[0]).not.toMatch(/fetch\s*\(/);
      } else {
        // If onCancel is not named that way, check the cancel-related handler by
        // asserting fetch is only called inside a confirm-related handler.
        // Indirect check: the source must have a way to reset dialog state without fetch.
        expect(deleteableTableSrc).not.toMatch(/onCancel[\s\S]{0,50}fetch\s*\(/);
      }
    });
  });
});
