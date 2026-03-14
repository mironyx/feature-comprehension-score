import type { ArtefactFile, RawArtefactSet, AssembledArtefactSet } from './artefact-types';
import { classifyArtefactQuality } from './classify-quality';

const DEFAULT_TOKEN_BUDGET = 100_000;
const TRUNCATION_MARKER = '... [truncated]';

/** Context files may use up to 30% of remaining budget before per-file truncation kicks in */
const CONTEXT_BUDGET_THRESHOLD = 0.3;
/** Each context file is capped at 10% of remaining budget when truncation triggers */
const CONTEXT_PER_FILE_CAP = 0.1;
/** Diff triggers truncation when it exceeds 60% of remaining budget */
const DIFF_TRUNCATION_THRESHOLD = 0.6;
/** Diff is allocated 50% of remaining budget after truncation triggers */
const DIFF_BUDGET_ALLOCATION = 0.5;
/** File contents may use up to 70% of remaining budget */
const FILE_CONTENTS_BUDGET_SHARE = 0.7;
/** Minimum token budget for a truncated diff or file (prevents zero-length output) */
const MIN_SECTION_TOKENS = 100;
/** Minimum tokens for a truncated first file */
const MIN_FIRST_FILE_TOKENS = 50;

export interface TruncationOptions {
  questionCount: number;
  tokenBudget?: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function truncateText(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
}

interface TruncationState {
  remaining: number;
  notes: string[];
}

/**
 * Truncate artefacts to fit within a token budget.
 *
 * Priority ordering (highest first):
 * 1. pr_description — always included
 * 2. linked_issues — always included
 * 3. file_listing — always included (lightweight)
 * 4. context_files — truncated if needed
 * 5. pr_diff — truncated if needed
 * 6. file_contents — files dropped from tail if needed
 * 7. test_files — dropped first
 *
 * The budget is a soft cap: high-priority items (1-3) are always included
 * even if they exceed the budget. Lower-priority items are truncated or
 * dropped to fit within whatever budget remains.
 */
export function truncateArtefacts(
  raw: RawArtefactSet,
  options: TruncationOptions,
): AssembledArtefactSet {
  const budget = options.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const state: TruncationState = { remaining: budget, notes: [] };

  deductHighPriorityItems(raw, state);

  // Guard: if high-priority items consumed the entire budget, clamp to zero
  state.remaining = Math.max(state.remaining, 0);

  const contextFiles = truncateContextFiles(raw.context_files, state);
  const prDiff = truncateDiff(raw.pr_diff, state);
  const fileContents = truncateFileContents(raw.file_contents, state);
  const testFiles = truncateTestFiles(raw.test_files, state);

  return {
    artefact_type: raw.artefact_type,
    pr_description: raw.pr_description,
    pr_diff: prDiff,
    file_listing: raw.file_listing,
    file_contents: fileContents,
    test_files: testFiles,
    linked_issues: raw.linked_issues,
    context_files: contextFiles,
    question_count: options.questionCount,
    artefact_quality: classifyArtefactQuality(raw),
    token_budget_applied: state.notes.length > 0,
    truncation_notes: state.notes.length > 0 ? state.notes : undefined,
  };
}

function deductHighPriorityItems(raw: RawArtefactSet, state: TruncationState): void {
  if (raw.pr_description) {
    state.remaining -= estimateTokens(raw.pr_description);
  }

  if (raw.linked_issues) {
    for (const issue of raw.linked_issues) {
      state.remaining -= estimateTokens(issue.title + issue.body);
    }
  }

  for (const entry of raw.file_listing) {
    state.remaining -= estimateTokens(
      `${entry.path} ${entry.status} +${entry.additions} -${entry.deletions}`,
    );
  }
}

function truncateContextFiles(
  files: ArtefactFile[] | undefined,
  state: TruncationState,
): ArtefactFile[] | undefined {
  if (!files) return undefined;

  let result = [...files];
  const contextTokens = result.reduce(
    (sum, f) => sum + estimateTokens(f.path + f.content), 0,
  );

  if (contextTokens > state.remaining * CONTEXT_BUDGET_THRESHOLD) {
    result = result.map(f => ({
      path: f.path,
      content: truncateText(f.content, Math.floor(state.remaining * CONTEXT_PER_FILE_CAP)),
    }));
    state.notes.push(`Context files truncated (${files.length} files)`);
  }

  for (const f of result) {
    state.remaining -= estimateTokens(f.path + f.content);
  }

  return result;
}

function truncateDiff(diff: string, state: TruncationState): string {
  const diffTokens = estimateTokens(diff);

  if (diffTokens > state.remaining * DIFF_TRUNCATION_THRESHOLD) {
    const diffBudget = Math.max(Math.floor(state.remaining * DIFF_BUDGET_ALLOCATION), MIN_SECTION_TOKENS);
    const result = truncateText(diff, diffBudget);
    state.remaining -= estimateTokens(result);
    state.notes.push('Code diff truncated');
    return result;
  }

  state.remaining -= diffTokens;
  return diff;
}

function truncateFileContents(
  files: ArtefactFile[],
  state: TruncationState,
): ArtefactFile[] {
  const fileBudget = Math.max(state.remaining * FILE_CONTENTS_BUDGET_SHARE, 0);
  let tokensUsed = 0;
  const kept: ArtefactFile[] = [];
  let dropped = 0;

  for (const file of files) {
    const fileTokens = estimateTokens(file.path + file.content);
    if (tokensUsed + fileTokens <= fileBudget) {
      kept.push(file);
      tokensUsed += fileTokens;
    } else if (kept.length === 0) {
      kept.push({
        path: file.path,
        content: truncateText(file.content, Math.max(Math.floor(fileBudget), MIN_FIRST_FILE_TOKENS)),
      });
      tokensUsed += Math.floor(fileBudget);
      dropped += files.length - 1;
      break;
    } else {
      dropped++;
    }
  }

  state.remaining -= tokensUsed;
  if (dropped > 0) {
    state.notes.push(`${dropped} of ${files.length} file contents dropped`);
  }

  return kept;
}

function truncateTestFiles(
  files: ArtefactFile[] | undefined,
  state: TruncationState,
): ArtefactFile[] | undefined {
  if (!files) return undefined;

  if (state.remaining <= 0) {
    state.notes.push(`All ${files.length} test files dropped`);
    return undefined;
  }

  const kept: ArtefactFile[] = [];
  let tokensUsed = 0;
  let dropped = 0;

  for (const file of files) {
    const fileTokens = estimateTokens(file.path + file.content);
    if (tokensUsed + fileTokens <= state.remaining) {
      kept.push(file);
      tokensUsed += fileTokens;
    } else {
      dropped++;
    }
  }

  if (dropped > 0) {
    state.notes.push(`${dropped} of ${files.length} test files dropped`);
  }

  return kept.length > 0 ? kept : undefined;
}
