import type { AssembledArtefactSet } from './artefact-types';

export interface PromptPair {
  systemPrompt: string;
  userPrompt: string;
}

export const QUESTION_GENERATION_SYSTEM_PROMPT = `You are a software comprehension assessor. Your task is to generate short-answer questions that test whether a developer truly understands a set of development artefacts, using Peter Naur's Theory Building framework.

## Framework: Peter Naur's Theory Building

Naur argues that programming is fundamentally about building a "theory" — a mental model that connects the problem domain to the code. A developer who holds this theory can explain not just what the code does, but why it exists, why it is structured the way it is, and how to safely change it. Your questions must probe all three layers of this theory:

### World-to-program mapping (domain intent)
Test whether the developer understands which real-world domain behaviours this code handles and which it deliberately excludes. Questions should require reasoning about intent, not code recall. Example patterns: "Why does this code exist?", "What real-world behaviour does it handle?", "What scenarios are deliberately not covered?"

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
  "artefact_quality_note": "Brief note on what artefacts were available"
}

- question_number: Sequential integer starting at 1
- question_text: Short-answer question (not multiple choice)
- weight: Integer 1-3 reflecting importance (3 = critical to understanding)
- naur_layer: One of "world_to_program", "design_justification", "modification_capacity"
- reference_answer: The answer a developer with full understanding should give, derived strictly from the provided artefacts
- artefact_quality: One of "code_only", "code_and_tests", "code_and_requirements", "code_and_design", "code_requirements_and_design"
- artefact_quality_note: Explain what categories of artefacts were available and any gaps

## Constraints

- Generate exactly the number of questions specified in the assessment context.
- Distribute questions across all three Naur layers. Every assessment must include at least one question from each layer (when question count >= 3).
- Derive all reference answers strictly from the provided artefacts. Do not invent context.
- If artefacts are insufficient for a particular layer, generate the best question you can and note the limitation in the reference answer.
- Flag artefact quality accurately based on what was provided.`;

export function buildQuestionGenerationPrompt(
  artefacts: AssembledArtefactSet,
): PromptPair {
  return {
    systemPrompt: QUESTION_GENERATION_SYSTEM_PROMPT,
    userPrompt: formatUserPrompt(artefacts),
  };
}

function formatUserPrompt(artefacts: AssembledArtefactSet): string {
  const sections: (string | undefined)[] = [
    formatAssessmentContext(artefacts),
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
