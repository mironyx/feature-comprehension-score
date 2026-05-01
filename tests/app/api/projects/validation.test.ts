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
