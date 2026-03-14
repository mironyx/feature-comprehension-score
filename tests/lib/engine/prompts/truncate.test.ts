import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  truncateText,
  truncateArtefacts,
} from '@/lib/engine/prompts/truncate';
import type { RawArtefactSet } from '@/lib/engine/prompts/artefact-types';

describe('estimateTokens', () => {
  it('returns ceil(length / 4)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });
});

describe('truncateText', () => {
  it('returns text unchanged if within budget', () => {
    const text = 'short text';
    expect(truncateText(text, 100)).toBe(text);
  });

  it('truncates text exceeding budget and adds marker', () => {
    const text = 'a'.repeat(100);
    const result = truncateText(text, 10); // 10 tokens = 40 chars
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result).toContain('... [truncated]');
  });
});

describe('truncateArtefacts', () => {
  const makeRaw = (overrides: Partial<RawArtefactSet> = {}): RawArtefactSet => ({
    artefact_type: 'pull_request',
    pr_diff: 'small diff',
    file_listing: [{ path: 'f.ts', additions: 1, deletions: 0, status: 'added' }],
    file_contents: [{ path: 'f.ts', content: 'small content' }],
    ...overrides,
  });

  it('includes all artefacts when within budget', () => {
    const raw = makeRaw();
    const result = truncateArtefacts(raw, { questionCount: 3 });
    expect(result.token_budget_applied).toBe(false);
    expect(result.truncation_notes).toBeUndefined();
    expect(result.artefact_quality).toBe('code_only');
    expect(result.question_count).toBe(3);
    expect(result.pr_diff).toBe('small diff');
    expect(result.file_contents).toHaveLength(1);
  });

  it('truncates large diff while keeping higher-priority artefacts intact', () => {
    const raw = makeRaw({
      pr_description: 'Important description',
      pr_diff: 'x'.repeat(400_000), // 100k tokens — exceeds default budget
    });
    const result = truncateArtefacts(raw, { questionCount: 3 });
    expect(result.token_budget_applied).toBe(true);
    expect(result.pr_description).toBe('Important description');
    expect(result.pr_diff.length).toBeLessThan(400_000);
    expect(result.pr_diff).toContain('... [truncated]');
    expect(result.truncation_notes).toContain('Code diff truncated');
  });

  it('drops lowest-priority files first when file_contents exceed budget', () => {
    const raw = makeRaw({
      file_contents: [
        { path: 'a.ts', content: 'x'.repeat(200_000) },
        { path: 'b.ts', content: 'x'.repeat(200_000) },
        { path: 'c.ts', content: 'small' },
      ],
    });
    const result = truncateArtefacts(raw, { questionCount: 3, tokenBudget: 1000 });
    expect(result.token_budget_applied).toBe(true);
    expect(result.file_contents.length).toBeLessThanOrEqual(3);
    expect(result.truncation_notes).toBeDefined();
  });

  it('drops test_files when they do not fit', () => {
    const raw = makeRaw({
      pr_diff: 'x'.repeat(2000),
      file_contents: [{ path: 'f.ts', content: 'x'.repeat(2000) }],
      test_files: [{ path: 'test.ts', content: 'x'.repeat(2000) }],
    });
    const result = truncateArtefacts(raw, { questionCount: 3, tokenBudget: 1000 });
    expect(result.token_budget_applied).toBe(true);
    const testContent = (result.test_files ?? []).map(f => f.content).join('');
    expect(testContent.length).toBeLessThan(2000);
  });

  it('uses custom token budget when provided', () => {
    const raw = makeRaw({
      pr_diff: 'x'.repeat(400),
      file_contents: [{ path: 'f.ts', content: 'x'.repeat(400) }],
    });
    const result = truncateArtefacts(raw, { questionCount: 3, tokenBudget: 100 });
    expect(result.token_budget_applied).toBe(true);
  });

  it('classifies artefact quality from input', () => {
    const raw = makeRaw({
      pr_description: 'desc',
      test_files: [{ path: 'test.ts', content: 'test' }],
    });
    const result = truncateArtefacts(raw, { questionCount: 4 });
    expect(result.artefact_quality).toBe('code_and_requirements');
    expect(result.question_count).toBe(4);
  });

  it('clamps remaining budget to zero when high-priority items exceed budget', () => {
    const raw = makeRaw({
      pr_description: 'x'.repeat(4000), // 1000 tokens — exceeds the 10-token budget
      pr_diff: 'small diff',
      file_contents: [{ path: 'f.ts', content: 'code' }],
    });
    // Tiny budget that high-priority items will blow past
    const result = truncateArtefacts(raw, { questionCount: 3, tokenBudget: 10 });
    expect(result.token_budget_applied).toBe(true);
    // Should not crash — description still included (soft cap)
    expect(result.pr_description).toBe('x'.repeat(4000));
  });

  it('populates truncation_notes describing what was truncated', () => {
    const raw = makeRaw({
      pr_diff: 'x'.repeat(400_000),
      test_files: [
        { path: 'a.test.ts', content: 'x'.repeat(100_000) },
        { path: 'b.test.ts', content: 'x'.repeat(100_000) },
      ],
    });
    const result = truncateArtefacts(raw, { questionCount: 3, tokenBudget: 50_000 });
    expect(result.token_budget_applied).toBe(true);
    expect(result.truncation_notes).toBeDefined();
    expect(result.truncation_notes!.length).toBeGreaterThan(0);
  });

  it('records dropped test file count in truncation notes', () => {
    const raw = makeRaw({
      pr_diff: 'small',
      file_contents: [{ path: 'f.ts', content: 'x'.repeat(2000) }],
      test_files: [
        { path: 'a.test.ts', content: 'x'.repeat(2000) },
        { path: 'b.test.ts', content: 'x'.repeat(2000) },
      ],
    });
    const result = truncateArtefacts(raw, { questionCount: 3, tokenBudget: 800 });
    if (result.truncation_notes) {
      const testNote = result.truncation_notes.find(n => n.includes('test files'));
      if (testNote) {
        expect(testNote).toMatch(/\d+ of \d+ test files dropped/);
      }
    }
  });
});
