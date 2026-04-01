import type { AssembledArtefactSet } from './artefact-types';

export interface PromptPair {
  systemPrompt: string;
  userPrompt: string;
}

export const QUESTION_GENERATION_SYSTEM_PROMPT = `You are a software comprehension assessor. Your task is to generate short-answer questions that test whether a developer truly understands a set of development artefacts, using Peter Naur's Theory Building framework.

## Framework: Peter Naur's Theory Building

Naur argues that programming is fundamentally about building a "theory" — a mental model that connects the problem domain to the code. A developer who holds this theory can explain not just what the code does, but why it exists, why it is structured the way it is, and how to safely change it. Your questions must probe all three layers of this theory:

### World-to-program mapping (domain-to-code correspondence)
Test whether the developer understands how real-world affairs are reflected in the program structure — which aspects of the domain the program handles, and why others were left out. Questions must test domain-to-code correspondence: how domain concepts map to data models, type systems, and module boundaries. Do NOT ask about project history, the motivation for creating a specific file, or the development process. Do NOT ask about session logs, issue trackers, or workflow decisions. Example patterns: "Which domain concept does X represent in the code?", "How do the domain entities map to the data model / type system?", "What aspects of the domain are deliberately not modelled, and why?", "What real-world behaviours does this feature handle, and which are excluded by design?"

### Design justification (structural decisions)
Test whether the developer understands why key structural decisions were made — module boundaries, data model choices, integration approach — not just what they are. Where the artefacts do not record a justification, note that explicitly in the reference answer rather than inferring one. Example patterns: "Why was this approach chosen?", "What are the trade-offs?", "Why is this boundary drawn here?"

### Modification capacity (safe change paths)
Test whether the developer could safely make a specific type of change — adding a new rule, extending an integration, handling a new edge case — without breaking existing behaviour. Questions should describe concrete change scenarios and ask the developer to reason about dependencies, constraints, and risks. Example patterns: "What would break if we changed X?", "How would you extend this to handle Y?", "What dependencies must you account for?"

## Output Format

Respond with a JSON object matching this exact schema:

{
  "questions": [
    {
      "question_number": 1,
      "question_text": "Your question here",
      "weight": 1,
      "naur_layer": "world_to_program",
      "reference_answer": "The expected answer derived from the artefacts"
    }
  ],
  "artefact_quality": "code_only",
  "artefact_quality_note": "Brief note on what artefacts were available",
  "additional_context_suggestions": [
    {
      "artefact_type": "design_document",
      "description": "Architecture or design document explaining the module boundaries",
      "expected_benefit": "Would enable deeper design justification questions about structural decisions"
    }
  ]
}

- question_number: Sequential integer starting at 1
- question_text: Short-answer question (not multiple choice)
- weight: Integer 1-3 reflecting importance (3 = critical to understanding)
- naur_layer: One of "world_to_program", "design_justification", "modification_capacity"
- reference_answer: The answer a developer with full understanding should give, derived strictly from the provided artefacts
- artefact_quality: One of "code_only", "code_and_tests", "code_and_requirements", "code_and_design", "code_requirements_and_design"
- artefact_quality_note: Explain what categories of artefacts were available and any gaps
- additional_context_suggestions: Optional array of objects describing extra artefacts that would improve question quality. Omit if the provided artefacts are sufficient. Each object has:
  - artefact_type: Category of the missing artefact (e.g. "design_document", "adr", "requirements_spec", "api_documentation", "deployment_config", "domain_glossary")
  - description: What specific artefact or information is missing
  - expected_benefit: How having this artefact would improve the generated questions

## Constraints

- Generate exactly the number of questions specified in the assessment context.
- Distribute questions across all three Naur layers. Every assessment must include at least one question from each layer (when question count >= 3).
- Derive all reference answers strictly from the provided artefacts. Do not invent context.
- If artefacts are insufficient for a particular layer, generate the best question you can and note the limitation in the reference answer.
- Flag artefact quality accurately based on what was provided.
- If the provided artefacts are missing context that would help you generate deeper or more targeted questions, include additional_context_suggestions describing what extra artefacts would help and why. Only suggest artefacts that would materially improve question quality — do not suggest artefacts for completeness. Omit the field entirely if the provided artefacts are sufficient.
- Focus questions on architectural reasoning, design intent, domain understanding, and the ability to make safe judgements about change — not on low-level implementation details. A useful test: if a developer could answer the question by reading the code for 30 seconds (variable names, default values, specific syntax, line-level logic), the question is too shallow. Good questions test understanding that persists after the developer has moved on to other work — the kind of knowledge that matters when deciding whether a proposed change is safe, not when recalling how a function is currently implemented. This applies across all three Naur layers: even "modification capacity" questions should test reasoning about dependencies and risks, not recall of specific code paths.`;

export function buildQuestionGenerationPrompt(
  artefacts: AssembledArtefactSet,
): PromptPair {
  return {
    systemPrompt: QUESTION_GENERATION_SYSTEM_PROMPT,
    userPrompt: formatUserPrompt(artefacts),
  };
}

export function formatOrganisationContext(
  artefacts: AssembledArtefactSet,
): string | undefined {
  const ctx = artefacts.organisation_context;
  if (!ctx) return undefined;

  const sections: string[] = [];

  if (ctx.domain_vocabulary?.length) {
    const terms = ctx.domain_vocabulary
      .map(v => `- **${v.term}**: ${v.definition}`)
      .join('\n');
    sections.push(
      `### Domain Vocabulary\n\n`
      + `The following terms have specific meaning `
      + `in this codebase:\n\n${terms}`,
    );
  }

  if (ctx.focus_areas?.length) {
    const areas = ctx.focus_areas.map(a => `- ${a}`).join('\n');
    sections.push(
      `### Focus Areas\n\n`
      + `The organisation has asked that questions `
      + `emphasise these areas where possible:\n\n${areas}`,
    );
  }

  if (ctx.exclusions?.length) {
    const excl = ctx.exclusions.map(e => `- ${e}`).join('\n');
    sections.push(
      `### Exclusions\n\n`
      + `Do not generate questions about the following `
      + `areas (they are being decommissioned or are `
      + `out of scope):\n\n${excl}`,
    );
  }

  if (ctx.domain_notes?.trim()) {
    sections.push(`### Additional Context\n\n${ctx.domain_notes}`);
  }

  if (!sections.length) return undefined;

  return `## Organisation Context\n\n${sections.join('\n\n')}`;
}

function formatUserPrompt(artefacts: AssembledArtefactSet): string {
  const sections: (string | undefined)[] = [
    formatAssessmentContext(artefacts),
    formatOrganisationContext(artefacts),
    formatPrDescription(artefacts),
    formatLinkedIssues(artefacts),
    formatFileListingTable(artefacts),
    formatContextDocuments(artefacts),
    `## Code Diff\n\n${artefacts.pr_diff}`,
    formatFileContents(artefacts),
    formatTestFiles(artefacts),
    formatTruncationNotice(artefacts),
  ];

  return sections.filter(Boolean).join('\n\n');
}

function formatAssessmentContext(artefacts: AssembledArtefactSet): string {
  return `## Assessment Context\n\n- Type: ${artefacts.artefact_type}\n- Question count: ${artefacts.question_count}`;
}

function formatPrDescription(artefacts: AssembledArtefactSet): string | undefined {
  if (!artefacts.pr_description?.trim()) return undefined;
  return `## PR Description\n\n${artefacts.pr_description}`;
}

function formatLinkedIssues(artefacts: AssembledArtefactSet): string | undefined {
  if (!artefacts.linked_issues?.length) return undefined;
  const issues = artefacts.linked_issues
    .map(issue => `### Issue: ${issue.title}\n\n${issue.body}`)
    .join('\n\n');
  return `## Linked Issues\n\n${issues}`;
}

function formatFileListingTable(artefacts: AssembledArtefactSet): string {
  const header = '| File | Status | +/- |\n|------|--------|-----|';
  const rows = artefacts.file_listing
    .map(f => `| ${f.path} | ${f.status} | +${f.additions} -${f.deletions} |`)
    .join('\n');
  return `## Changed Files Overview\n\n${header}\n${rows}`;
}

function formatContextDocuments(artefacts: AssembledArtefactSet): string | undefined {
  if (!artefacts.context_files?.length) return undefined;
  const docs = artefacts.context_files
    .map(f => `### ${f.path}\n\n${f.content}`)
    .join('\n\n');
  return `## Context Documents\n\n${docs}`;
}

function formatFileContents(artefacts: AssembledArtefactSet): string | undefined {
  if (!artefacts.file_contents.length) return undefined;
  const files = artefacts.file_contents
    .map(f => `### ${f.path}\n\n${f.content}`)
    .join('\n\n');
  return `## Full File Contents (selected)\n\n${files}`;
}

function formatTestFiles(artefacts: AssembledArtefactSet): string | undefined {
  if (!artefacts.test_files?.length) return undefined;
  const tests = artefacts.test_files
    .map(f => `### ${f.path}\n\n${f.content}`)
    .join('\n\n');
  return `## Test Files (selected)\n\n${tests}`;
}

function formatTruncationNotice(artefacts: AssembledArtefactSet): string | undefined {
  if (!artefacts.truncation_notes?.length) return undefined;
  const items = artefacts.truncation_notes.map(n => `- ${n}`).join('\n');
  return `## Truncation Notice\n\nSome artefacts were truncated or dropped to fit the token budget:\n\n${items}\n\nDerive your reference answers only from the artefacts provided. Note any limitations caused by truncation.`;
}
