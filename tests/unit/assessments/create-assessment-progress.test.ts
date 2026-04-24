// Tests for CreateAssessmentForm — post-creation inline progress state.
// Regression: before fix, form called router.push() on success (redirect to list page).
// After fix: form stays on /assessments/new and renders CreationProgress inline.
// Issue: #304
//
// The component is a 'use client' React component; @testing-library/react is not
// installed. Following the established project pattern (create-assessment-styling.test.ts,
// create-assessment-form-issue-numbers.test.ts) we assert observable contract properties
// via source-text analysis. This is the idiomatic approach for this codebase.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Source text
// ---------------------------------------------------------------------------

const FORM_SRC_PATH = resolve(
  __dirname,
  '../../../src/app/(authenticated)/assessments/new/create-assessment-form.tsx',
);

const formSrc = readFileSync(FORM_SRC_PATH, 'utf8');

// Extract the CreationProgress function body for scoped assertions.
// This prevents false positives from matches in the outer CreateAssessmentForm body.
// The regex captures from `function CreationProgress` up to (but not including) the
// `export default` declaration that follows it.
const creationProgressMatch = formSrc.match(
  /function CreationProgress[\s\S]*?(?=\nexport default|^export default)/m,
);
const creationProgressSrc = creationProgressMatch ? creationProgressMatch[0] : '';

// ---------------------------------------------------------------------------
// PART 1 — Structural contract assertions on the overall component
// ---------------------------------------------------------------------------

describe('CreateAssessmentForm — post-creation state (issue #304)', () => {

  // -------------------------------------------------------------------------
  // Property 1: no router.push on success — regression test for the bug
  // [issue AC1] Page must stay on /assessments/new after successful POST
  // -------------------------------------------------------------------------

  describe('Given a successful POST response', () => {
    it('does not call router.push to redirect away from the creation page', () => {
      // Regression for #304: the original bug was router.push() being called after success.
      // After the fix, the form must NOT redirect — it sets `created` state instead.
      expect(formSrc).not.toContain('router.push(');
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: `created` state set with assessmentId and featureName
  // [issue] After POST success, created state is populated, not navigation
  // -------------------------------------------------------------------------

  describe('Given a successful POST response', () => {
    it('sets created state with assessmentId from the POST response body', () => {
      // handleSubmit must call setCreated({ assessmentId, ... }) not router.push
      expect(formSrc).toContain('setCreated(');
      expect(formSrc).toContain('assessmentId');
    });

    it('sets created state with the feature name from the form', () => {
      // featureName must come from the submitted form field, not from the API
      expect(formSrc).toMatch(/setCreated\(\{[\s\S]{0,200}featureName/);
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: CreationResult interface has assessmentId and featureName
  // [issue] Interface contract for the creation result passed to CreationProgress
  // -------------------------------------------------------------------------

  describe('CreationResult interface', () => {
    it('declares assessmentId as a string field', () => {
      // [issue key source file note] CreationResult interface { assessmentId: string, featureName: string }
      expect(formSrc).toContain('assessmentId: string');
    });

    it('declares featureName as a string field', () => {
      // [issue] CreationResult must carry the feature name for display in progress state
      expect(formSrc).toContain('featureName: string');
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: CreationProgress component exists and reuses PollingStatusBadge
  // [issue AC2] Progress state must be rendered inline, not navigated to
  // -------------------------------------------------------------------------

  describe('CreationProgress component', () => {
    it('is defined in the same file as CreateAssessmentForm', () => {
      // Component must be co-located as a private sub-component
      expect(formSrc).toContain('function CreationProgress(');
    });

    it('renders a PollingStatusBadge for the newly created assessment', () => {
      // [issue AC2] Progress state must show real-time polling badge
      expect(formSrc).toContain('PollingStatusBadge');
    });

    it('imports PollingStatusBadge from the sibling module', () => {
      // PollingStatusBadge is reused, not reimplemented
      expect(formSrc).toContain("from '../polling-status-badge'");
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: CreationProgress must not be the stub that throws
  // Regression for #304: the stub threw new Error('not implemented')
  // -------------------------------------------------------------------------

  describe('CreationProgress — implementation completeness', () => {
    it('is no longer a stub that throws "not implemented"', () => {
      // Regression for #304: the component was stubbed with throw new Error('not implemented').
      // After the fix, it must be a real implementation.
      expect(formSrc).not.toContain("throw new Error('not implemented')");
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: link to assessments list present in the component source
  // [issue AC5] Admin must be able to navigate away manually
  // -------------------------------------------------------------------------

  describe('CreationProgress — navigation link', () => {
    it('contains a link href pointing to /assessments in the source', () => {
      // [issue AC5] There must be a navigable href to the assessments list
      // so the admin can leave without waiting for polling to complete.
      expect(formSrc).toContain('/assessments');
    });
  });

  // -------------------------------------------------------------------------
  // Property 7: the created state branch is rendered when created is non-null
  // [issue] Component must switch to progress state, not show the form
  // -------------------------------------------------------------------------

  describe('CreateAssessmentForm — state branching', () => {
    it('conditionally renders CreationProgress when created state is non-null', () => {
      // The form must inspect the `created` state and render CreationProgress
      // instead of the form fields when creation has succeeded.
      expect(formSrc).toMatch(/created[\s\S]{0,60}CreationProgress|CreationProgress[\s\S]{0,200}created/);
    });
  });
});

// ---------------------------------------------------------------------------
// PART 2 — CreationProgress JSX source assertions
//
// The rendering tests below assert on the extracted CreationProgress function
// source. This is the idiomatic approach for this codebase (see retry-button.test.ts,
// create-assessment-form-issue-numbers.test.ts) and avoids the fragility of
// mocking React hooks in a node environment for internal sub-components.
// ---------------------------------------------------------------------------

describe('CreationProgress JSX contract (issue #304)', () => {

  // -------------------------------------------------------------------------
  // Property 8: feature name passed to CreationProgress and rendered
  // [issue AC2] Progress state must display the assessment name
  // -------------------------------------------------------------------------

  describe('Given the creation succeeded and polling is in progress', () => {
    it('renders the featureName prop in the progress view', () => {
      // [issue AC2] The CreationProgress component must output the feature name.
      // The prop is passed in and must appear in the JSX return value.
      expect(creationProgressSrc).toContain('featureName');
    });

    it('passes the assessmentId prop to PollingStatusBadge', () => {
      // [issue AC2] PollingStatusBadge must receive the assessmentId so it polls
      // the right assessment. The prop must appear in the JSX instantiation.
      expect(creationProgressSrc).toMatch(/PollingStatusBadge[\s\S]{0,200}assessmentId/);
    });

    it('includes a navigable link to the assessments list', () => {
      // [issue AC5] Link to /assessments must appear in CreationProgress JSX
      // so the admin can leave the page without waiting for polling to finish.
      expect(creationProgressSrc).toContain('/assessments');
    });
  });

  // -------------------------------------------------------------------------
  // Property 9: success state shown when status is awaiting_responses
  // [issue AC3] awaiting_responses -> success message + link to assessment
  // -------------------------------------------------------------------------

  describe('Given rubric generation completes (status becomes awaiting_responses)', () => {
    it('branches on awaiting_responses status to show a success or completion state', () => {
      // [issue AC3] CreationProgress must handle the awaiting_responses terminal status
      // and provide feedback that generation succeeded.
      expect(creationProgressSrc).toContain('awaiting_responses');
    });

    it('includes the assessmentId in a link in the success branch', () => {
      // [issue AC3] After success, the admin must be able to navigate to the assessment.
      // The assessmentId must appear near a link construct (href) in the component.
      expect(creationProgressSrc).toMatch(
        /assessmentId[\s\S]{0,400}href|href[\s\S]{0,400}assessmentId/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 10: error state shown when status is rubric_failed
  // [issue AC4] rubric_failed -> error message + link to assessments list
  // -------------------------------------------------------------------------

  describe('Given rubric generation fails (status becomes rubric_failed)', () => {
    it('branches on rubric_failed status to show a failure message', () => {
      // [issue AC4] CreationProgress must handle the rubric_failed terminal status
      // and communicate the failure to the admin.
      expect(creationProgressSrc).toContain('rubric_failed');
    });
  });

  // -------------------------------------------------------------------------
  // Property 11: success branch links to the assessment detail page, not the list
  // [issue AC3] "link to the assessment" must use the assessmentId in the href
  //
  // Gap: the existing test (Property 9) uses a broad regex that matches assessmentId
  // appearing anywhere near any href in the component body. It would pass even if the
  // success branch used href="/assessments" (the list) instead of the detail page URL.
  // This test pins the specific href template literal in the awaiting_responses branch.
  // -------------------------------------------------------------------------

  describe('Given rubric generation completes (success branch link target)', () => {
    it('success branch href includes the assessmentId interpolated into the path', () => {
      // [issue AC3] The link must navigate to the specific assessment (/assessments/<id>),
      // not to the generic list. href="/assessments" alone would satisfy the broad regex
      // in Property 9 but would violate AC3.
      expect(creationProgressSrc).toMatch(/href=\{[^}]*assessmentId[^}]*\}/);
    });
  });

  // -------------------------------------------------------------------------
  // Property 12: PollingStatusBadge receives initialStatus="rubric_generation"
  // [issue AC2] Polling only activates when initialStatus === 'rubric_generation'
  //
  // Gap: no existing test verifies the initialStatus prop value. useStatusPoll's
  // guard at line 27 gates all polling on initialStatus === 'rubric_generation'.
  // A wrong or missing initialStatus silently prevents polling — the badge renders
  // but status never updates, so AC3 and AC4 terminal states are never reached.
  // -------------------------------------------------------------------------

  describe('Given the in-progress state is rendered', () => {
    it('passes initialStatus="rubric_generation" to PollingStatusBadge to activate polling', () => {
      // [issue AC2] useStatusPoll only starts polling when initialStatus === 'rubric_generation'.
      // PollingStatusBadge must receive the correct literal so the hook guard is satisfied.
      expect(creationProgressSrc).toContain('initialStatus="rubric_generation"');
    });
  });
});
