# Process Retrospective

**Date:** 2026-03-12
**Period:** 2026-03-09 (previous retro) to 2026-03-12
**Sessions reviewed:** Sessions 9, 10, 11, 12, 13, 14, 15, 16

## What went well

- **Phase 0.5 scaffolding completed end-to-end.** Supabase local dev with migrations/RLS/test helpers (session 9), GitHub Actions CI pipeline with staged jobs (session 10), Vitest/Playwright/MSW test infrastructure (session 11), architecture fitness tests (session 13), diagnostics pipeline (session 14). The project is now fully equipped for Phase 1 implementation.
- **First production code written with TDD discipline.** Session 15 delivered the LLM client wrapper (`AnthropicClient`) with 8 BDD tests covering success, retries, error handling, and custom config. Red-Green-Refactor was followed. Session 16 added fixtures and mock factory with 8 more tests. All 16 engine tests pass.
- **CodeScene and VS Code diagnostics pipeline operational.** Session 14 built a two-channel system: automatic PostToolUse hook after Write/Edit operations, plus manual `/diag` skill for batch checking. Session 15 used the diagnostics pipeline to identify and fix code duplication, method complexity, and Zod API deprecation in the LLM client — first real use of the feedback loop.
- **Started using `/review` command for PR reviews.** PR code review is now part of the workflow, adding a quality gate before merge. This was missing in Phase 0 where everything went direct to `main`.
- **Drift scan now includes source code.** The 2026-03-12 drift report was the first to scan implementation code alongside documents. It caught a critical three-way mismatch (Naur layer enum values in `schemas.ts` vs design contracts vs DB constraints) that would have been a runtime failure. This was fixed in commit `54454cc`.
- **Previous retro actions largely addressed.** The `gh-project-status.sh` helper was created (A1 from previous retro). Project board IDs are cached in CLAUDE.md (A2). "No work without an issue" is established practice (A3). PR-based workflow adopted (retro action 5).
- **Session logs consistently maintained.** All 8 sessions have detailed logs. Session orientation works — each session references the previous log and picks up cleanly.
- **Phase 1 backlog created.** 9 issues (#23–#31) created with BDD test specs and acceptance criteria, ordered by dependency on the project board. The empty backlog gap from the previous retro is resolved.

## What needs improving

### Claude Code does not consistently follow protocol — branches and PRs

**Observation:** Multiple instances of protocol drift:
- Session 16: work started on the wrong branch (`feat/ci-pipeline` instead of `feat/assessment-engine`), caught mid-session, fixed with branch creation + merge.
- Branch and PR creation is inconsistent. Some sessions commit directly; others open PRs. The protocol says "PR-based workflow" but Claude Code sometimes skips creating branches or opening PRs unless explicitly prompted.
- Session 10 opened PR #20, but sessions 12 and 13 committed directly to `feat/ci-pipeline` without PRs for their work.

**Impact:** Inconsistent git history, review checkpoints missed, manual intervention needed to fix branch state.

### Diagnostics hook — not obvious whether it is running

**Observation:** The PostToolUse hook (`.claude/hooks/check-diagnostics.sh`) fires after Write/Edit on source files, but there is no visible confirmation that it ran or what it found. The hook injects diagnostics as inline context, but if it finds nothing (or fails silently), there is no feedback. The user cannot tell whether the hook is actively providing value or is broken.

**Impact:** Uncertainty about whether the quality feedback loop is operational. Without visible confirmation, the diagnostics pipeline may silently stop working and no one would notice.

**Suggested action:** Add a brief status line to hook output even when no diagnostics are found (e.g., "Diagnostics: 0 issues in <file>") so there is always visible evidence the hook ran. Consider logging hook invocations to a file for debugging.

### Claude Code diff display in VS Code is inconsistent

**Observation:** Claude Code sometimes shows inline diffs in the VS Code editor window and sometimes does not. The pattern is unclear — it may relate to file size, edit type, or timing. When diffs are not shown, the user must manually check `git diff` to understand what changed.

**Impact:** Reduced visibility into what Claude Code is changing. The user has to context-switch to the terminal to review changes, which slows the feedback loop and reduces trust.

**Note:** This may be a VS Code extension limitation rather than something controllable from the project side. Worth investigating whether there are settings or thresholds that control diff display.

### Commit discipline still has gaps

**Observation:** Commit messages are mostly conventional, but there are lapses:
- `f034ec9 session-15` — no `docs:` prefix.
- `33fbce4 docs: session-16 log` — acceptable but abbreviated.
- Some sessions produce multiple commits per task (session 15: 3 commits for one issue), others batch changes.
- CLAUDE.md says "No Co-Authored-By trailers" but this was not always followed in previous sessions (now resolved).

**Impact:** Git history is harder to navigate when commit format varies. One-commit-per-task discipline from R3 is aspirational but not consistently achieved.

### Drift agent does not include source code references

**Observation:** The drift agent definition (`.claude/agents/requirements-design-drift.md`) only instructs the agent to scan `docs/requirements/`, `docs/design/`, `docs/adr/`, and `docs/plans/`. The 2026-03-12 drift report DID scan source code (finding C1 and W1–W4 in `schemas.ts` and `client.ts`), but only because the agent was prompted to do so — the agent definition does not mention `src/` as a scan target.

**Impact:** Future drift scans may miss implementation-vs-design misalignment if the agent follows its definition strictly. The C1 Naur layer mismatch would have gone undetected.

**Suggested action:** Update `.claude/agents/requirements-design-drift.md` to add a Step 1b: scan `src/` for implementation artefacts and verify alignment with design contracts. Add a "Code implemented" column to the coverage matrix template (as the 2026-03-12 report already does).

### Markdown linting adds friction, and Claude Code generates lint-failing markdown

**Observation:** Markdown linting (`markdownlint-cli2`) runs via post-tool-use hooks after Write/Edit. It flags issues like bare URLs in session logs — markdown that Claude Code itself generated. This is the same friction identified as P12 in the original process improvement report (2026-03-05) and addressed by R10 ("remove markdown lint from session protocol"). Despite the recommendation, linting remained active and continues to produce false-positive friction on documentation files.

**Impact:** Time spent fixing lint errors in documentation that has no impact on code quality. The lint rules were already relaxed in session 10 (13 rules disabled), but bare URL detection (`MD034`) still fires on URLs that Claude Code writes into session logs.

**Suggested action:** Either disable markdown linting entirely for `docs/` files (keeping it only for user-facing documentation if any), or accept that session logs and reports are internal working documents that don't need lint-clean markdown. If linting stays, Claude Code must generate lint-compliant markdown (e.g., wrapping URLs in angle brackets).

### No feedback loop from implementation back to design

**Observation:** When implementing #23 (LLM client), the drift scan found that the design contracts were ambiguous or incomplete in ways that only became visible during coding — e.g., the Naur layer enum values in the design doc were clear, but the schema file used abbreviated names because the design didn't emphasise that these values must exactly match the DB constraint strings. The implementation exposed a gap in the design's precision, but there is no step in the current workflow to feed that learning back.

**Impact:** If the same code had to be reimplemented (by a different developer or agent), the same ambiguity would cause the same drift. The design documents should be the single source of truth precise enough to implement from — but currently, implementation experience that reveals design gaps is fixed in code only, not propagated back to improve the design.

**Suggested action:** Add a "design review" step to the PR review process. During code review, explicitly ask: "Did the design contracts provide enough precision to implement this correctly? If not, what needs updating in `docs/design/` to prevent reimplementation drift?" Update the design doc as part of the PR, not as a separate follow-up task.

### Open issues accumulating — 10 open, 2 stale

**Observation:** Issues #18 (architecture fitness) and #22 (harness improvement) are open and partially complete but not actively being worked. #23 has work completed (session 15) but the issue is still open. 7 Phase 1 issues (#25–#31) are in Todo.

**Impact:** Board state does not accurately reflect reality. Issue #23 should be closed (or moved to Done pending PR merge). Stale WIP issues (#18, #22) create noise.

## Actions from previous retro

| # | Action | Status | Notes |
|---|--------|--------|-------|
| 1 | Create Phase 1 issues and populate the project board | Done | 9 issues created in session 13 (#23–#31) |
| 2 | Commit modified `process-improvement-report.md` and retro report | Done | Committed in sessions following the retro |
| 3 | Decide on A1/A2 (gh-project helper + cached IDs) | Done | `scripts/gh-project-status.sh` created, IDs cached in CLAUDE.md |
| 4 | Run drift scan before starting Phase 1 | Done | 2026-03-12 drift report generated, C1 fixed before continuing |
| 5 | Establish branch + PR workflow before writing code | Partial | PRs used (#20, #21, #32) but not consistently. Some work committed directly to feature branches without PR review |

## New actions

| # | Action | Addresses |
|---|--------|-----------|
| 1 | Update drift agent definition to scan `src/` and `tests/` for implementation-vs-design alignment | Drift agent missing source code and test coverage |
| 2 | Add visible status output to diagnostics hook (even when 0 issues found) | No feedback that hook is running |
| 3 | Close issue #23 (LLM client completed) and #24 (fixtures completed) | Stale board state |
| 4 | Add a "check branch" step to session start protocol in CLAUDE.md — verify you're on the correct branch before starting work | Wrong branch incidents |
| 5 | Investigate Claude Code VS Code diff display settings — check if there are extension settings or file-size thresholds that affect inline diff visibility | Inconsistent diff display |
| 6 | Triage #18 and #22 — either close as done-enough or scope remaining work into new issues | Stale WIP issues |
| 7 | Add "design adequacy check" to PR review — during code review, assess whether design contracts were precise enough to implement from; update `docs/design/` in the same PR if gaps found | No feedback loop from implementation to design |

## Process health scorecard

| Dimension | Rating | Trend | Notes |
|-----------|--------|-------|-------|
| Backlog hygiene | Green | ↑ | Phase 1 backlog created with 9 prioritised issues. Dependencies tracked. Board ordered. Previous retro's "empty backlog" gap resolved. |
| Definition of done | Amber | → | BDD acceptance criteria on all Phase 1 issues. But issues not consistently closed when work completes (#23 still open despite code being done). |
| Commit discipline | Amber | → | Conventional commits mostly followed. Some format lapses. One-commit-per-task not always achieved. Similar to previous retro. |
| Session continuity | Green | → | All 8 sessions have complete logs. Orientation from previous session log works well. |
| Drift management | Green | ↑ | First drift scan to include source code. Critical issue (C1) found and fixed same day. Coverage matrix now includes implementation status. |
| Multi-agent readiness | Green | ↑ | PR workflow established. Feature branches used. `/review` command adopted. Diagnostics pipeline provides automated code quality feedback. Significant improvement from previous "Amber". |
| Code quality tooling | Green | New | CodeScene integration via diagnostics pipeline. PostToolUse hook and `/diag` skill operational. First real use in session 15 drove three improvements. |
| TDD discipline | Green | New | Strict Red-Green-Refactor documented in CLAUDE.md. 16 BDD tests written across 2 sessions. Test diamond strategy (ADR-0009) adopted. |

## Comparison with previous retro

| Metric | Previous retro (2026-03-09) | Now (2026-03-12) | Target | Status |
|--------|----------------------------|-------------------|--------|--------|
| Session orientation time | Minimal | Minimal | Minimal | Met |
| Tasks closed with missing cross-references | 0 | 0 | 0 | Met |
| Drift report critical items | 0 (design only) | 1 found, 1 fixed (with code) | 0 within one session | Met |
| Commits per completed task | ~1 | ~1.5 (session 15 had 3 for one task) | 1 | Partially met |
| Untracked files at session end | 1 modified file | 0 (clean) | 0 | Met |
| Agent able to determine next task | Yes | Yes | Yes | Met |
| Branch + PR workflow | Not established | Established but inconsistent | Consistent | Partially met |
| Code quality feedback loop | None | Operational (hook + skill) | Automated | Met |
| TDD discipline | Not yet coding | Practised (16 tests) | Strict R-G-R | Met |

## Overall assessment

The project has successfully transitioned from Phase 0 (documents only) to Phase 0.5/1 (infrastructure + code). The tooling is comprehensive: CI pipeline, test infrastructure (Vitest + Playwright + MSW), Supabase local dev, diagnostics pipeline, and drift scanning that now covers implementation code.

The main process gaps are operational consistency rather than missing capability:
1. Claude Code needs more consistent branch/PR discipline — the tools and conventions exist but aren't always followed.
2. The diagnostics hook works but gives no visible feedback, undermining confidence.
3. Issue lifecycle management (closing issues when work is done) needs tightening.

These are "last mile" process issues — the infrastructure and conventions are solid, the execution just needs to be more reliable.
