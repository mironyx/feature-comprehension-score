import { describe, it, expect } from 'vitest';
import { classifyArtefactQuality } from '@/lib/engine/prompts/classify-quality';
import type { RawArtefactSet } from '@/lib/engine/prompts/artefact-types';

describe('classifyArtefactQuality', () => {
  const baseArtefacts: RawArtefactSet = {
    artefact_type: 'pull_request',
    pr_diff: 'diff content',
    file_listing: [{ path: 'f.ts', additions: 1, deletions: 0, status: 'added' }],
    file_contents: [{ path: 'f.ts', content: 'code' }],
  };

  it('returns code_only when only diff and file_contents present', () => {
    expect(classifyArtefactQuality(baseArtefacts)).toBe('code_only');
  });

  it('returns code_and_tests when only test_files present', () => {
    expect(classifyArtefactQuality({
      ...baseArtefacts,
      test_files: [{ path: 'test.ts', content: 'test' }],
    })).toBe('code_and_tests');
  });

  it('returns code_and_requirements when pr_description present', () => {
    expect(classifyArtefactQuality({
      ...baseArtefacts,
      pr_description: 'A description',
    })).toBe('code_and_requirements');
  });

  it('returns code_and_requirements when linked_issues present', () => {
    expect(classifyArtefactQuality({
      ...baseArtefacts,
      linked_issues: [{ title: 'Issue', body: 'Body' }],
    })).toBe('code_and_requirements');
  });

  it('returns code_and_design when only context_files present', () => {
    expect(classifyArtefactQuality({
      ...baseArtefacts,
      context_files: [{ path: 'docs/design.md', content: '# Design' }],
    })).toBe('code_and_design');
  });

  it('returns code_and_design when context_files and tests present but no requirements', () => {
    expect(classifyArtefactQuality({
      ...baseArtefacts,
      test_files: [{ path: 'test.ts', content: 'test' }],
      context_files: [{ path: 'docs/design.md', content: '# Design' }],
    })).toBe('code_and_design');
  });

  it('returns code_requirements_and_design when requirements and design docs present', () => {
    expect(classifyArtefactQuality({
      ...baseArtefacts,
      pr_description: 'Description',
      context_files: [{ path: 'docs/design.md', content: '# Design' }],
    })).toBe('code_requirements_and_design');
  });

  it('returns code_requirements_and_design when all artefact types present', () => {
    expect(classifyArtefactQuality({
      ...baseArtefacts,
      pr_description: 'Description',
      test_files: [{ path: 'test.ts', content: 'test' }],
      linked_issues: [{ title: 'Issue', body: 'Body' }],
      context_files: [{ path: 'docs/design.md', content: '# Design' }],
    })).toBe('code_requirements_and_design');
  });

  it('returns code_and_requirements when requirements and tests present but no design docs', () => {
    expect(classifyArtefactQuality({
      ...baseArtefacts,
      pr_description: 'Description',
      test_files: [{ path: 'test.ts', content: 'test' }],
    })).toBe('code_and_requirements');
  });

  describe('Given edge cases', () => {
    it('treats empty pr_description as absent', () => {
      expect(classifyArtefactQuality({
        ...baseArtefacts,
        pr_description: '',
      })).toBe('code_only');
    });

    it('treats empty arrays as absent', () => {
      expect(classifyArtefactQuality({
        ...baseArtefacts,
        test_files: [],
        linked_issues: [],
        context_files: [],
      })).toBe('code_only');
    });

    it('treats undefined optional fields as absent', () => {
      expect(classifyArtefactQuality({
        ...baseArtefacts,
        test_files: undefined,
        linked_issues: undefined,
        context_files: undefined,
      })).toBe('code_only');
    });
  });
});
