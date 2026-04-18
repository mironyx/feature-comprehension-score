# Session Log — 2026-04-18 Session 3: /architect E17 Design Alignment

## Context

V2 requirements v0.5 updated E17 (Agentic Artefact Retrieval) with 8 changes following E11 cancellation and design review comments. Existing LLD, ADR, epic, and task issues needed alignment.

## What was done

### Design artefact patches

- **ADR-0023**: Replaced "Artefact quality evaluation (E11) — combined call" section with cancellation note. Updated consequence line.
- **LLD lld-v2-e17-agentic-retrieval.md** (13 edits):
  - Stripped all E11 references (purpose, §17.1d RPC params, §17.1e title/content/BDD specs/ACs, cross-epic ordering, open question #3)
  - Updated timeouts: 60s → 120s whole-loop (configurable) + 10s per-tool-call fixed
  - Added `retrieval_timeout_seconds` to org_config schema and §17.2a UI
  - Added `perToolCallTimeoutMs` to `ToolLoopBounds` type and `DEFAULT_TOOL_LOOP_BOUNDS`
  - Added actor clarification (GitHub App installation token) and repo-scoping to §17.1b
  - Added "Missing artefacts" summary to §17.2b + renamed component to `RetrievalDetailsCard`
  - Added `warn`-level logging for `iteration_limit_reached`
  - Updated task breakdown table descriptions
  - Restructured structural overview with Engine/Adapter/UI namespace layers
  - Added `ToolCallLogEntry` type and `RetrievalDetailsCard` to structural diagram
  - Extracted `executeToolCall` helper from inline for-loop in §17.1c pseudocode
  - Added multi-turn happy-path BDD spec
  - Renamed `finalise_rubric_v3` → `finalise_rubric` throughout (no v2 shipped)
  - Renamed all `perCallTimeoutMs` → `perToolCallTimeoutMs` and `per-call` → `per-tool-call`

### GitHub issue patches

- **#240 (epic)**: Stripped E11 from goal, rolled-up ACs, dependency graph, execution order notes, and dependencies section. Updated task list descriptions.
- **#245**: Updated timeout defaults in BDD specs and ACs (60s → 120s + 10s per-call).
- **#243**: Added `retrieval_timeout_seconds` to schema additions and ACs. Updated title.
- **#246**: Stripped E11 consolidation from scope, behaviour, BDD specs, and ACs. Added `retrieval_timeout_seconds` reading. Updated title.
- **#251**: Added loop timeout field (3 fields, not 2). Updated title, UI fields section, BDD specs, ACs.
- **#247**: Added "Missing artefacts" summary, "Retrieval details" naming, `not_found` styling. Updated title. Renamed component to `RetrievalDetailsCard`.

## Commits

- `edaad0c` — docs: align E17 design artefacts with v2-requirements v0.5
- `ebbbeb1` — docs(sessions): architect E17 design alignment session log
- `ac10d29` — fix: remove HTML tags from Mermaid sequence diagram participant aliases
- `473e035` — docs: rename perCallTimeoutMs → perToolCallTimeoutMs in E17 LLD
- `3e44b3a` — docs: add not_found flow and ToolCallLogEntry to E17 structural overview
- `59a7941` — docs: LLD review fixes — extract helper, happy-path spec, rename RPC, per-tool-call consistency

## Decisions

- Patched rather than rewrote — ~70% of existing content was correct.
- ADR-0023 E11 section replaced with cancellation note rather than deleted, to preserve the decision trail.
- Renamed `perCallTimeoutMs` → `perToolCallTimeoutMs` to disambiguate tool handler vs LLM call timeout.
- Dropped `_v3` suffix from `finalise_rubric` — E11 cancelled before `_v2` shipped, no version suffix needed.
- Structural overview restructured with Mermaid `namespace` blocks for ports-and-adapters clarity.

## Open items

- None. All 13 findings from the health assessment are resolved. E17 is ready for `/feature` implementation.

## Execution waves (unchanged)

| Wave | Issues | Notes |
|------|--------|-------|
| 1 | #245, #249, #243 | Parallelisable from start |
| 2 | #250, #251 | #245 → #250; #243 → #251 |
| 3 | #246 | Central integration point |
| 4 | #247 | UI depends on observability fields |
