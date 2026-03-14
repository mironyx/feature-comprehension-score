import { describe, it, expect } from 'vitest';
import {
  buildQuestionGenerationPrompt,
  QUESTION_GENERATION_SYSTEM_PROMPT,
} from '@/lib/engine/prompts/prompt-builder';
import type { AssembledArtefactSet } from '@/lib/engine/prompts/artefact-types';

describe('buildQuestionGenerationPrompt', () => {
  const fullArtefacts: AssembledArtefactSet = {
    artefact_type: 'pull_request',
    pr_description: 'Fix race condition in payment processor',
    pr_diff: '--- a/src/pay.ts\n+++ b/src/pay.ts\n@@ -1 +1 @@\n-old\n+new',
    file_listing: [
      { path: 'src/pay.ts', additions: 5, deletions: 2, status: 'modified' },
      { path: 'src/utils.ts', additions: 10, deletions: 0, status: 'added' },
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
    question_count: 3,
    artefact_quality: 'code_requirements_and_design',
    token_budget_applied: false,
  };

  it('builds prompt with all sections populated for full artefacts', () => {
    const { systemPrompt, userPrompt } = buildQuestionGenerationPrompt(fullArtefacts);

    expect(systemPrompt).toBe(QUESTION_GENERATION_SYSTEM_PROMPT);
    expect(userPrompt).toContain('pull_request');
    expect(userPrompt).toContain('3');
    expect(userPrompt).toContain('Fix race condition in payment processor');
    expect(userPrompt).toContain('Race condition bug');
    expect(userPrompt).toContain('src/pay.ts');
    expect(userPrompt).toContain('modified');
    expect(userPrompt).toContain('export function pay() {}');
    expect(userPrompt).toContain('Payment Design');
    expect(userPrompt).toContain('tests/pay.test.ts');
  });

  it('omits sections for absent artefacts in code-only set', () => {
    const codeOnly: AssembledArtefactSet = {
      artefact_type: 'pull_request',
      pr_diff: 'diff content',
      file_listing: [{ path: 'f.ts', additions: 1, deletions: 0, status: 'added' }],
      file_contents: [{ path: 'f.ts', content: 'code' }],
      question_count: 3,
      artefact_quality: 'code_only',
      token_budget_applied: false,
    };
    const { userPrompt } = buildQuestionGenerationPrompt(codeOnly);

    expect(userPrompt).not.toContain('## PR Description');
    expect(userPrompt).not.toContain('## Linked Issues');
    expect(userPrompt).not.toContain('## Context Documents');
    expect(userPrompt).not.toContain('## Test Files');
    expect(userPrompt).not.toContain('## Truncation Notice');
  });

  it('includes changed files overview table', () => {
    const { userPrompt } = buildQuestionGenerationPrompt(fullArtefacts);

    expect(userPrompt).toContain('## Changed Files Overview');
    expect(userPrompt).toContain('src/pay.ts');
    expect(userPrompt).toContain('+5');
    expect(userPrompt).toContain('-2');
  });

  it('includes assessment context with type and question count', () => {
    const { userPrompt } = buildQuestionGenerationPrompt(fullArtefacts);

    expect(userPrompt).toContain('## Assessment Context');
    expect(userPrompt).toContain('Type: pull_request');
    expect(userPrompt).toContain('Question count: 3');
  });

  it('references feature context for feature artefact type', () => {
    const feature: AssembledArtefactSet = {
      ...fullArtefacts,
      artefact_type: 'feature',
    };
    const { userPrompt } = buildQuestionGenerationPrompt(feature);

    expect(userPrompt).toContain('Type: feature');
  });

  it('omits PR Description section when pr_description is empty string', () => {
    const withEmpty: AssembledArtefactSet = {
      ...fullArtefacts,
      pr_description: '',
    };
    const { userPrompt } = buildQuestionGenerationPrompt(withEmpty);

    expect(userPrompt).not.toContain('## PR Description');
  });

  it('omits PR Description section when pr_description is whitespace only', () => {
    const withWhitespace: AssembledArtefactSet = {
      ...fullArtefacts,
      pr_description: '   \n  ',
    };
    const { userPrompt } = buildQuestionGenerationPrompt(withWhitespace);

    expect(userPrompt).not.toContain('## PR Description');
  });

  it('includes truncation notice when truncation_notes are present', () => {
    const truncated: AssembledArtefactSet = {
      ...fullArtefacts,
      token_budget_applied: true,
      truncation_notes: ['Code diff truncated', '2 of 3 test files dropped'],
    };
    const { userPrompt } = buildQuestionGenerationPrompt(truncated);

    expect(userPrompt).toContain('## Truncation Notice');
    expect(userPrompt).toContain('Code diff truncated');
    expect(userPrompt).toContain('2 of 3 test files dropped');
    expect(userPrompt).toContain('token budget');
  });

  it('omits truncation notice when truncation_notes is undefined', () => {
    const { userPrompt } = buildQuestionGenerationPrompt(fullArtefacts);

    expect(userPrompt).not.toContain('## Truncation Notice');
  });
});

describe('QUESTION_GENERATION_SYSTEM_PROMPT', () => {
  it('contains all three Naur layer definitions', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('World-to-program mapping');
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('Design justification');
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('Modification capacity');
  });

  it('contains JSON output format instructions', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('JSON');
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('questions');
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('question_text');
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('weight');
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('reference_answer');
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('naur_layer');
  });

  it('lists all artefact quality variants including code_and_design', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('code_and_design');
  });
});
