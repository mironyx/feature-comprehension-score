import { describe, it, expect } from 'vitest';
import {
  ArtefactFileSchema,
  FileListingEntrySchema,
  LinkedIssueSchema,
  RawArtefactSetSchema,
  AssembledArtefactSetSchema,
  OrganisationContextSchema,
} from '@/lib/engine/prompts/artefact-types';

describe('Artefact input types', () => {
  describe('ArtefactFileSchema', () => {
    it('validates a file with path and content', () => {
      const result = ArtefactFileSchema.safeParse({
        path: 'src/lib/engine/scoring.ts',
        content: 'export function score() { return 1; }',
      });
      expect(result.success).toBe(true);
    });

    it('rejects a file missing path', () => {
      const result = ArtefactFileSchema.safeParse({
        content: 'some content',
      });
      expect(result.success).toBe(false);
    });

    it('rejects a file with empty path', () => {
      const result = ArtefactFileSchema.safeParse({
        path: '',
        content: 'some content',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('FileListingEntrySchema', () => {
    it('validates a file listing entry', () => {
      const result = FileListingEntrySchema.safeParse({
        path: 'src/lib/engine/scoring.ts',
        additions: 10,
        deletions: 3,
        status: 'modified',
      });
      expect(result.success).toBe(true);
    });

    it('rejects entry with missing additions', () => {
      const result = FileListingEntrySchema.safeParse({
        path: 'file.ts',
        deletions: 0,
        status: 'added',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('LinkedIssueSchema', () => {
    it('validates a linked issue', () => {
      const result = LinkedIssueSchema.safeParse({
        title: 'Fix race condition',
        body: 'Duplicate charges under concurrent load',
      });
      expect(result.success).toBe(true);
    });

    it('rejects issue without title', () => {
      const result = LinkedIssueSchema.safeParse({
        body: 'Some body',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('RawArtefactSetSchema', () => {
    it('validates a full raw artefact set', () => {
      const result = RawArtefactSetSchema.safeParse({
        artefact_type: 'pull_request',
        pr_description: 'Fix race condition in payment processor',
        pr_diff: '--- a/src/pay.ts\n+++ b/src/pay.ts\n@@ -1 +1 @@\n-old\n+new',
        file_listing: [
          { path: 'src/pay.ts', additions: 5, deletions: 2, status: 'modified' },
        ],
        file_contents: [
          { path: 'src/pay.ts', content: 'export function pay() {}' },
        ],
        test_files: [
          { path: 'tests/pay.test.ts', content: 'it("pays", () => {})' },
        ],
        linked_issues: [
          { title: 'Race condition bug', body: 'Duplicate charges under load' },
        ],
        context_files: [
          { path: 'docs/design/payments.md', content: '# Payment Design' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('validates a minimal code-only artefact set', () => {
      const result = RawArtefactSetSchema.safeParse({
        artefact_type: 'pull_request',
        pr_diff: '--- a/file.ts\n+++ b/file.ts',
        file_listing: [{ path: 'file.ts', additions: 1, deletions: 0, status: 'modified' }],
        file_contents: [{ path: 'file.ts', content: 'code' }],
      });
      expect(result.success).toBe(true);
    });

    it('rejects artefact set without diff', () => {
      const result = RawArtefactSetSchema.safeParse({
        artefact_type: 'pull_request',
        file_listing: [{ path: 'f.ts', additions: 1, deletions: 0, status: 'added' }],
        file_contents: [{ path: 'f.ts', content: 'code' }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects artefact set without file_listing', () => {
      const result = RawArtefactSetSchema.safeParse({
        artefact_type: 'pull_request',
        pr_diff: 'diff',
        file_contents: [{ path: 'f.ts', content: 'code' }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects artefact set without file_contents', () => {
      const result = RawArtefactSetSchema.safeParse({
        artefact_type: 'pull_request',
        pr_diff: 'diff',
        file_listing: [{ path: 'f.ts', additions: 1, deletions: 0, status: 'added' }],
      });
      expect(result.success).toBe(false);
    });

    it('accepts feature artefact type', () => {
      const result = RawArtefactSetSchema.safeParse({
        artefact_type: 'feature',
        pr_diff: 'diff',
        file_listing: [{ path: 'f.ts', additions: 1, deletions: 0, status: 'added' }],
        file_contents: [{ path: 'f.ts', content: 'code' }],
      });
      expect(result.success).toBe(true);
    });

    it('does not include question_count or artefact_quality', () => {
      const result = RawArtefactSetSchema.safeParse({
        artefact_type: 'pull_request',
        pr_diff: 'diff',
        file_listing: [{ path: 'f.ts', additions: 1, deletions: 0, status: 'added' }],
        file_contents: [{ path: 'f.ts', content: 'code' }],
        question_count: 3,
        artefact_quality: 'code_only',
      });
      // Should pass parse (extra fields stripped by Zod strict or ignored)
      // but the parsed result should not contain these fields
      if (result.success) {
        expect(result.data).not.toHaveProperty('question_count');
        expect(result.data).not.toHaveProperty('artefact_quality');
      }
    });
  });

  describe('OrganisationContextSchema', () => {
    it('accepts a valid context with all four fields', () => {
      const result = OrganisationContextSchema.safeParse({
        domain_vocabulary: [
          { term: 'FCS', definition: 'Feature Comprehension Score' },
        ],
        focus_areas: ['security', 'performance'],
        exclusions: ['legacy-module'],
        domain_notes: 'We use event sourcing throughout.',
      });
      expect(result.success).toBe(true);
    });

    it('accepts an empty object — all fields are optional', () => {
      const result = OrganisationContextSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('rejects focus_areas with more than 5 items', () => {
      const result = OrganisationContextSchema.safeParse({
        focus_areas: ['a', 'b', 'c', 'd', 'e', 'f'],
      });
      expect(result.success).toBe(false);
    });

    it('rejects exclusions with more than 5 items', () => {
      const result = OrganisationContextSchema.safeParse({
        exclusions: ['a', 'b', 'c', 'd', 'e', 'f'],
      });
      expect(result.success).toBe(false);
    });

    it('rejects domain_notes longer than 500 characters', () => {
      const result = OrganisationContextSchema.safeParse({
        domain_notes: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('rejects a domain_vocabulary entry missing term or definition', () => {
      expect(OrganisationContextSchema.safeParse({
        domain_vocabulary: [{ definition: 'only def' }],
      }).success).toBe(false);
      expect(OrganisationContextSchema.safeParse({
        domain_vocabulary: [{ term: 'only term' }],
      }).success).toBe(false);
    });
  });

  describe('AssembledArtefactSetSchema', () => {
    const rawBase = {
      artefact_type: 'pull_request' as const,
      pr_diff: 'diff',
      file_listing: [{ path: 'f.ts', additions: 1, deletions: 0, status: 'added' }],
      file_contents: [{ path: 'f.ts', content: 'code' }],
    };

    it('validates with quality, question_count, and token_budget_applied', () => {
      const result = AssembledArtefactSetSchema.safeParse({
        ...rawBase,
        question_count: 3,
        artefact_quality: 'code_only',
        token_budget_applied: false,
      });
      expect(result.success).toBe(true);
    });

    it('rejects question_count outside 3-5 range', () => {
      expect(AssembledArtefactSetSchema.safeParse({
        ...rawBase, question_count: 2, artefact_quality: 'code_only', token_budget_applied: false,
      }).success).toBe(false);
      expect(AssembledArtefactSetSchema.safeParse({
        ...rawBase, question_count: 6, artefact_quality: 'code_only', token_budget_applied: false,
      }).success).toBe(false);
      expect(AssembledArtefactSetSchema.safeParse({
        ...rawBase, question_count: 3, artefact_quality: 'code_only', token_budget_applied: false,
      }).success).toBe(true);
      expect(AssembledArtefactSetSchema.safeParse({
        ...rawBase, question_count: 5, artefact_quality: 'code_only', token_budget_applied: false,
      }).success).toBe(true);
    });

    it('rejects missing artefact_quality', () => {
      const result = AssembledArtefactSetSchema.safeParse({
        ...rawBase,
        question_count: 3,
        token_budget_applied: false,
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing token_budget_applied', () => {
      const result = AssembledArtefactSetSchema.safeParse({
        ...rawBase,
        question_count: 3,
        artefact_quality: 'code_only',
      });
      expect(result.success).toBe(false);
    });

    it('accepts code_and_design as a valid artefact_quality', () => {
      const result = AssembledArtefactSetSchema.safeParse({
        ...rawBase,
        question_count: 3,
        artefact_quality: 'code_and_design',
        token_budget_applied: false,
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional truncation_notes array', () => {
      const result = AssembledArtefactSetSchema.safeParse({
        ...rawBase,
        question_count: 3,
        artefact_quality: 'code_only',
        token_budget_applied: true,
        truncation_notes: ['Code diff truncated', '2 of 3 test files dropped'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.truncation_notes).toEqual([
          'Code diff truncated',
          '2 of 3 test files dropped',
        ]);
      }
    });

    it('validates without truncation_notes (field is optional)', () => {
      const result = AssembledArtefactSetSchema.safeParse({
        ...rawBase,
        question_count: 3,
        artefact_quality: 'code_only',
        token_budget_applied: false,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.truncation_notes).toBeUndefined();
      }
    });

    it('accepts optional organisation_context', () => {
      const result = AssembledArtefactSetSchema.safeParse({
        ...rawBase,
        question_count: 3,
        artefact_quality: 'code_only',
        token_budget_applied: false,
        organisation_context: {
          focus_areas: ['security'],
          domain_notes: 'Event sourcing codebase.',
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.organisation_context?.focus_areas).toEqual(['security']);
      }
    });
  });
});
