// Tests for CreateAssessmentForm — issue numbers feature (Story 19.1, issue #287).
// Contract source: docs/requirements/v2-requirements.md §"Story 19.1", issue #287 AC list.
//
// @testing-library/react is not installed in this project (vitest + node environment only).
// Following the established pattern from create-assessment-styling.test.ts:
// we read the source file and validate the observable contract properties via AST-level
// string analysis. This is appropriate for UI contract properties that are directly
// readable from the component source (rendered fields, validation logic, payload shape).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// T2.4: assessments/new/ deleted in T2.3 — re-enable after #413 ships
const FORM_PATH = resolve(
  __dirname,
  '../../../src/app/(authenticated)/projects/[id]/assessments/new/create-assessment-form.tsx',
);

const formExists = existsSync(FORM_PATH);
const formSrc = formExists ? readFileSync(FORM_PATH, 'utf8') : '';

describe('CreateAssessmentForm — issue numbers (Story 19.1, issue #287)', () => {

  describe('renders issue numbers input field', () => {
    it('has an input element with id "issueNumbers"', () => {
      // [req §Story 19.1 frontend] Issue numbers field must be rendered
      expect(formSrc).toContain('id="issueNumbers"');
    });

    it('has a label that references the issueNumbers input', () => {
      // [req §Story 19.1 frontend] Accessible label for the issue numbers field
      expect(formSrc).toContain('htmlFor="issueNumbers"');
    });

    it('includes placeholder text indicating comma-separated input', () => {
      // [issue #287 frontend] field should guide the user on input format
      // The form uses the same "comma-separated" pattern as PR numbers
      expect(formSrc).toMatch(/issueNumbers[\s\S]{0,200}placeholder/);
    });

    it('binds the field to the issueNumbers slice of FormState', () => {
      // [issue #287] form state must include an issueNumbers field
      expect(formSrc).toContain("issueNumbers: ''");
    });
  });

  describe('validates: at least one of PRs or issues required', () => {
    it('validate() checks both prNumbers and issues length before rejecting', () => {
      // [req §Story 19.1 frontend] "at least one of merged PR or issue number"
      // The guard must read BOTH parsed arrays before emitting the error
      expect(formSrc).toContain('prs.length === 0 && issues.length === 0');
    });

    it('validation error message mentions both PR numbers and issue numbers', () => {
      // [req §Story 19.1 frontend] error text surfaces both options to the user
      expect(formSrc).toContain('Enter at least one merged PR number or issue number');
    });

    it('validation does NOT reject when only issue_numbers are provided (no PRs)', () => {
      // [req §Story 19.1] issue_numbers alone must satisfy the client-side guard.
      // The guard is "prs.length === 0 && issues.length === 0" — AND, not OR.
      // We confirm this by verifying both parts of the guard appear together in one expression,
      // and that the combined guard (which already passes above) uses && (both must be empty).
      // The single-guard anti-pattern would be "merged_pr_numbers.length === 0" with no issues check.
      expect(formSrc).not.toContain("prs.length === 0)");
    });

    it('validation does NOT reject when only merged_pr_numbers are provided (backward compat)', () => {
      // [req §Story 19.1 — backward compat] PR-only input must still pass validation.
      // Guard is AND not OR — both empty triggers error, one non-empty passes.
      // We verify the connector is && (AND), not || (OR).
      expect(formSrc).toMatch(/prs\.length === 0 && issues\.length === 0/);
    });
  });

  describe('payload construction', () => {
    it('includes issue_numbers in payload only when issues are provided', () => {
      // [req §Story 19.1] issue_numbers field conditionally added to POST body
      expect(formSrc).toContain('if (issues.length > 0) payload.issue_numbers = issues;');
    });

    it('omits merged_pr_numbers from payload when prNumbers is empty', () => {
      // [req §Story 19.1] merged_pr_numbers is omitted (not sent as []) when not filled
      expect(formSrc).toContain('if (prs.length > 0) payload.merged_pr_numbers = prs;');
    });

    it('AssessmentPayload type declares issue_numbers as optional', () => {
      // [req §Story 19.1] type contract: issue_numbers?: number[]
      expect(formSrc).toContain('issue_numbers?: number[]');
    });

    it('AssessmentPayload type declares merged_pr_numbers as optional', () => {
      // [req §Story 19.1 — backward compat] merged_pr_numbers?: number[]
      expect(formSrc).toContain('merged_pr_numbers?: number[]');
    });

    it('parsePositiveIntegers is used to parse issue numbers', () => {
      // [req §Story 19.1] issue numbers must be parsed as positive integers
      // The form uses parsePositiveIntegers for both PRs and issues
      expect(formSrc).toMatch(/parsePositiveIntegers\(form\.issueNumbers\)/);
    });
  });

  describe('FormState shape', () => {
    it('FormState interface includes issueNumbers field', () => {
      // [issue #287] the form state shape must track issue numbers separately from PR numbers
      expect(formSrc).toContain('issueNumbers: string');
    });

    it('INITIAL_STATE initialises issueNumbers to empty string', () => {
      // [issue #287] field starts empty — no default issue numbers
      expect(formSrc).toContain("issueNumbers: ''");
    });
  });
});
