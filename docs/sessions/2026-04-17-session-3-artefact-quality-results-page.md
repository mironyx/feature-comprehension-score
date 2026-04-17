# Session: 2026-04-17 Session 3 — Artefact Quality Results Page

## Issue

#238 — feat: artefact-quality results page block + flag matrix (Epic #233, Wave 3)

## PR

#256 — <https://github.com/mironyx/feature-comprehension-score/pull/256>

## Work completed

1. **`computeArtefactQualityFlag`** (`src/lib/engine/quality/compute-flag.ts`) — pure engine function implementing the four-quadrant flag matrix. Compares artefact quality score (0–100) against threshold (0–1 scale, multiplied by 100) and FCS score (0–1, multiplied by 100) against `fcs_low_threshold` (0–100). Returns flag key + human-readable copy text, or null for healthy/unavailable/pending states.

2. **`ArtefactQualityCard`** (`src/components/results/artefact-quality-card.tsx`) — server-side React component rendering overall score, collapsible `<details>` dimension accordion (6 rows in canonical order), and flag copy/warning banners. Returns null for pending, "Unavailable" for unavailable status.

3. **Results page integration** (`src/app/assessments/[id]/results/page.tsx`) — fetches org thresholds from `org_config` in the existing `Promise.all`, computes flag server-side, renders `<ArtefactQualityCard />` between the comprehension score section and question breakdown.

4. **Bug fix: threshold default** — `ARTEFACT_QUALITY_THRESHOLD_DEFAULT` was `0.60` (introduced in #237) but LLD Invariant 9 specifies 40 (= `0.40`). Fixed in TypeScript constant, DB schema default, migration file, and 3 affected test files. This corrects a misclassification where orgs without custom thresholds would see wrong flags for quality scores between 40 and 60.

## Decisions made

- **Server-side everything** — quality data, thresholds, and flag computation all happen server-side in the existing server component. No client components needed; `<details>` element handles expand/collapse natively. Minimum code approach.
- **Scale handling** — `artefact_quality_low_threshold` stored as 0–1 in DB but quality score is 0–100. Function multiplies threshold by 100 internally. LLD corrected from `0..100` to `0..1` for this field.
- **`parseDimensions` cast** — JSON column cast to typed array with justification comment rather than Zod runtime parse, since data is validated at write time by `finalise_rubric_v2`.
- **`sortedDimensions` helper** — uses `.flatMap()` instead of `.find()!.filter(Boolean)` to avoid non-null assertion on potentially missing dimensions.

## Review feedback addressed

- Added error logging for `orgConfigResult` (consistency with other queries in same function)
- Added justification comment for `as unknown as` double cast on DB JSON
- Replaced non-null assertion with `.flatMap()` in dimension sorting

## LLD sync

Updated `docs/design/lld-v2-e11-artefact-quality.md` §11.2b:
- Corrected `artefact_quality_low_threshold` scale from `0..100` to `0..1`
- Corrected test paths from `tests/unit/` to `tests/lib/` and `tests/components/`
- Added implementation notes for threshold default fix and component test file
- Marked acceptance criteria as complete

## Tests

- 39 tests added (17 compute-flag + 18 component + 4 adversarial)
- 892 total tests, all passing

## Cost retrospective

Prometheus unavailable — cost figures not captured.

**Cost drivers observed:**
- **Test-author + evaluator agent spawns** — two sub-agent spawns (test-author, feature-evaluator) re-sent context. The evaluator caught a real defect (threshold default) that justified its cost.
- **Threshold default fix cascade** — fixing the 0.60→0.40 default touched 6 files across the boundary of #237 and #238. This was a design-level error that should have been caught during #237's `/pr-review-v2`.

**Improvement actions:**
- LLD Invariant 9 explicitly stated `artefact_quality_low = 40` but the #237 implementation used 60. Future `/architect` runs should cross-check invariant table values against default constants before marking the LLD section complete.
- The evaluator's adversarial test (B-1) exposed the defect cleanly — this validates the independent test authorship model.

## Next steps

- Epic #233 Wave 3 is complete (all 5 tasks: #234, #235, #236, #237, #238)
- §11.2c (Org Overview sortable column) remains blocked on Story 6.3
