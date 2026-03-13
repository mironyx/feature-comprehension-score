import type { RawArtefactSet, AssembledArtefactSet } from './artefact-types';
import { classifyArtefactQuality } from './classify-quality';

const DEFAULT_TOKEN_BUDGET = 100_000;
const TRUNCATION_MARKER = '... [truncated]';

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
 */
export function truncateArtefacts(
  raw: RawArtefactSet,
  options: TruncationOptions,
): AssembledArtefactSet {
  const budget = options.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  let remaining = budget;
  let truncated = false;

  // Priority 1: pr_description (always included)
  const prDescription = raw.pr_description;
  if (prDescription) {
    remaining -= estimateTokens(prDescription);
  }

  // Priority 2: linked_issues (always included)
  const linkedIssues = raw.linked_issues;
  if (linkedIssues) {
    for (const issue of linkedIssues) {
      remaining -= estimateTokens(issue.title + issue.body);
    }
  }

  // Priority 3: file_listing (always included, lightweight)
  for (const entry of raw.file_listing) {
    remaining -= estimateTokens(
      `${entry.path} ${entry.status} +${entry.additions} -${entry.deletions}`,
    );
  }

  // Priority 4: context_files
  let contextFiles = raw.context_files ? [...raw.context_files] : undefined;
  if (contextFiles) {
    const contextTokens = contextFiles.reduce(
      (sum, f) => sum + estimateTokens(f.path + f.content), 0,
    );
    if (contextTokens > remaining * 0.3) {
      // Truncate individual context files
      contextFiles = contextFiles.map(f => ({
        path: f.path,
        content: truncateText(f.content, Math.floor(remaining * 0.1)),
      }));
      truncated = true;
    }
    for (const f of contextFiles) {
      remaining -= estimateTokens(f.path + f.content);
    }
  }

  // Priority 5: pr_diff
  let prDiff = raw.pr_diff;
  const diffTokens = estimateTokens(prDiff);
  if (diffTokens > remaining * 0.6) {
    const diffBudget = Math.max(Math.floor(remaining * 0.5), 100);
    prDiff = truncateText(prDiff, diffBudget);
    remaining -= estimateTokens(prDiff);
    truncated = true;
  } else {
    remaining -= diffTokens;
  }

  // Priority 6: file_contents (drop from tail)
  let fileContents = [...raw.file_contents];
  const fileContentsBudget = Math.max(remaining * 0.7, 0);
  let fileTokensUsed = 0;
  const keptFiles: typeof fileContents = [];
  for (const file of fileContents) {
    const fileTokens = estimateTokens(file.path + file.content);
    if (fileTokensUsed + fileTokens <= fileContentsBudget) {
      keptFiles.push(file);
      fileTokensUsed += fileTokens;
    } else if (keptFiles.length === 0) {
      // Keep at least the first file, truncated
      keptFiles.push({
        path: file.path,
        content: truncateText(file.content, Math.max(Math.floor(fileContentsBudget), 50)),
      });
      truncated = true;
      fileTokensUsed += Math.floor(fileContentsBudget);
    } else {
      truncated = true;
    }
  }
  fileContents = keptFiles;
  remaining -= fileTokensUsed;

  // Priority 7: test_files (lowest priority)
  let testFiles = raw.test_files ? [...raw.test_files] : undefined;
  if (testFiles && remaining > 0) {
    const keptTests: typeof testFiles = [];
    let testTokensUsed = 0;
    for (const file of testFiles) {
      const fileTokens = estimateTokens(file.path + file.content);
      if (testTokensUsed + fileTokens <= remaining) {
        keptTests.push(file);
        testTokensUsed += fileTokens;
      } else {
        truncated = true;
      }
    }
    testFiles = keptTests.length > 0 ? keptTests : undefined;
  } else if (testFiles) {
    testFiles = undefined;
    truncated = true;
  }

  return {
    artefact_type: raw.artefact_type,
    pr_description: prDescription,
    pr_diff: prDiff,
    file_listing: raw.file_listing,
    file_contents: fileContents,
    test_files: testFiles,
    linked_issues: linkedIssues,
    context_files: contextFiles,
    question_count: options.questionCount,
    artefact_quality: classifyArtefactQuality(raw),
    token_budget_applied: truncated,
  };
}
