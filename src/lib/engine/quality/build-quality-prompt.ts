import type { RawArtefactSet } from '@/lib/engine/prompts/artefact-types';
import type { PromptPair } from '@/lib/engine/prompts/prompt-builder';

export const ARTEFACT_QUALITY_SYSTEM_PROMPT_ID = 'artefact-quality-v1';

export const ARTEFACT_QUALITY_SYSTEM_PROMPT = `You are an artefact quality evaluator. Your single task is to assess the quality of development artefacts attached to a code change and return per-dimension sub-scores.

Do not generate questions. Do not score answers. Return dimension assessments only.

## Dimensions

Score each of the following six dimensions on a 0–100 scale and assign a short category label (for example "empty", "none", "minimal", "adequate", "detailed"). Use the exact keys shown below — do not rename or add dimensions.

- pr_description — How thoroughly the pull-request description explains the change, its purpose, and any context a reviewer would need.
- linked_issues — Whether the change links to issues, tickets, or user stories that explain the motivating requirement.
- design_documents — Whether relevant design documents (architecture notes, RFCs, specifications) accompany the change and are referenced.
- commit_messages — Whether commit messages explain intent and reasoning, not just mechanics.
- test_coverage — Whether tests accompany the change and exercise the behaviour it introduces or modifies.
- adr_references — Whether the change references Architecture Decision Records (ADRs) that justify structural choices.

## Output

Return a JSON object matching this schema:

{
  "dimensions": [
    {
      "key": "pr_description",
      "sub_score": 80,
      "category": "detailed",
      "rationale": "One-sentence justification of the score."
    },
    ... (one entry per dimension key, exactly six entries)
  ]
}

- Emit exactly six entries, one per dimension key.
- sub_score must be an integer between 0 and 100 inclusive.
- category and rationale must each be a non-empty string.
- Do not include any other top-level fields. Do not emit questions, answers, or aggregate scores — the aggregate is computed downstream.`;

/**
 * Build the system + user prompt pair for the artefact-quality evaluator LLM
 * call. The system prompt names the six dimension keys verbatim and instructs
 * the model to return dimension assessments only. The user prompt embeds the
 * raw artefact set without truncation.
 */
export function buildArtefactQualityPrompt(raw: RawArtefactSet): PromptPair {
  return {
    systemPrompt: ARTEFACT_QUALITY_SYSTEM_PROMPT,
    userPrompt: formatUserPrompt(raw),
  };
}

function formatUserPrompt(raw: RawArtefactSet): string {
  const sections: (string | undefined)[] = [
    formatHeader(raw),
    formatPrDescription(raw),
    formatLinkedIssues(raw),
    formatFileListing(raw),
    formatContextFiles(raw),
    `## Code Diff\n\n${raw.pr_diff}`,
    formatFileContents(raw),
    formatTestFiles(raw),
  ];
  return sections.filter(Boolean).join('\n\n');
}

function formatHeader(raw: RawArtefactSet): string {
  return `## Artefact Set\n\n- Type: ${raw.artefact_type}`;
}

function formatPrDescription(raw: RawArtefactSet): string | undefined {
  if (!raw.pr_description?.trim()) return undefined;
  return `## PR Description\n\n${raw.pr_description}`;
}

function formatLinkedIssues(raw: RawArtefactSet): string | undefined {
  if (!raw.linked_issues?.length) return undefined;
  const issues = raw.linked_issues
    .map(issue => `### Issue: ${issue.title}\n\n${issue.body}`)
    .join('\n\n');
  return `## Linked Issues\n\n${issues}`;
}

function formatFileListing(raw: RawArtefactSet): string {
  const header = '| File | Status | +/- |\n|------|--------|-----|';
  const rows = raw.file_listing
    .map(f => `| ${f.path} | ${f.status} | +${f.additions} -${f.deletions} |`)
    .join('\n');
  return `## Changed Files Overview\n\n${header}\n${rows}`;
}

function formatContextFiles(raw: RawArtefactSet): string | undefined {
  if (!raw.context_files?.length) return undefined;
  const docs = raw.context_files
    .map(f => `### ${f.path}\n\n${f.content}`)
    .join('\n\n');
  return `## Context Documents\n\n${docs}`;
}

function formatFileContents(raw: RawArtefactSet): string | undefined {
  if (!raw.file_contents.length) return undefined;
  const files = raw.file_contents
    .map(f => `### ${f.path}\n\n${f.content}`)
    .join('\n\n');
  return `## File Contents\n\n${files}`;
}

function formatTestFiles(raw: RawArtefactSet): string | undefined {
  if (!raw.test_files?.length) return undefined;
  const tests = raw.test_files
    .map(f => `### ${f.path}\n\n${f.content}`)
    .join('\n\n');
  return `## Test Files\n\n${tests}`;
}
