/**
 * Tests for buildArtefactQualityPrompt — §11.1a prompt builder.
 *
 * The system prompt contract (from LLD §11.1a):
 *   - Names all six dimension keys verbatim.
 *   - Explicitly states "do not generate questions" and "do not score answers".
 *   - Returns { systemPrompt, userPrompt }.
 *
 * The user prompt contract:
 *   - Embeds the PR diff without truncation.
 *   - Includes PR description when present.
 *   - Includes linked issue titles when present.
 *   - Produces a valid (non-empty) prompt even when only mandatory fields are present.
 */

import { describe, it, expect } from 'vitest';
import { buildArtefactQualityPrompt } from '@/lib/engine/quality/build-quality-prompt';
import type { RawArtefactSet } from '@/lib/engine/prompts/artefact-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const minimalRaw: RawArtefactSet = {
  artefact_type: 'pull_request',
  pr_diff: '--- a/src/bar.ts\n+++ b/src/bar.ts\n@@ -1 +1 @@\n-old\n+new',
  file_listing: [
    { path: 'src/bar.ts', additions: 1, deletions: 1, status: 'modified' },
  ],
  file_contents: [],
};

const fullRaw: RawArtefactSet = {
  ...minimalRaw,
  pr_description: 'Introduce circuit-breaker pattern to outbound HTTP clients.',
  linked_issues: [
    { title: 'Circuit breaker spike', body: 'We need resilience for downstream failures.' },
    { title: 'HTTP client timeout issue', body: 'Clients hang under load.' },
  ],
  test_files: [
    { path: 'tests/http-client.test.ts', content: 'it("breaks circuit", () => {})' },
  ],
  context_files: [
    { path: 'docs/design/adr-0099-circuit-breaker.md', content: '# ADR-0099' },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildArtefactQualityPrompt', () => {

  // Property 22 — returns { systemPrompt: string, userPrompt: string }
  describe('Given any RawArtefactSet', () => {
    it('then it returns an object with systemPrompt and userPrompt strings', () => {
      const result = buildArtefactQualityPrompt(minimalRaw);
      expect(typeof result.systemPrompt).toBe('string');
      expect(result.systemPrompt.length).toBeGreaterThan(0);
      expect(typeof result.userPrompt).toBe('string');
      expect(result.userPrompt.length).toBeGreaterThan(0);
    });
  });

  // Property 23 — systemPrompt names all six dimension keys verbatim
  describe('Given a RawArtefactSet', () => {
    it('then the systemPrompt contains the key "pr_description"', () => {
      const { systemPrompt } = buildArtefactQualityPrompt(minimalRaw);
      expect(systemPrompt).toContain('pr_description');
    });

    it('then the systemPrompt contains the key "linked_issues"', () => {
      const { systemPrompt } = buildArtefactQualityPrompt(minimalRaw);
      expect(systemPrompt).toContain('linked_issues');
    });

    it('then the systemPrompt contains the key "design_documents"', () => {
      const { systemPrompt } = buildArtefactQualityPrompt(minimalRaw);
      expect(systemPrompt).toContain('design_documents');
    });

    it('then the systemPrompt contains the key "commit_messages"', () => {
      const { systemPrompt } = buildArtefactQualityPrompt(minimalRaw);
      expect(systemPrompt).toContain('commit_messages');
    });

    it('then the systemPrompt contains the key "test_coverage"', () => {
      const { systemPrompt } = buildArtefactQualityPrompt(minimalRaw);
      expect(systemPrompt).toContain('test_coverage');
    });

    it('then the systemPrompt contains the key "adr_references"', () => {
      const { systemPrompt } = buildArtefactQualityPrompt(minimalRaw);
      expect(systemPrompt).toContain('adr_references');
    });
  });

  // Property 24a — systemPrompt instructs the LLM NOT to generate questions
  describe('Given a RawArtefactSet', () => {
    it('then the systemPrompt explicitly instructs the LLM not to generate questions', () => {
      const { systemPrompt } = buildArtefactQualityPrompt(minimalRaw);
      // The LLD specifies: "do not generate questions"
      expect(systemPrompt.toLowerCase()).toMatch(/do not generate questions/);
    });
  });

  // Property 24b — systemPrompt instructs the LLM NOT to score answers
  describe('Given a RawArtefactSet', () => {
    it('then the systemPrompt explicitly instructs the LLM not to score answers', () => {
      const { systemPrompt } = buildArtefactQualityPrompt(minimalRaw);
      // The LLD specifies: "do not score answers"
      expect(systemPrompt.toLowerCase()).toMatch(/do not score answers/);
    });
  });

  // Property 25 — userPrompt includes PR description when present
  describe('Given a RawArtefactSet with a PR description', () => {
    it('then the userPrompt includes the PR description text', () => {
      const { userPrompt } = buildArtefactQualityPrompt(fullRaw);
      expect(userPrompt).toContain(fullRaw.pr_description!);
    });
  });

  // Property 26 — userPrompt includes linked issue titles when present
  describe('Given a RawArtefactSet with linked issues', () => {
    it('then the userPrompt includes each linked issue title', () => {
      const { userPrompt } = buildArtefactQualityPrompt(fullRaw);
      for (const issue of fullRaw.linked_issues!) {
        expect(userPrompt).toContain(issue.title);
      }
    });
  });

  // Property 27 — userPrompt includes the PR diff verbatim
  describe('Given a RawArtefactSet', () => {
    it('then the userPrompt includes the PR diff verbatim', () => {
      const { userPrompt } = buildArtefactQualityPrompt(minimalRaw);
      expect(userPrompt).toContain(minimalRaw.pr_diff);
    });
  });

  // Property 28 — userPrompt produced when only mandatory fields present
  describe('Given a RawArtefactSet with only mandatory fields (pr_diff + file_listing)', () => {
    it('then it returns a valid non-empty userPrompt', () => {
      const { userPrompt } = buildArtefactQualityPrompt(minimalRaw);
      expect(userPrompt.length).toBeGreaterThan(0);
    });
  });

  // Property 29 — userPrompt embeds artefact set without truncation (2000-char diff)
  describe('Given a RawArtefactSet with a 2000-character PR diff', () => {
    it('then the full diff appears in the userPrompt without truncation', () => {
      const longDiff = 'x'.repeat(2000);
      const rawWithLongDiff: RawArtefactSet = {
        ...minimalRaw,
        pr_diff: longDiff,
      };
      const { userPrompt } = buildArtefactQualityPrompt(rawWithLongDiff);
      expect(userPrompt).toContain(longDiff);
    });
  });

});
