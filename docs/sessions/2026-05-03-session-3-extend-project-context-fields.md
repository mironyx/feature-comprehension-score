# Session Log — 2026-05-03 Session 3 — Issue #453

## Issue

[#453](https://github.com/mironyx/feature-comprehension-score/issues/453) — feat: extend
project context with vocabulary, focus areas, exclusions (Story 3.1 rev 1.3)

## PR

[#458](https://github.com/mironyx/feature-comprehension-score/pull/458) — feat: extend
project context with vocabulary, focus areas, exclusions (Story 3.1 rev 1.3)

Branch: `feat/extend-project-context-fields` → `main`

## Work completed

Implemented T3.3 (rev 1.3 Story 3.1 extension) via the full standard-pressure feature-core
pipeline (test-author → implementation → evaluator → /diag → pr-review).

**Extracted shared components:**

- `src/components/context/tag-input.tsx` — extracted `TagInput` from `org-context-form.tsx`;
  both the org form and the settings form import from the canonical path.
- `src/components/context/vocab-row.tsx` — extracted `VocabRow` from `org-context-form.tsx`.

**Extended API validation** (`src/app/api/projects/validation.ts`):

- Added `VocabRowSchema` (term ≤ 100, definition ≤ 500), `VocabularySchema` (max 20),
  `FocusAreasSchema` (max 5), `ExclusionsSchema` (max 5) — mirrors `OrganisationContextSchema` caps.
- Extended `UpdateProjectSchema` and `CreateProjectSchema` with the three new optional fields.

**Extended service layer** (`src/app/api/projects/[id]/service.ts`):

- Added `domain_vocabulary`, `focus_areas`, `exclusions` to the `cf` destructuring and filter.
  The `patch_project` RPC's `||` JSON merge handles new keys automatically — no SQL change.

**Extended settings form** (`settings-form.tsx`, `page.tsx`):

- `SettingsInitial` widened to 6 fields.
- `buildInitial()` in the page extended with `isVocabRow` type guard and per-field filtering.
- `buildChangedSubset` extended with `vocabEqual` + `arraysEqual` helpers.
- JSX extended: `VocabRow` list with `_id` stable keys, two `TagInput` sections for focus areas
  and exclusions.

**Tests added:** 20 new tests across 5 test files, plus 4 adversarial tests from the evaluator.
Total: 59 tests (5 test files).

All tests pass. `npx tsc --noEmit` clean. `npm run lint` clean. All 7 source files scored
≥ 9.16 on CodeScene MCP (green/optimal).

## Decisions made

1. **Extract, not copy** — two call sites with identical logic require a shared component per
   the V11 design principle. Extracted into `src/components/context/` (not a local sibling file)
   so `/architect` and `/lld` agents can reference the canonical path in future LLDs.

2. **`INPUT_CLASSES` stays local** — rather than exporting the string constant from
   `vocab-row.tsx`, each consuming file declares it locally. A simple string literal does not
   benefit from a shared export; extracting it would create coupling for no gain.

3. **`+ Add term` vocabulary cap guard** — found during `/pr-review-v2`: the `+ Add term`
   button had no UI-side guard against exceeding the 20-row schema cap (unlike `TagInput`
   which hides its input at `max`). Fixed in a second commit:
   `fix: cap vocabulary Add term button at 20 rows #453`.

4. **`isVocabRow` type guard in page.tsx** — the raw `context` JSON blob from the DB is
   `Record<string, unknown>`; a type guard makes the array filter type-safe. Defensive, not
   load-bearing (the RPC stored what the form sent, which was already schema-validated).

5. **No SQL migration** — the `context` jsonb column already accepts arbitrary JSON. The RPC
   merge `context || EXCLUDED.context` handles new keys without alteration. Confirmed by
   running the existing tests which exercise the RPC via a real Supabase test client.

## Review feedback addressed

`/pr-review-v2 458` ran after PR creation. One blocker found:

- **Vocabulary Add term button has no cap guard** — the button unconditionally renders even
  when vocabulary is at the 20-row limit. Fixed by wrapping it in `{vocabulary.length < 20 && ...}`.

No other blockers. Non-blocking suggestions were noted and deferred to future issues.

## LLD sync

`/lld-sync 453` ran as part of feature-end:

- LLD version bumped 0.3 → 0.4.
- `## Pending changes — Rev 2` section removed (shipped as #453).
- B.1 updated: extended files list, `SettingsInitial` interface, `UpdateProjectSchema` snippet,
  page.tsx `buildInitial` sketch. Implementation note for #453 added.
- Coverage manifest `coverage-v11-e11-3.yaml`: REQ-configure-project-context entry set to
  `Implemented`, `lld_revision: r2`, new files appended for #453.
- Kernel: new "Shared form components" section added for `TagInput` and `VocabRow`.

## Cost retrospective

| | Value |
|---|---|
| Cost at PR creation | $4.4836 |
| Cost final (this session) | $8.5639 (delta: +$4.08 post-PR) |
| Time to PR | 29 min |
| Tokens | 1,097 input / 50,121 output / 9.6 M cache-read / 327 K cache-write |

**Cost drivers identified:**

- **Context compaction** — the session ran in a worktree and hit context limits before the
  feature-end; the feature-end ran in a new session with a compacted summary. This adds
  cache-write overhead on resume.
- **Standard-pressure agent spawn cost** — test-author agent, feature-evaluator agent,
  diagnostics agent (CodeScene MCP), pr-review agent, ci-probe agent. Each re-sends the
  full diff context.
- **Two-commit PR** — the missing vocabulary cap guard found during review required a second
  commit and push cycle. Better LLD specificity about UI-side cap enforcement would have
  caught this before implementation.

**Improvement actions:**

- LLD should specify UI-side cap guards explicitly when a field has a schema max — not just
  that the schema enforces it, but that the UI must hide the add control at that limit.
- For PRs where the worktree will be used past the initial session, prefer breaking the
  feature-end into the same session as the feature to avoid the compaction overhead.

## Next steps

Suggested from board:

- Continue v11 rev 1.3 batch (issues #450, #451, #452, #454 and any remaining wave items).
