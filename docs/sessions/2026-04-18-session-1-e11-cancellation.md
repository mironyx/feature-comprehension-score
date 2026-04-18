# Session Log — 2026-04-18 Session 1: E11 Cancellation

## Summary

Strategic review of Epic 11 (Artefact Quality Scoring). Decision: **cancel E11**, defer artefact quality concept to V3 as part of intent debt measurement.

## Rationale

1. **Over-engineered for deterministic signals.** The six-dimension LLM evaluation (PR description, linked issues, design docs, commit messages, tests, ADRs) is mostly deterministically measurable — no LLM call needed to check "does an ADR exist?"
2. **E17 provides organic signal.** With agentic retrieval (E17), the tool-call log reveals artefact gaps naturally — the LLM's search-and-fail pattern shows what's missing without a dedicated scoring pass.
3. **Intent-adjacent weighting is V3 territory.** The ≥ 60% intent-adjacent floor pushes E11 toward intent debt measurement, which is explicitly V3 scope per Storey (2026) framing.
4. **Original motivation evaporated.** E11 was conceived as a gating signal for retrieval ("if artefacts are bad, fetch more context"). E17 now retrieves context regardless (augment, not replace), making the quality score a reporting metric rather than a control signal.

## Decision

Option A from the analysis: let E17's tool-call log be the artefact quality signal. The flag matrix concept (distinguishing "team doesn't understand" from "nothing was written down") remains valuable and may be revisited in V3 using tool-call-log-derived data.

## Changes Made

### Documents updated
- **v2-requirements.md** (v0.5) — E11 marked Cancelled in scope table, cancellation note on epic section, removed E11 consolidation from E17 Story 17.1 ACs, cleaned references in Epic 15 (benchmark data) and cross-cutting concerns (LLM cost visibility), updated V3 candidate epics
- **lld-v2-e17-agentic-retrieval.md** — removed cross-epic ordering section, simplified §17.1d (`finalise_rubric_v3` without quality params), stripped E11 consolidation from §17.1e, updated open questions and BDD specs
- **ADR-0023** — E11 consolidation section marked cancelled, updated consequences
- **lld-v2-e11-artefact-quality.md** — deleted (from prior session)

### GitHub issues
- **#233** (epic: Artefact Quality Scoring) — closed as "not planned"
- **#239** (org overview artefact-quality column) — closed as "not planned"
- **#246** (pipeline integration) — body updated, E11 references removed
- **#243** (observability schema) — body updated, E11 quality params removed
- Both closed issues removed from project board

### No code changes
E11 code was already reverted in prior commits (5f2cc8b, b2c51f8). No source code changes in this session.

## Board State

E17 tasks (#243, #246) remain in Todo, now independent of E11.
