# Session Log — 2026-04-16 (Session 2)

**Issue:** #223 — feat: depth-aware rubric generation (Story 2.2)
**PR:** <https://github.com/mironyx/feature-comprehension-score/pull/231>
**Branch:** `feat/depth-aware-rubric-generation`
**Parent epic:** #215

## Work completed

Threaded `comprehension_depth` from the assessment record into rubric generation so the LLM
receives a depth-specific instruction block appended to the base system prompt.

- Added `CONCEPTUAL_DEPTH_INSTRUCTION` and `DETAILED_DEPTH_INSTRUCTION` constants and a
  `depthInstruction(depth)` helper in `src/lib/engine/prompts/prompt-builder.ts`.
- Modified `buildQuestionGenerationPrompt` to append `depthInstruction(artefacts.comprehension_depth)`
  to the base system prompt. Conceptual is the default when depth is undefined.
- Extended `RubricTriggerParams` with `comprehensionDepth` and threaded it from both
  entry points: `createFcs` (from request body) and `retriggerRubricForAssessment` (from
  stored `config_comprehension_depth`). The retry path was missed in the initial pass
  and surfaced by `feature-evaluator`.
- Added `config_comprehension_depth` to the select query in
  `src/app/api/assessments/[id]/retry-rubric/service.ts`.
- After PR creation, team-lead flagged that the detailed-depth wording had drifted from
  Naur's theory-building framing. Revised to reframe identifiers as probe anchors (not
  recall answers) and explicitly forbid recall-shaped questions. Coordinated with Story
  2.3 (scoring) to keep the framing consistent.

## Decisions made

- **Kept `QUESTION_GENERATION_SYSTEM_PROMPT` as a const** rather than converting to a
  function as the LLD suggested. Appending inside `buildQuestionGenerationPrompt` is
  simpler, preserves existing tests that assert the base by identity, and avoids
  rippling changes through callers.
- **Threaded depth through `RubricTriggerParams`, not `RepoInfo`** — depth is
  per-assessment, not per-repository. `RepoInfo` continues to carry org-level config only.
- **Identifiers as probe anchors, not answers** — revised detailed-depth instruction to
  preserve Naur's theory-building orientation: specific type names, file paths, and
  function signatures anchor questions, but reference answers explain why a structure
  was chosen and how it composes, grounded in the concrete code.

## Review feedback addressed

- `feature-evaluator` caught the retry path gap — added coverage in
  `tests/evaluation/comprehension-depth-story-2-2.eval.test.ts` (2 tests) and threaded
  depth through `retriggerRubricForAssessment`.
- `pr-review-v2` found no blockers.
- Team-lead post-review revision: reworded detailed-depth instruction to preserve Naur's
  framing. Captured in commit `49abb6b`.

## LLD sync

Ran `/lld-sync 223` — updated `docs/design/lld-v3-e2-comprehension-depth.md`:

- Files-to-modify expanded to include `retry-rubric/service.ts` with note on retry-path threading.
- Implementation approach replaced with the "kept const, appended inside builder"
  rationale (previous spec proposed converting const to function).
- Service wiring section documents both entry points and the decision not to thread
  depth through `RepoInfo`.
- Detailed prompt block updated to match the revised Naur-aligned wording.

## Next steps or follow-up items

- None blocking. Story 2.3 (scoring side) follows this commit in a separate PR/issue.

## Final feature cost

Prometheus was unreachable at both PR-creation and feature-end stages — cost snapshot
unavailable. The PR body Usage section still shows `TBD` placeholders for this reason.

## Cost retrospective

Without Prometheus data, dollar figures are unavailable. Qualitative drivers noted from
session history:

| Driver | Detected | Impact |
|--------|----------|--------|
| Context compaction | Summary "continued from previous" appeared once | High — re-summarised context |
| Rebase on merged sibling branch | Story 2.4 merged to main mid-work; LLD change-log conflict | Medium — one extra rebase + force-push round |
| CI environmental flake | Port 54322 in use on first CI run | Low — single retry |
| Post-review revision | Detailed-depth wording reframed after PR review | Medium — one extra commit round |
| Retry-path gap | `feature-evaluator` caught missing depth threading on retry | Low — caught before merge, no rework needed downstream |

### Improvement actions for next time

- **Coordinate LLD edits across parallel branches** — Story 2.4 landed on the same LLD
  file mid-work; the LLD doc is a hot file during an epic. Consider either locking the
  LLD per epic during parallel work, or treating the change-log row as append-only to
  minimise conflict surface.
- **Call out Naur framing in detailed-depth wording upfront** — the first pass of the
  detailed instruction drifted from the framework without being caught locally. A short
  "this must not become recall" note in the LLD's detailed prompt section would have
  caught it pre-PR.
- **Retry path is a standing coverage item** — any per-assessment config added to
  `createFcs` should also be threaded through `retriggerRubricForAssessment`. Worth a
  short checklist item in the LLD template for depth/context/config changes.
