// Tests for Story 2.1: Add comprehension depth to assessment configuration.
// Issue: #222 — feat: add comprehension depth to assessment configuration
// LLD: docs/design/lld-v3-e2-comprehension-depth.md §Story 2.1
//
// Coverage:
//   - FcsCreateBodySchema: comprehension_depth enum field, default, validation
//   - AssembledArtefactSetSchema: optional comprehension_depth field
//   - CreateAssessmentForm: selector presence, default, option text, payload
//
// RPC tests live in comprehension-depth.integration.test.ts so the unit-test
// job (which excludes *.integration.test.ts) skips the DB-backed cases.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FcsCreateBodySchema } from '@/app/api/fcs/service';
import { AssembledArtefactSetSchema } from '@/lib/engine/prompts/artefact-types';

// Base assembled artefact — required fields, no comprehension_depth.
const ASSEMBLED_BASE = {
  artefact_type: 'pull_request' as const,
  pr_diff: '--- a/f.ts\n+++ b/f.ts\n@@ -1 +1 @@\n-old\n+new',
  file_listing: [{ path: 'f.ts', additions: 1, deletions: 0, status: 'modified' }],
  file_contents: [{ path: 'f.ts', content: 'export function f() {}' }],
  question_count: 3,
  artefact_quality: 'code_only' as const,
  token_budget_applied: false,
};

// Base valid FcsCreateBody — required fields, no comprehension_depth.
const VALID_FCS_BASE = {
  org_id: 'a0000000-0000-4000-8000-000000000001',
  repository_id: 'a0000000-0000-4000-8000-000000000002',
  feature_name: 'Checkout Flow',
  merged_pr_numbers: [42],
  participants: [{ github_username: 'alice' }],
};

// ---------------------------------------------------------------------------
// FcsCreateBodySchema — comprehension_depth field [lld §Story 2.1, API change]
// ---------------------------------------------------------------------------

describe('FcsCreateBodySchema', () => {
  // Property 1 [lld §Story 2.1 BDD]: enum value 'conceptual' is accepted.
  it('accepts body with comprehension_depth "conceptual"', () => {
    const result = FcsCreateBodySchema.safeParse({
      ...VALID_FCS_BASE,
      comprehension_depth: 'conceptual',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comprehension_depth).toBe('conceptual');
    }
  });

  // Property 2 [lld §Story 2.1 BDD]: enum value 'detailed' is accepted.
  it('accepts body with comprehension_depth "detailed"', () => {
    const result = FcsCreateBodySchema.safeParse({
      ...VALID_FCS_BASE,
      comprehension_depth: 'detailed',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comprehension_depth).toBe('detailed');
    }
  });

  // Property 3 [lld §Story 2.1 BDD, Invariant 2]: field defaults to 'conceptual' when omitted.
  it('defaults comprehension_depth to "conceptual" when omitted', () => {
    const result = FcsCreateBodySchema.safeParse(VALID_FCS_BASE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comprehension_depth).toBe('conceptual');
    }
  });

  // Property 4 [lld §Story 2.1 BDD, Invariant 6]: values outside the enum are rejected.
  it('rejects invalid comprehension_depth value', () => {
    const result = FcsCreateBodySchema.safeParse({
      ...VALID_FCS_BASE,
      comprehension_depth: 'superficial',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AssembledArtefactSetSchema — comprehension_depth optional field
// [lld §Story 2.1, Type change, Invariant 6]
// ---------------------------------------------------------------------------

describe('AssembledArtefactSetSchema', () => {
  // Property 5 [lld §Story 2.1]: field is optional — omitting it must parse successfully.
  it('parses successfully when comprehension_depth is absent', () => {
    const result = AssembledArtefactSetSchema.safeParse(ASSEMBLED_BASE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comprehension_depth).toBeUndefined();
    }
  });

  // Property 6 [lld §Story 2.1]: value 'conceptual' is accepted when present.
  it('parses successfully with comprehension_depth "conceptual"', () => {
    const result = AssembledArtefactSetSchema.safeParse({
      ...ASSEMBLED_BASE,
      comprehension_depth: 'conceptual',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comprehension_depth).toBe('conceptual');
    }
  });

  // Property 7 [lld §Story 2.1]: value 'detailed' is accepted when present.
  it('parses successfully with comprehension_depth "detailed"', () => {
    const result = AssembledArtefactSetSchema.safeParse({
      ...ASSEMBLED_BASE,
      comprehension_depth: 'detailed',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comprehension_depth).toBe('detailed');
    }
  });

  // Property 8 [lld §Story 2.1, Invariant 6]: out-of-enum values are rejected.
  it('rejects an invalid comprehension_depth value', () => {
    const result = AssembledArtefactSetSchema.safeParse({
      ...ASSEMBLED_BASE,
      comprehension_depth: 'exhaustive',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CreateAssessmentForm — source-level assertions
// [lld §Story 2.1, Form change; AC1, AC2]
//
// Strategy: source-level assertions (same pattern as
// tests/app/assessments/create-assessment-styling.test.ts) because the
// project avoids React Testing Library. We assert on the JSX source text
// for structural properties the spec requires — option presence, text,
// default value, and payload field.
// ---------------------------------------------------------------------------

const formSrc = readFileSync(
  resolve(__dirname, '../../../src/app/(authenticated)/assessments/new/create-assessment-form.tsx'),
  'utf8',
);

describe('CreateAssessmentForm', () => {
  // Property 9 [lld §Story 2.1 BDD, AC1]: form renders a labelled "Comprehension Depth" selector.
  it('renders comprehension depth selector with Conceptual selected by default', () => {
    // Label text must be present.
    expect(formSrc).toContain('Comprehension Depth');
    // A <select> (or equivalent) element must be present.
    expect(formSrc).toContain('<select');
    // The default state must be 'conceptual'.
    expect(formSrc).toContain("'conceptual'");
  });

  // Property 10 [lld §Story 2.1 BDD, AC2]: selector exposes exactly two named options.
  it('renders a "conceptual" option', () => {
    expect(formSrc).toContain('value="conceptual"');
  });

  it('renders a "detailed" option', () => {
    expect(formSrc).toContain('value="detailed"');
  });

  // Property 11 [lld §Story 2.1, AC2, Form change]:
  // Each option includes a one-line explanation per the LLD.
  it('includes the one-line explanation for the Conceptual option', () => {
    // LLD text: "Conceptual — Tests reasoning about approach, constraints, and rationale"
    expect(formSrc).toContain('Tests reasoning about approach, constraints, and rationale');
  });

  it('includes the one-line explanation for the Detailed option', () => {
    // LLD text: "Detailed — Tests knowledge of specific types, files, and function signatures"
    expect(formSrc).toContain('Tests knowledge of specific types, files, and function signatures');
  });

  // Property 12 [lld §Story 2.1 BDD, AC1]:
  // Form includes comprehension_depth in the submitted payload.
  it('includes depth in submitted payload', () => {
    // The form must reference comprehension_depth when building the fetch body.
    expect(formSrc).toContain('comprehension_depth');
  });
});
