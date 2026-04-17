/**
 * Tests for evaluateArtefactQuality — §11.1a pure engine function.
 *
 * LLM error-code → reason mapping used in this file:
 *   validation_failed  → reason: 'validation_failed'   (contract says: schema mismatch)
 *   malformed_response → reason: 'validation_failed'   (LLD §11.1a: cannot produce valid output)
 *   network_error      → reason: 'timeout'             (OpenAI SDK surfaces connection timeout as network_error)
 *   rate_limit         → reason: 'llm_failed'          (transient server-side refusal)
 *   server_error       → reason: 'llm_failed'          (5xx from the provider)
 *   unknown            → reason: 'llm_failed'          (catch-all)
 *
 * This mapping is consistent with the LLD §11.1a discriminated union:
 *   'llm_failed' | 'timeout' | 'validation_failed'
 */

import { describe, it, expect, vi } from 'vitest';
import { evaluateArtefactQuality } from '@/lib/engine/quality/evaluate-quality';
import {
  ArtefactQualityResponseSchema,
  type ArtefactQualityDimension,
} from '@/lib/engine/llm/schemas';
import { createMockLLMClient } from '../../../fixtures/llm/mock-llm-client';
import { aggregateDimensions } from '@/lib/engine/quality/aggregate-dimensions';
import type { RawArtefactSet } from '@/lib/engine/prompts/artefact-types';
import type { EvaluateQualityRequest } from '@/lib/engine/quality/evaluate-quality';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const minimalRaw: RawArtefactSet = {
  artefact_type: 'pull_request',
  pr_diff: '--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-old\n+new',
  file_listing: [
    { path: 'src/foo.ts', additions: 1, deletions: 1, status: 'modified' },
  ],
  file_contents: [],
};

const richRaw: RawArtefactSet = {
  ...minimalRaw,
  pr_description: 'Implement rate-limiting middleware to prevent abuse.',
  linked_issues: [
    { title: 'Rate limiting spike', body: 'We need to add rate limiting to prevent API abuse.' },
  ],
  test_files: [
    { path: 'tests/middleware/rate-limit.test.ts', content: 'it("limits requests", () => {})' },
  ],
  context_files: [
    { path: 'docs/design/adr-0042-rate-limiting.md', content: '# ADR-0042: Rate Limiting' },
  ],
};

function makeAllHighDimensions(): ArtefactQualityDimension[] {
  return [
    { key: 'pr_description',   sub_score: 90, category: 'detailed',  rationale: 'Thorough description.' },
    { key: 'linked_issues',    sub_score: 90, category: 'detailed',  rationale: 'Issues linked and detailed.' },
    { key: 'design_documents', sub_score: 90, category: 'detailed',  rationale: 'ADR present.' },
    { key: 'commit_messages',  sub_score: 90, category: 'detailed',  rationale: 'Good commit messages.' },
    { key: 'test_coverage',    sub_score: 90, category: 'detailed',  rationale: 'Tests present.' },
    { key: 'adr_references',   sub_score: 90, category: 'detailed',  rationale: 'ADR referenced.' },
  ];
}

function makeAllLowDimensions(): ArtefactQualityDimension[] {
  return [
    { key: 'pr_description',   sub_score: 0, category: 'empty', rationale: 'No description.' },
    { key: 'linked_issues',    sub_score: 0, category: 'empty', rationale: 'No issues linked.' },
    { key: 'design_documents', sub_score: 0, category: 'empty', rationale: 'No design docs.' },
    { key: 'commit_messages',  sub_score: 60, category: 'minimal', rationale: 'Basic commit messages.' },
    { key: 'test_coverage',    sub_score: 60, category: 'minimal', rationale: 'Partial tests.' },
    { key: 'adr_references',   sub_score: 0, category: 'empty', rationale: 'No ADR references.' },
  ];
}

function makeQualityResponse(dimensions: ArtefactQualityDimension[]) {
  return { dimensions };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('evaluateArtefactQuality', () => {

  // Property 1 — LLM client called exactly once with ArtefactQualityResponseSchema
  describe('Given a valid artefact set', () => {
    it('then it calls the LLM client exactly once with ArtefactQualityResponseSchema', async () => {
      const generateStructured = vi.fn().mockResolvedValue({
        success: true,
        data: makeQualityResponse(makeAllHighDimensions()),
      });
      const llmClient = { generateStructured };

      await evaluateArtefactQuality({ raw: minimalRaw, llmClient });

      expect(generateStructured).toHaveBeenCalledOnce();
      const call = generateStructured.mock.calls[0]![0];
      expect(call.schema).toBe(ArtefactQualityResponseSchema);
    });
  });

  // Property 2 — LLM client called with prompts from buildArtefactQualityPrompt
  describe('Given a valid artefact set', () => {
    it('then it passes systemPrompt and prompt (userPrompt) built from the raw artefacts', async () => {
      const generateStructured = vi.fn().mockResolvedValue({
        success: true,
        data: makeQualityResponse(makeAllHighDimensions()),
      });
      const llmClient = { generateStructured };

      await evaluateArtefactQuality({ raw: minimalRaw, llmClient });

      const call = generateStructured.mock.calls[0]![0];
      expect(typeof call.systemPrompt).toBe('string');
      expect(call.systemPrompt.length).toBeGreaterThan(0);
      expect(typeof call.prompt).toBe('string');
      expect(call.prompt.length).toBeGreaterThan(0);
      // The user prompt must embed the diff without truncation (property 29 mirror)
      expect(call.prompt).toContain(minimalRaw.pr_diff);
    });
  });

  // Property 3 — model and maxTokens overrides forwarded
  describe('Given optional model and maxTokens overrides', () => {
    it('then it forwards model and maxTokens to the LLM client', async () => {
      const generateStructured = vi.fn().mockResolvedValue({
        success: true,
        data: makeQualityResponse(makeAllHighDimensions()),
      });
      const llmClient = { generateStructured };

      const request: EvaluateQualityRequest = {
        raw: minimalRaw,
        llmClient,
        model: 'anthropic/claude-opus-4',
        maxTokens: 4096,
      };

      await evaluateArtefactQuality(request);

      expect(generateStructured).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'anthropic/claude-opus-4',
          maxTokens: 4096,
        }),
      );
    });
  });

  // Property 4 — success response shape
  describe('Given a successful LLM response with all six dimensions', () => {
    it('then it returns { status: "success", aggregate: integer 0–100, dimensions: array }', async () => {
      const responses = new Map([
        [ArtefactQualityResponseSchema, makeQualityResponse(makeAllHighDimensions())],
      ]);
      const llmClient = createMockLLMClient({ responses });

      const result = await evaluateArtefactQuality({ raw: minimalRaw, llmClient });

      expect(result.status).toBe('success');
      if (result.status !== 'success') return;

      expect(result.aggregate).toBeGreaterThanOrEqual(0);
      expect(result.aggregate).toBeLessThanOrEqual(100);
      expect(Number.isInteger(result.aggregate)).toBe(true);
      expect(Array.isArray(result.dimensions)).toBe(true);
    });
  });

  // Property 5 — returned dimensions match LLM output (same order, same objects)
  describe('Given a successful LLM response', () => {
    it('then it returns exactly the dimension array returned by the LLM, in the same order', async () => {
      const dims = makeAllHighDimensions();
      const responses = new Map([
        [ArtefactQualityResponseSchema, makeQualityResponse(dims)],
      ]);
      const llmClient = createMockLLMClient({ responses });

      const result = await evaluateArtefactQuality({ raw: minimalRaw, llmClient });

      expect(result.status).toBe('success');
      if (result.status !== 'success') return;

      expect(result.dimensions).toHaveLength(dims.length);
      result.dimensions.forEach((dim, i) => {
        expect(dim.key).toBe(dims[i]!.key);
        expect(dim.sub_score).toBe(dims[i]!.sub_score);
      });
    });
  });

  // Property 6 — aggregate equals aggregateDimensions(dimensions)
  describe('Given a successful LLM response', () => {
    it('then the returned aggregate equals aggregateDimensions applied to the returned dimensions', async () => {
      const dims = makeAllHighDimensions();
      const responses = new Map([
        [ArtefactQualityResponseSchema, makeQualityResponse(dims)],
      ]);
      const llmClient = createMockLLMClient({ responses });

      const result = await evaluateArtefactQuality({ raw: minimalRaw, llmClient });

      expect(result.status).toBe('success');
      if (result.status !== 'success') return;

      const expected = aggregateDimensions(result.dimensions);
      expect(result.aggregate).toBe(expected);
    });
  });

  // Property 7 — validation_failed → reason: 'validation_failed'
  describe('Given the LLM returns a validation_failed error', () => {
    it('then it returns { status: "unavailable", reason: "validation_failed" }', async () => {
      const llmClient = createMockLLMClient({
        error: { code: 'validation_failed', message: 'Schema mismatch' },
      });

      const result = await evaluateArtefactQuality({ raw: minimalRaw, llmClient });

      expect(result.status).toBe('unavailable');
      if (result.status !== 'unavailable') return;

      expect(result.reason).toBe('validation_failed');
      expect(result.error.code).toBe('validation_failed');
    });
  });

  // Property 8 — malformed_response → reason: 'validation_failed'
  describe('Given the LLM returns a malformed_response error', () => {
    it('then it returns { status: "unavailable", reason: "validation_failed" }', async () => {
      const llmClient = createMockLLMClient({
        error: { code: 'malformed_response', message: 'Invalid JSON from LLM' },
      });

      const result = await evaluateArtefactQuality({ raw: minimalRaw, llmClient });

      expect(result.status).toBe('unavailable');
      if (result.status !== 'unavailable') return;

      expect(result.reason).toBe('validation_failed');
      expect(result.error.code).toBe('malformed_response');
    });
  });

  // Property 9 — network_error → reason: 'timeout'
  describe('Given the LLM returns a network_error (connection timeout)', () => {
    it('then it returns { status: "unavailable", reason: "timeout" }', async () => {
      const llmClient = createMockLLMClient({
        error: { code: 'network_error', message: 'ECONNREFUSED' },
      });

      const result = await evaluateArtefactQuality({ raw: minimalRaw, llmClient });

      expect(result.status).toBe('unavailable');
      if (result.status !== 'unavailable') return;

      expect(result.reason).toBe('timeout');
      expect(result.error.code).toBe('network_error');
    });
  });

  // Property 10a — rate_limit → reason: 'llm_failed'
  describe('Given the LLM returns a rate_limit error', () => {
    it('then it returns { status: "unavailable", reason: "llm_failed" }', async () => {
      const llmClient = createMockLLMClient({
        error: { code: 'rate_limit', message: '429 Too Many Requests' },
      });

      const result = await evaluateArtefactQuality({ raw: minimalRaw, llmClient });

      expect(result.status).toBe('unavailable');
      if (result.status !== 'unavailable') return;

      expect(result.reason).toBe('llm_failed');
      expect(result.error.code).toBe('rate_limit');
    });
  });

  // Property 10b — server_error → reason: 'llm_failed'
  describe('Given the LLM returns a server_error', () => {
    it('then it returns { status: "unavailable", reason: "llm_failed" }', async () => {
      const llmClient = createMockLLMClient({
        error: { code: 'server_error', message: '500 Internal Server Error' },
      });

      const result = await evaluateArtefactQuality({ raw: minimalRaw, llmClient });

      expect(result.status).toBe('unavailable');
      if (result.status !== 'unavailable') return;

      expect(result.reason).toBe('llm_failed');
      expect(result.error.code).toBe('server_error');
    });
  });

  // Property 10c — unknown → reason: 'llm_failed'
  describe('Given the LLM returns an unknown error', () => {
    it('then it returns { status: "unavailable", reason: "llm_failed" }', async () => {
      const llmClient = createMockLLMClient({
        error: { code: 'unknown', message: 'Unexpected failure' },
      });

      const result = await evaluateArtefactQuality({ raw: minimalRaw, llmClient });

      expect(result.status).toBe('unavailable');
      if (result.status !== 'unavailable') return;

      expect(result.reason).toBe('llm_failed');
      expect(result.error.code).toBe('unknown');
    });
  });

  // Property 11 — high-quality BDD scenario: aggregate ≥ 80 with all dims at 90
  describe('Given artefacts with a detailed PR description, linked issues, ADRs, and tests', () => {
    it('then it returns aggregate ≥ 80 with high sub-scores on all dimensions', async () => {
      const dims = makeAllHighDimensions(); // all at sub_score 90
      const responses = new Map([
        [ArtefactQualityResponseSchema, makeQualityResponse(dims)],
      ]);
      const llmClient = createMockLLMClient({ responses });

      const result = await evaluateArtefactQuality({ raw: richRaw, llmClient });

      expect(result.status).toBe('success');
      if (result.status !== 'success') return;

      expect(result.aggregate).toBeGreaterThanOrEqual(80);
      const keys = result.dimensions.map(d => d.key);
      expect(keys).toContain('pr_description');
      expect(keys).toContain('linked_issues');
      expect(keys).toContain('adr_references');
      expect(keys).toContain('design_documents');
      expect(keys).toContain('test_coverage');
      expect(keys).toContain('commit_messages');
    });
  });

  // Property 12 — low-quality BDD scenario: intent-adjacent at 0, code-adjacent at 60 → aggregate ≤ 30
  describe('Given artefacts with code only and no description, no issues, no ADRs', () => {
    it('then it returns aggregate ≤ 30 with intent-adjacent dimensions at empty/none', async () => {
      const dims = makeAllLowDimensions();
      const responses = new Map([
        [ArtefactQualityResponseSchema, makeQualityResponse(dims)],
      ]);
      const llmClient = createMockLLMClient({ responses });

      const result = await evaluateArtefactQuality({ raw: minimalRaw, llmClient });

      expect(result.status).toBe('success');
      if (result.status !== 'success') return;

      expect(result.aggregate).toBeLessThanOrEqual(30);

      const intentAdjacentKeys = ['pr_description', 'linked_issues', 'design_documents', 'adr_references'] as const;
      for (const key of intentAdjacentKeys) {
        const dim = result.dimensions.find(d => d.key === key);
        expect(dim).toBeDefined();
        if (dim) {
          expect(dim.category).toMatch(/empty|none/i);
        }
      }
    });
  });

});
