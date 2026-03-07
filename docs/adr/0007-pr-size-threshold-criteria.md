# 0007. PR Size Threshold Criteria

**Date:** 2026-03-07
**Status:** Accepted
**Deciders:** LS, Claude

## Context

PRCC should skip small PRs where comprehension questions would be trivial or meaningless (Story 2.1). The question is what metric to use for "small" and what the default should be.

Two related but distinct thresholds exist:

1. **PR skip threshold** — below this, PRCC is not triggered at all (Story 2.1).
2. **Trivial commit heuristic** — determines whether a new push invalidates an in-progress assessment (Story 2.8). Separate concern, uses the same metric.

Exempt file patterns (Story 1.3) are applied before any counting — only non-exempt files are considered. If all files are exempt, the PR is skipped regardless of line count.

## Options Considered

### Option 1: Lines changed (additions + deletions)

Total lines added plus deleted across non-exempt files.

- **Pros:** Intuitive — developers think in lines. Already used in requirements (Story 1.3: "20 lines changed"). Correlates well with substantive change size. Available from GitHub API per-file breakdown.
- **Cons:** A large auto-generated source file and a small logic change produce the same count. Exempt patterns catch most of these cases (lockfiles, config) but not all.

### Option 2: Files changed count

Number of non-exempt files modified, added, or deleted.

- **Pros:** Simple. Resistant to auto-generated bulk — one large generated file is still one file.
- **Cons:** Poor proxy for change significance. A one-character typo fix across 5 files counts as 5; a complete rewrite of one critical file counts as 1.

## Decision

**Option 1: Lines changed (additions + deletions) on non-exempt files. Default: 20 lines.**

Lines changed is a better proxy for whether a PR contains enough substance to generate meaningful comprehension questions. File count is too coarse — it conflates trivial multi-file changes with significant single-file rewrites.

The "all files exempt" check (Story 2.1) is a special case: if no non-exempt files remain, skip regardless of line count.

**Trivial commit heuristic (Story 2.8):** Same metric, lower threshold (default: 5 lines). A commit changing fewer than 5 non-exempt lines does not invalidate an in-progress assessment.

## Consequences

- **Easier:** One metric (non-exempt lines changed) used for both skip threshold and trivial commit heuristic. One concept for Org Admins to configure.
- **Harder:** Must fetch per-file breakdown from GitHub API to apply exempt patterns, rather than using summary totals from the webhook payload. One additional API call per PR event.
- **Follow-up:** ADR-0008 (data model) must include `min_pr_size` and `trivial_commit_threshold` on the repository config table.

## References

- Requirements: Stories 1.3 (Repository Configuration), 2.1 (PR Event Detection), 2.8 (PR Update Handling)
- GitHub Check API spike: `docs/design/spike-003-github-check-api.md` — webhook payload fields
