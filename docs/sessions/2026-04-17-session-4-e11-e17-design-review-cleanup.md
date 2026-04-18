# Session 4 — 2026-04-17 — E11 + E17 Design Review and Code Cleanup

## Summary

Design review of E11 (Artefact Quality Scoring) and E17 (Agentic Artefact Retrieval) LLDs and requirements. Two key decisions emerged from the review:

1. **Augment, not replace** — E17 should augment the existing artefact assembly, not replace it. The LLM receives the fixed artefact set as primary context and should exhaust it first; tools are only for filling gaps.

2. **Combined call** — E11's artefact quality evaluation should be produced by the same rubric-generation LLM call as E17's question generation, not a separate parallel call. This halves input-token cost (the artefact payload is the expensive part) and reduces failure surface. Quality fields are optional in the response schema; if omitted, quality falls back to `unavailable`.

After the design decisions, we determined the existing E11 implementation (4 merged PRs) needed a clean restart rather than incremental patching — the LLD had accumulated contradictions between the original "separate call" design and the new "combined call" decision. All E11 code and the E17 observability schema commit were reverted from `main`.

## Decisions

| Decision | Rationale |
|----------|-----------|
| E17 augments V1 artefact assembly, not replaces it | Prompt guides LLM to exhaust provided artefacts first, tools only for gaps |
| E11 quality evaluation folded into rubric-generation call | Avoids sending artefact payload twice; model already analyses artefacts for question generation |
| Quality fields optional in response schema | If model omits them, quality falls back to `unavailable` — same resilience as separate call |
| Full revert of E11 code + E11 LLD rewrite | Patching ~15 places in a contradictory LLD is riskier than a clean rewrite |
| E17 LLD kept as-is | Already clean after today's edits; tasks §17.1a–d unaffected |
| E17 GH issues kept (except #241) | Map 1:1 to LLD tasks; only #246 (§17.1e) needed body update for E11 consolidation |

## Shipped

| # | Commit | Scope |
|---|--------|-------|
| 1 | `docs: E17 design review — augment framing + E11 consolidated call` (0c03b58) | LLD E17, LLD E11, ADR-0023, v2-requirements updates |
| 2 | `docs: v2-requirements v0.4 — fix E11/E17 combined-call semantics` (b8a808d) | Requirements: Story 11.1 AC4 rewritten, Story 17.1 gains combined-quality + prompt-guidance ACs |
| 3 | `Revert "feat: artefact-quality results page block + flag matrix #238"` (b2c51f8) | Revert E11 display + flag matrix + pipeline + thresholds + evaluator |
| 4 | `Revert "feat: artefact quality persistence schema + finalise_rubric_v2 RPC"` (5f2cc8b) | Revert E11 schema + remaining E17 schema (finalise_rubric_v3) |

## GH Issue Changes

| Issue | Action | Reason |
|-------|--------|--------|
| #241 | Closed | Not a standalone task; `additional_context_suggestions` handled within §17.1d/§17.1e |
| #246 | Body updated | Added E11 consolidation scope, combined-call BDD specs, prompt guidance |
| #240 | Body updated | Removed #241 from task list + dependency graph; Wave 1 now 3 tasks; added E11 consolidation to rolled-up ACs |

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run` — 87 files, 725 tests, all passing
- `npx supabase db diff` — no schema drift
- Local DB reset successful

## Remaining Work

- **Rewrite E11 LLD from scratch** — clean doc reflecting combined-call reality (quality as part of rubric-generation, not standalone)
- **Delete remote E17 feature branches** — PRs already closed, branches still on remote
- **`/architect` for E11** — create fresh GH issues from the rewritten LLD
- **E17 implementation** — proceed with existing issues (#245, #249, #250, #243, #246, #251, #247)
