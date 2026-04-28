import { describe, it, expect } from 'vitest';
import {
  buildQuestionGenerationPrompt,
  depthInstruction,
  QUESTION_GENERATION_SYSTEM_PROMPT,
  REFLECTION_INSTRUCTION,
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

    expect(systemPrompt).toContain(QUESTION_GENERATION_SYSTEM_PROMPT);
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

describe('formatOrganisationContext in user prompt', () => {
  const baseArtefacts: AssembledArtefactSet = {
    artefact_type: 'pull_request',
    pr_description: 'Some PR',
    pr_diff: 'diff',
    file_listing: [{ path: 'f.ts', additions: 1, deletions: 0, status: 'added' }],
    file_contents: [{ path: 'f.ts', content: 'code' }],
    question_count: 3,
    artefact_quality: 'code_only',
    token_budget_applied: false,
  };

  it('returns no Organisation Context section when organisation_context is not present', () => {
    const { userPrompt } = buildQuestionGenerationPrompt(baseArtefacts);
    expect(userPrompt).not.toContain('## Organisation Context');
  });

  it('returns no Organisation Context section when organisation_context is an empty object', () => {
    const { userPrompt } = buildQuestionGenerationPrompt({
      ...baseArtefacts,
      organisation_context: {},
    });
    expect(userPrompt).not.toContain('## Organisation Context');
  });

  it('formats domain_vocabulary as a term-definition list', () => {
    const { userPrompt } = buildQuestionGenerationPrompt({
      ...baseArtefacts,
      organisation_context: {
        domain_vocabulary: [
          { term: 'FCS', definition: 'Feature Comprehension Score' },
          { term: 'PRCC', definition: 'PR Comprehension Check' },
        ],
      },
    });
    expect(userPrompt).toContain('### Domain Vocabulary');
    expect(userPrompt).toContain('- **FCS**: Feature Comprehension Score');
    expect(userPrompt).toContain('- **PRCC**: PR Comprehension Check');
  });

  it('formats focus_areas as a bulleted list under the correct heading', () => {
    const { userPrompt } = buildQuestionGenerationPrompt({
      ...baseArtefacts,
      organisation_context: { focus_areas: ['security', 'performance'] },
    });
    expect(userPrompt).toContain('### Focus Areas');
    expect(userPrompt).toContain('- security');
    expect(userPrompt).toContain('- performance');
  });

  it('formats exclusions as a bulleted list under the correct heading', () => {
    const { userPrompt } = buildQuestionGenerationPrompt({
      ...baseArtefacts,
      organisation_context: { exclusions: ['legacy-module'] },
    });
    expect(userPrompt).toContain('### Exclusions');
    expect(userPrompt).toContain('- legacy-module');
  });

  it('formats domain_notes as plain text under Additional Context', () => {
    const { userPrompt } = buildQuestionGenerationPrompt({
      ...baseArtefacts,
      organisation_context: { domain_notes: 'We use event sourcing.' },
    });
    expect(userPrompt).toContain('### Additional Context');
    expect(userPrompt).toContain('We use event sourcing.');
  });

  it('combines multiple sections with correct headings and spacing', () => {
    const { userPrompt } = buildQuestionGenerationPrompt({
      ...baseArtefacts,
      organisation_context: {
        focus_areas: ['security'],
        exclusions: ['legacy'],
        domain_notes: 'Notes here.',
      },
    });
    expect(userPrompt).toContain('## Organisation Context');
    expect(userPrompt).toContain('### Focus Areas');
    expect(userPrompt).toContain('### Exclusions');
    expect(userPrompt).toContain('### Additional Context');
  });

  it('omits a section whose array is empty', () => {
    const { userPrompt } = buildQuestionGenerationPrompt({
      ...baseArtefacts,
      organisation_context: {
        focus_areas: [],
        exclusions: ['legacy'],
      },
    });
    expect(userPrompt).not.toContain('### Focus Areas');
    expect(userPrompt).toContain('### Exclusions');
  });

  it('includes Organisation Context before PR description', () => {
    const { userPrompt } = buildQuestionGenerationPrompt({
      ...baseArtefacts,
      organisation_context: { focus_areas: ['security'] },
    });
    const orgIdx = userPrompt.indexOf('## Organisation Context');
    const prIdx = userPrompt.indexOf('## PR Description');
    expect(orgIdx).toBeGreaterThan(-1);
    expect(prIdx).toBeGreaterThan(-1);
    expect(orgIdx).toBeLessThan(prIdx);
  });
});

describe('QUESTION_GENERATION_SYSTEM_PROMPT', () => {
  it('contains all three Naur layer definitions', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('World-to-program mapping');
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('Design justification');
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('Modification capacity');
  });

  describe('world-to-program layer focuses on domain-to-code mapping', () => {
    it('includes domain-object-to-code-structure example patterns', () => {
      expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
        'Which domain concept does',
      );
      expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
        'How do the domain entities map to the data model',
      );
      expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
        'What aspects of the domain are deliberately not modelled',
      );
      expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
        'What real-world behaviours does this feature handle',
      );
    });

    it('does not contain motivation-focused example patterns', () => {
      expect(QUESTION_GENERATION_SYSTEM_PROMPT).not.toContain(
        'Why does this code exist?',
      );
    });

    it('includes negative guidance against project history questions', () => {
      expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
        'Do NOT ask about project history',
      );
      expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
        'Do NOT ask about session logs',
      );
    });

    it('includes question depth constraint rejecting shallow recall questions', () => {
      expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
        'Focus questions on architectural reasoning',
      );
      expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
        'not on low-level implementation details',
      );
    });

    it('constraint text references all three Naur layers', () => {
      expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
        'This applies across all three Naur layers',
      );
      expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
        'modification capacity',
      );
    });

    it('constraint references the 30-second test for shallowness', () => {
      expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
        'reading the code for 30 seconds',
      );
      expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
        'variable names, default values, specific syntax, line-level logic',
      );
    });
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

describe('buildQuestionGenerationPrompt hint instruction', () => {
  const baseArtefacts: AssembledArtefactSet = {
    artefact_type: 'pull_request',
    pr_description: 'Fix race condition in payment processor',
    pr_diff: '--- a/src/pay.ts\n+++ b/src/pay.ts\n@@ -1 +1 @@\n-old\n+new',
    file_listing: [
      { path: 'src/pay.ts', additions: 5, deletions: 2, status: 'modified' },
    ],
    file_contents: [
      { path: 'src/pay.ts', content: 'export function pay() {}' },
    ],
    question_count: 3,
    artefact_quality: 'code_only',
    token_budget_applied: false,
  };

  describe('Given any assembled artefact set', () => {
    it('then the system prompt includes a hint generation instruction', () => {
      const { systemPrompt } = buildQuestionGenerationPrompt(baseArtefacts);

      // The contract requires the LLM be instructed to produce a `hint` field.
      // We check for a recognisable substring without over-specifying exact wording.
      expect(systemPrompt.toLowerCase()).toContain('hint');
    });
  });
});

// ---------------------------------------------------------------------------
// Story 2.2 — Depth-aware rubric generation (#223)
// ---------------------------------------------------------------------------

describe('buildQuestionGenerationPrompt — depth-aware system prompt', () => {
  // Reuse the fixture defined in the first describe block by redeclaring a
  // minimal variant here. The full fixture is not exported, so we declare a
  // slim one sufficient for systemPrompt assertions.
  const baseArtefacts: AssembledArtefactSet = {
    artefact_type: 'pull_request',
    pr_description: 'Fix race condition in payment processor',
    pr_diff: '--- a/src/pay.ts\n+++ b/src/pay.ts\n@@ -1 +1 @@\n-old\n+new',
    file_listing: [
      { path: 'src/pay.ts', additions: 5, deletions: 2, status: 'modified' },
    ],
    file_contents: [
      { path: 'src/pay.ts', content: 'export function pay() {}' },
    ],
    question_count: 3,
    artefact_quality: 'code_only',
    token_budget_applied: false,
  };

  describe('Given depth is "conceptual"', () => {
    it('includes conceptual depth instruction when depth is "conceptual"', () => {
      // [lld §Story 2.2 — conceptual block]
      const artefacts: AssembledArtefactSet = { ...baseArtefacts, comprehension_depth: 'conceptual' };
      const { systemPrompt } = buildQuestionGenerationPrompt(artefacts);

      expect(systemPrompt).toContain('CONCEPTUAL depth');
    });

    it('conceptual system prompt references reasoning about approach', () => {
      // [lld §Story 2.2 — conceptual block: "test reasoning about approach, constraints, and rationale"]
      const artefacts: AssembledArtefactSet = { ...baseArtefacts, comprehension_depth: 'conceptual' };
      const { systemPrompt } = buildQuestionGenerationPrompt(artefacts);

      expect(systemPrompt).toContain('reasoning about approach');
    });

    it('conceptual system prompt instructs against requiring specific identifiers', () => {
      // [lld §Story 2.2 — conceptual block: "WITHOUT requiring specific identifier names"]
      const artefacts: AssembledArtefactSet = { ...baseArtefacts, comprehension_depth: 'conceptual' };
      const { systemPrompt } = buildQuestionGenerationPrompt(artefacts);

      expect(systemPrompt).toContain('WITHOUT requiring specific identifier names');
    });

    it('conceptual system prompt still contains the base QUESTION_GENERATION_SYSTEM_PROMPT', () => {
      // [lld §Story 2.2 — depth instruction is appended to the base, not a replacement]
      const artefacts: AssembledArtefactSet = { ...baseArtefacts, comprehension_depth: 'conceptual' };
      const { systemPrompt } = buildQuestionGenerationPrompt(artefacts);

      expect(systemPrompt).toContain(QUESTION_GENERATION_SYSTEM_PROMPT);
    });
  });

  describe('Given depth is "detailed"', () => {
    it('includes detailed depth instruction when depth is "detailed"', () => {
      // [lld §Story 2.2 — detailed block]
      const artefacts: AssembledArtefactSet = { ...baseArtefacts, comprehension_depth: 'detailed' };
      const { systemPrompt } = buildQuestionGenerationPrompt(artefacts);

      expect(systemPrompt).toContain('DETAILED depth');
    });

    it('detailed system prompt references specific type names and file paths', () => {
      // [lld §Story 2.2 — detailed block: "specific type names, file paths, and function signatures"]
      const artefacts: AssembledArtefactSet = { ...baseArtefacts, comprehension_depth: 'detailed' };
      const { systemPrompt } = buildQuestionGenerationPrompt(artefacts);

      expect(systemPrompt).toContain('specific type names');
    });

    it('detailed system prompt frames identifiers as probe anchors, not the answer', () => {
      // [lld §Story 2.2 — detailed block: identifiers anchor the question, they are not the answer being elicited]
      const artefacts: AssembledArtefactSet = { ...baseArtefacts, comprehension_depth: 'detailed' };
      const { systemPrompt } = buildQuestionGenerationPrompt(artefacts);

      expect(systemPrompt).toContain('not the answer being elicited');
    });

    it('detailed system prompt forbids recall-shaped questions', () => {
      // [lld §Story 2.2 — detailed block: "Avoid recall shapes"]
      const artefacts: AssembledArtefactSet = { ...baseArtefacts, comprehension_depth: 'detailed' };
      const { systemPrompt } = buildQuestionGenerationPrompt(artefacts);

      expect(systemPrompt).toContain('Avoid recall shapes');
    });

    it('detailed system prompt still contains the base QUESTION_GENERATION_SYSTEM_PROMPT', () => {
      // [lld §Story 2.2 — depth instruction is appended to the base, not a replacement]
      const artefacts: AssembledArtefactSet = { ...baseArtefacts, comprehension_depth: 'detailed' };
      const { systemPrompt } = buildQuestionGenerationPrompt(artefacts);

      expect(systemPrompt).toContain(QUESTION_GENERATION_SYSTEM_PROMPT);
    });
  });

  describe('Given depth is undefined', () => {
    it('defaults to conceptual instruction when depth is undefined', () => {
      // [lld §Invariant 2: "Default depth is 'conceptual'"]
      const artefacts: AssembledArtefactSet = { ...baseArtefacts };
      // comprehension_depth intentionally absent
      const { systemPrompt } = buildQuestionGenerationPrompt(artefacts);

      expect(systemPrompt).toContain('CONCEPTUAL depth');
    });

    it('does not include detailed depth instruction when depth is undefined', () => {
      // [lld §Invariant 2: default is conceptual, not detailed]
      const artefacts: AssembledArtefactSet = { ...baseArtefacts };
      const { systemPrompt } = buildQuestionGenerationPrompt(artefacts);

      expect(systemPrompt).not.toContain('DETAILED depth');
    });
  });
});

describe('depthInstruction', () => {
  it('returns conceptual instruction text for "conceptual"', () => {
    // [lld §Story 2.2 — conceptual block]
    const result = depthInstruction('conceptual');

    expect(result).toContain('CONCEPTUAL depth');
  });

  it('conceptual instruction references reasoning about approach and rationale', () => {
    // [lld §Story 2.2 — conceptual block: "reasoning about approach, constraints, and rationale"]
    const result = depthInstruction('conceptual');

    expect(result).toContain('reasoning about approach');
  });

  it('returns detailed instruction text for "detailed"', () => {
    // [lld §Story 2.2 — detailed block]
    const result = depthInstruction('detailed');

    expect(result).toContain('DETAILED depth');
  });

  it('detailed instruction references specific type names and file paths', () => {
    // [lld §Story 2.2 — detailed block: "specific type names, file paths, and function signatures"]
    const result = depthInstruction('detailed');

    expect(result).toContain('specific type names');
  });
});

// ---------------------------------------------------------------------------
// Story 1.1 — Scaffolding hints (#311)
// ---------------------------------------------------------------------------

describe('QUESTION_GENERATION_SYSTEM_PROMPT — scaffolding hints (Story 1.1)', () => {
  it('instructs the LLM to produce landmark-style hints', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('code landmark');
  });

  it('includes a positive example of a landmark hint', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('validatePath');
  });

  it('includes a negative example of a format-style hint', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('restates the question');
  });

  it('instructs to set hint to null when no landmark exists', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT.toLowerCase()).toContain(
      'no obvious code landmark',
    );
  });

  // #336 — LLM output tolerance: hard char limit replaced with brevity guidance.
  it('does not contain a hard character limit for hints', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).not.toContain('max 200 characters');
  });

  it('contains brevity guidance for hints', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('concise');
  });

  it('retains the non-disclosure constraint', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('WITHOUT revealing');
  });
});

// ---------------------------------------------------------------------------
// Story 1.4 — Theory-building question focus (#311)
// ---------------------------------------------------------------------------

describe('QUESTION_GENERATION_SYSTEM_PROMPT — theory-building focus (Story 1.4)', () => {
  it('includes a system-specific knowledge constraint', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
      'specific to THIS system',
    );
  });

  it('includes a positive example of a system-specific question', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
      'requires knowing the specific design decision',
    );
  });

  it('includes a negative example of a generic-knowledge question', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
      'any engineer would answer',
    );
  });

  it('instructs reference answers to define 2–3 essential points', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
      '2–3 essential points',
    );
  });
});

// ---------------------------------------------------------------------------
// Story 1.2 — Depth enforcement (#311)
// ---------------------------------------------------------------------------

describe('CONCEPTUAL_DEPTH_INSTRUCTION — depth enforcement (Story 1.2)', () => {
  it('includes a DO NOT constraint against specific identifiers', () => {
    const instruction = depthInstruction('conceptual');
    expect(instruction).toContain(
      'DO NOT use specific type names, file paths, or function signatures',
    );
  });

  it('includes a negative example question with specific identifiers', () => {
    const instruction = depthInstruction('conceptual');
    expect(instruction).toContain('tool-loop.ts');
  });

  it('includes a positive example question without specific identifiers', () => {
    const instruction = depthInstruction('conceptual');
    expect(instruction).toContain(
      'Why is the tool execution logic kept separate',
    );
  });
});

describe('DETAILED_DEPTH_INSTRUCTION — depth enforcement (Story 1.2)', () => {
  it('includes a DO NOT constraint against pure-recall questions', () => {
    const instruction = depthInstruction('detailed');
    expect(instruction).toContain(
      'DO NOT generate pure-recall questions',
    );
  });

  it('includes a negative example of a recall question', () => {
    const instruction = depthInstruction('detailed');
    expect(instruction).toContain('tests file-system recall');
  });

  it('includes a positive example of a reasoning question anchored in specifics', () => {
    const instruction = depthInstruction('detailed');
    expect(instruction).toContain(
      'pass an empty tools array',
    );
  });
});

// ---------------------------------------------------------------------------
// V10 E1 Story 1.1 — Embedded reflection in question generation (#385)
// ---------------------------------------------------------------------------

describe('REFLECTION_INSTRUCTION — V10 embedded reflection (Story 1.1)', () => {
  it('contains the reflection section header', () => {
    expect(REFLECTION_INSTRUCTION).toContain('## Reflection: Draft, Critique, Rewrite');
  });

  it('names the rationale probe', () => {
    expect(REFLECTION_INSTRUCTION).toContain('Rationale probe');
  });

  it('names the depth probe', () => {
    expect(REFLECTION_INSTRUCTION).toContain('Depth probe');
  });

  it('names the theory persistence probe', () => {
    expect(REFLECTION_INSTRUCTION).toContain('Theory persistence probe');
  });

  it('instructs the model not to drop failing candidates', () => {
    expect(REFLECTION_INSTRUCTION).toContain('Do not drop failing candidates');
  });

  it('instructs regeneration of reference_answer and hint for rewritten questions', () => {
    expect(REFLECTION_INSTRUCTION).toContain('Regenerate `reference_answer` and `hint`');
  });

  it('instructs output of only post-critique questions', () => {
    expect(REFLECTION_INSTRUCTION).toContain('post-critique questions in the JSON response');
  });
});

describe('buildQuestionGenerationPrompt — reflection included in system prompt', () => {
  const minimalArtefacts: AssembledArtefactSet = {
    artefact_type: 'pull_request',
    pr_diff: 'diff',
    file_listing: [{ path: 'f.ts', additions: 1, deletions: 0, status: 'added' }],
    file_contents: [{ path: 'f.ts', content: 'code' }],
    question_count: 3,
    artefact_quality: 'code_only',
    token_budget_applied: false,
  };

  it('includes reflection instruction in system prompt', () => {
    const { systemPrompt } = buildQuestionGenerationPrompt(minimalArtefacts);
    expect(systemPrompt).toContain('## Reflection: Draft, Critique, Rewrite');
  });

  it('positions reflection after constraints and before depth instruction', () => {
    const { systemPrompt } = buildQuestionGenerationPrompt(minimalArtefacts);
    const constraintsPos = systemPrompt.indexOf('## Constraints');
    const reflectionPos = systemPrompt.indexOf('## Reflection');
    const depthPos = systemPrompt.indexOf('## Comprehension Depth');
    expect(reflectionPos).toBeGreaterThan(constraintsPos);
    expect(depthPos).toBeGreaterThan(reflectionPos);
  });
});

describe('QUESTION_GENERATION_SYSTEM_PROMPT — existing constraints preserved (V10 invariant)', () => {
  it('retains the generate-exactly constraint', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain(
      'Generate exactly the number of questions specified',
    );
  });

  it('retains the system-specific knowledge constraint', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('specific to THIS system');
  });
});
