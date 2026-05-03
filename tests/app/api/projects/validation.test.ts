// Unit tests for UpdateProjectSchema and CreateProjectSchema — glob parseability
// and question_count bounds.
// Design reference: docs/design/lld-v11-e11-3-project-context-config.md §B.1
// Requirements:    docs/requirements/v11-requirements.md §Epic 3, Story 3.1
// Issue:           #421

import { describe, it, expect } from 'vitest';
import { UpdateProjectSchema, CreateProjectSchema } from '@/app/api/projects/validation';

// ---------------------------------------------------------------------------
// UpdateProjectSchema
// ---------------------------------------------------------------------------

describe('UpdateProjectSchema — context-fields validation [#421, LLD §B.1, req §Story 3.1]', () => {

  // Property 1: accepts a fully-populated valid payload [req §Story 3.1, lld §B.1]
  describe('Given a payload with valid glob patterns, domain_notes, and question_count', () => {
    it('When parsed, Then the result is successful [#421]', () => {
      const result = UpdateProjectSchema.safeParse({
        glob_patterns: ['docs/adr/*.md', '**/*.ts'],
        domain_notes: 'foo',
        question_count: 5,
      });

      expect(result.success).toBe(true);
    });
  });

  // Property 2: accepts a payload containing only valid glob_patterns [lld §B.1 acceptance]
  describe('Given a payload with only valid glob_patterns', () => {
    it('When parsed, Then the result is successful [#421, lld §B.1]', () => {
      const result = UpdateProjectSchema.safeParse({
        glob_patterns: ['docs/adr/*.md', '**/*.ts'],
      });

      expect(result.success).toBe(true);
    });
  });

  // Property 3: rejects an unparseable glob — path and message shape [lld §B.1, I1]
  describe('Given a payload with an unparseable glob pattern (e.g. "[")', () => {
    it('When parsed, Then result fails with issues[0].path = ["glob_patterns", 0] [I1, #421]', () => {
      const result = UpdateProjectSchema.safeParse({
        glob_patterns: ['['],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        expect(firstIssue.path).toEqual(['glob_patterns', 0]);
      }
    });

    it('When parsed, Then the issue message starts with "glob_unparseable:" [I1, lld §B.1]', () => {
      const result = UpdateProjectSchema.safeParse({
        glob_patterns: ['['],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        expect(firstIssue.message).toMatch(/^glob_unparseable:/);
      }
    });

    it('When parsed, Then the message includes the offending pattern [I1, lld §B.1]', () => {
      const result = UpdateProjectSchema.safeParse({
        glob_patterns: ['['],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        expect(firstIssue.message).toBe('glob_unparseable:[');
      }
    });
  });

  // Property 4: rejects question_count = 2 (below minimum of 3) [req §Story 3.1, I2]
  describe('Given question_count = 2 (below the minimum of 3)', () => {
    it('When parsed, Then result fails with a range error [I2, req §Story 3.1]', () => {
      const result = UpdateProjectSchema.safeParse({ question_count: 2 });

      expect(result.success).toBe(false);
    });
  });

  // Property 5: accepts question_count = 3 (lower boundary — regression pin) [I2]
  describe('Given question_count = 3 (lower boundary)', () => {
    it('When parsed, Then result is successful [I2, regression]', () => {
      const result = UpdateProjectSchema.safeParse({ question_count: 3 });

      expect(result.success).toBe(true);
    });
  });

  // Property 6: accepts question_count = 8 (V11 upper bound — new) [I2, #421]
  describe('Given question_count = 8 (V11 upper bound)', () => {
    it('When parsed, Then result is successful [I2, #421 — cap raised from 5 to 8]', () => {
      const result = UpdateProjectSchema.safeParse({ question_count: 8 });

      expect(result.success).toBe(true);
    });
  });

  // Property 7: rejects question_count = 9 (above the new V11 maximum) [I2, #421]
  describe('Given question_count = 9 (above the V11 maximum of 8)', () => {
    it('When parsed, Then result fails with a range error [I2, #421]', () => {
      const result = UpdateProjectSchema.safeParse({ question_count: 9 });

      expect(result.success).toBe(false);
    });
  });

  // Property 8: accepts a payload that omits all context fields (project-fields-only path) [lld §B.1]
  describe('Given a payload that omits all context fields (e.g. only {name})', () => {
    it('When parsed, Then result is successful — existing project-fields path unchanged [lld §B.1]', () => {
      const result = UpdateProjectSchema.safeParse({ name: 'My Project' });

      expect(result.success).toBe(true);
    });
  });

  // Property 9: second glob in array that is unparseable reports the correct index [I1]
  describe('Given a payload where the second glob pattern is unparseable', () => {
    it('When parsed, Then issues[0].path has index 1 (not 0) [I1, lld §B.1]', () => {
      const result = UpdateProjectSchema.safeParse({
        glob_patterns: ['docs/adr/*.md', '[bad'],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        expect(firstIssue.path).toEqual(['glob_patterns', 1]);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// UpdateProjectSchema — extended context fields (rev 1.3) [#453]
// [req §Story 3.1 AC 7 / AC 8, lld §Pending changes — Rev 2]
// Caps: domain_vocabulary max 20 rows, term max 100, definition max 500.
//       focus_areas max 5, exclusions max 5.
// ---------------------------------------------------------------------------

describe('UpdateProjectSchema — extended context fields (rev 1.3) [#453]', () => {

  // Property 12: accepts a valid domain_vocabulary, focus_areas, exclusions payload [lld Rev2 validation]
  describe('Given a payload with valid domain_vocabulary, focus_areas, and exclusions', () => {
    it('When parsed, Then the result is successful [#453, lld §Rev2]', () => {
      const result = UpdateProjectSchema.safeParse({
        domain_vocabulary: [
          { term: 'ADR', definition: 'Architecture Decision Record' },
        ],
        focus_areas: ['rubric generation'],
        exclusions: ['test fixtures'],
      });

      expect(result.success).toBe(true);
    });
  });

  // Property 13: rejects domain_vocabulary with more than 20 rows [lld §Rev2 — VocabularySchema max 20]
  describe('Given a domain_vocabulary payload with 21 rows (exceeds cap of 20)', () => {
    it('When parsed, Then the result fails [#453, lld §Rev2]', () => {
      const rows = Array.from({ length: 21 }, (_, i) => ({
        term: `term-${i}`,
        definition: `definition-${i}`,
      }));

      const result = UpdateProjectSchema.safeParse({ domain_vocabulary: rows });

      expect(result.success).toBe(false);
    });
  });

  // Property 14: rejects a vocab row where term exceeds 100 characters [lld §Rev2 — term max 100]
  describe('Given a domain_vocabulary row with a term longer than 100 characters', () => {
    it('When parsed, Then the result fails [#453, lld §Rev2]', () => {
      const result = UpdateProjectSchema.safeParse({
        domain_vocabulary: [
          { term: 'a'.repeat(101), definition: 'valid definition' },
        ],
      });

      expect(result.success).toBe(false);
    });
  });

  // Property 15: rejects a vocab row where definition exceeds 500 characters [lld §Rev2 — definition max 500]
  describe('Given a domain_vocabulary row with a definition longer than 500 characters', () => {
    it('When parsed, Then the result fails [#453, lld §Rev2]', () => {
      const result = UpdateProjectSchema.safeParse({
        domain_vocabulary: [
          { term: 'valid term', definition: 'x'.repeat(501) },
        ],
      });

      expect(result.success).toBe(false);
    });
  });

  // Property 16: rejects focus_areas with more than 5 items [lld §Rev2 — FocusAreasSchema max 5]
  describe('Given a focus_areas payload with 6 items (exceeds cap of 5)', () => {
    it('When parsed, Then the result fails [#453, lld §Rev2]', () => {
      const result = UpdateProjectSchema.safeParse({
        focus_areas: ['a', 'b', 'c', 'd', 'e', 'f'],
      });

      expect(result.success).toBe(false);
    });
  });

  // Property 17: accepts focus_areas with exactly 5 items (boundary) [lld §Rev2]
  describe('Given a focus_areas payload with exactly 5 items (boundary)', () => {
    it('When parsed, Then the result is successful [#453, lld §Rev2]', () => {
      const result = UpdateProjectSchema.safeParse({
        focus_areas: ['a', 'b', 'c', 'd', 'e'],
      });

      expect(result.success).toBe(true);
    });
  });

  // Property 18: rejects exclusions with more than 5 items [lld §Rev2 — ExclusionsSchema max 5]
  describe('Given an exclusions payload with 6 items (exceeds cap of 5)', () => {
    it('When parsed, Then the result fails [#453, lld §Rev2]', () => {
      const result = UpdateProjectSchema.safeParse({
        exclusions: ['a', 'b', 'c', 'd', 'e', 'f'],
      });

      expect(result.success).toBe(false);
    });
  });

  // Property 19: accepts exclusions with exactly 5 items (boundary) [lld §Rev2]
  describe('Given an exclusions payload with exactly 5 items (boundary)', () => {
    it('When parsed, Then the result is successful [#453, lld §Rev2]', () => {
      const result = UpdateProjectSchema.safeParse({
        exclusions: ['a', 'b', 'c', 'd', 'e'],
      });

      expect(result.success).toBe(true);
    });
  });

  // Property 20: accepts vocabulary with exactly 20 rows (upper boundary) [lld §Rev2]
  describe('Given a domain_vocabulary payload with exactly 20 rows (boundary)', () => {
    it('When parsed, Then the result is successful [#453, lld §Rev2]', () => {
      const rows = Array.from({ length: 20 }, (_, i) => ({
        term: `term-${i}`,
        definition: `definition-${i}`,
      }));

      const result = UpdateProjectSchema.safeParse({ domain_vocabulary: rows });

      expect(result.success).toBe(true);
    });
  });

  // Property 21: accepts a vocab term of exactly 100 chars (boundary) [lld §Rev2]
  describe('Given a vocab row with term of exactly 100 characters (boundary)', () => {
    it('When parsed, Then the result is successful [#453, lld §Rev2]', () => {
      const result = UpdateProjectSchema.safeParse({
        domain_vocabulary: [
          { term: 'a'.repeat(100), definition: 'valid definition' },
        ],
      });

      expect(result.success).toBe(true);
    });
  });

  // Property 22: accepts a vocab definition of exactly 500 chars (boundary) [lld §Rev2]
  describe('Given a vocab row with definition of exactly 500 characters (boundary)', () => {
    it('When parsed, Then the result is successful [#453, lld §Rev2]', () => {
      const result = UpdateProjectSchema.safeParse({
        domain_vocabulary: [
          { term: 'valid term', definition: 'x'.repeat(500) },
        ],
      });

      expect(result.success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// CreateProjectSchema — mirror: also rejects unparseable globs, accepts max=8
// [lld §B.1 task 2: "also raise the matching bound on CreateProjectSchema"]
// ---------------------------------------------------------------------------

describe('CreateProjectSchema — mirrors UpdateProjectSchema glob + question_count rules [#421, lld §B.1]', () => {

  // Property 10: rejects unparseable glob in CreateProjectSchema too [lld §B.1]
  describe('Given a CreateProject payload with an unparseable glob pattern', () => {
    it('When parsed, Then result fails with the glob_unparseable message [lld §B.1, #421]', () => {
      const result = CreateProjectSchema.safeParse({
        org_id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'New Project',
        glob_patterns: ['['],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        expect(firstIssue.message).toMatch(/^glob_unparseable:/);
      }
    });
  });

  // Property 11: accepts question_count = 8 in CreateProjectSchema [lld §B.1, #421]
  describe('Given a CreateProject payload with question_count = 8', () => {
    it('When parsed, Then result is successful (V11 upper bound applies to create too) [lld §B.1, #421]', () => {
      const result = CreateProjectSchema.safeParse({
        org_id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'New Project',
        question_count: 8,
      });

      expect(result.success).toBe(true);
    });
  });
});
