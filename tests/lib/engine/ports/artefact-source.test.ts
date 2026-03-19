import { describe, it, expect, vi } from 'vitest';
import type { ArtefactSource, PRExtractionParams } from '@/lib/engine/ports/artefact-source';
import { PRExtractionParamsSchema } from '@/lib/engine/ports/artefact-source';
import type { RawArtefactSet } from '@/lib/engine/prompts/artefact-types';

const minimalRawArtefact: RawArtefactSet = {
  artefact_type: 'pull_request',
  pr_diff: '--- a/src/pay.ts\n+++ b/src/pay.ts\n@@ -1 +1 @@\n-old\n+new',
  file_listing: [{ path: 'src/pay.ts', additions: 1, deletions: 1, status: 'modified' }],
  file_contents: [{ path: 'src/pay.ts', content: 'export function pay() {}' }],
};

describe('ArtefactSource port', () => {
  describe('Given a mock implementation of ArtefactSource', () => {
    it('then it can be used as an ArtefactSource', async () => {
      const mock: ArtefactSource = {
        extractFromPRs: vi.fn().mockResolvedValue(minimalRawArtefact),
      };

      const params: PRExtractionParams = { owner: 'acme', repo: 'payments', prNumbers: [42] };
      const result = await mock.extractFromPRs(params);

      expect(result.artefact_type).toBe('pull_request');
      expect(result.pr_diff).toBeTruthy();
    });

    it('then it can accept multiple PR numbers for FCS assessment', async () => {
      const mock: ArtefactSource = {
        extractFromPRs: vi.fn().mockResolvedValue({
          ...minimalRawArtefact,
          artefact_type: 'feature',
        }),
      };

      const params: PRExtractionParams = { owner: 'acme', repo: 'payments', prNumbers: [42, 43, 44] };
      const result = await mock.extractFromPRs(params);

      expect(result.artefact_type).toBe('feature');
    });
  });

  describe('PRExtractionParamsSchema', () => {
    it('validates params with owner, repo, and single PR number', () => {
      const result = PRExtractionParamsSchema.safeParse({
        owner: 'acme',
        repo: 'payments',
        prNumbers: [42],
      });
      expect(result.success).toBe(true);
    });

    it('validates params with multiple PR numbers for FCS', () => {
      const result = PRExtractionParamsSchema.safeParse({
        owner: 'acme',
        repo: 'payments',
        prNumbers: [42, 43, 44],
      });
      expect(result.success).toBe(true);
    });

    it('rejects params without owner', () => {
      const result = PRExtractionParamsSchema.safeParse({
        repo: 'payments',
        prNumbers: [42],
      });
      expect(result.success).toBe(false);
    });

    it('rejects params without repo', () => {
      const result = PRExtractionParamsSchema.safeParse({
        owner: 'acme',
        prNumbers: [42],
      });
      expect(result.success).toBe(false);
    });

    it('rejects params with empty prNumbers', () => {
      const result = PRExtractionParamsSchema.safeParse({
        owner: 'acme',
        repo: 'payments',
        prNumbers: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects params with non-integer PR numbers', () => {
      const result = PRExtractionParamsSchema.safeParse({
        owner: 'acme',
        repo: 'payments',
        prNumbers: [42.5],
      });
      expect(result.success).toBe(false);
    });

    it('rejects params with negative PR numbers', () => {
      const result = PRExtractionParamsSchema.safeParse({
        owner: 'acme',
        repo: 'payments',
        prNumbers: [-1],
      });
      expect(result.success).toBe(false);
    });

    it('rejects params with empty owner', () => {
      const result = PRExtractionParamsSchema.safeParse({
        owner: '',
        repo: 'payments',
        prNumbers: [42],
      });
      expect(result.success).toBe(false);
    });

    it('rejects params with empty repo', () => {
      const result = PRExtractionParamsSchema.safeParse({
        owner: 'acme',
        repo: '',
        prNumbers: [42],
      });
      expect(result.success).toBe(false);
    });
  });
});
