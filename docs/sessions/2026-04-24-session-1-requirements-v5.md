# Session Log — 2026-04-24 Session 1: V5 Requirements (Token Budget Enforcement)

## Skill

`/requirements`

## Summary

Produced V5 requirements for token budget enforcement — the fix for epic-scale assessments exceeding the LLM's context window. Triggered by a real failure: epic #240 (7 child issues, 7 PRs, 33 files) assembled ~326K tokens against a 163K limit.

## Key Decisions

1. **Strategy: truncate + surface + agentic retrieval.** Don't try to out-filter the LLM — truncate to fit, tell the user what was lost, let them enable retrieval so the LLM can fetch what it needs via tools.
2. **Model-aware budget from OpenRouter API.** `GET /api/v1/models` returns `context_length` per model. No hardcoded map. Fallback: 130K (Deepseek 160K × 0.8).
3. **Budget = contextLimit × 0.8.** 20% reserve for system prompt, output tokens, and tool-use overhead.
4. **Truncation details persisted in DB.** Two new columns on `assessments`: `token_budget_applied` (boolean) and `truncation_notes` (jsonb). Visible on every visit to the results page, not ephemeral.
5. **No auto-enable of retrieval.** Surface a recommendation message; user decides.

## Artefacts Produced

- `docs/requirements/v5-requirements.md` — Final, 1 epic, 3 stories, 18 ACs

## Open Questions Carried Forward

- OQ-1: Should epic issue bodies be elevated above PR diffs in truncation priority? (Deferred to LLD/architect phase)

## Next Steps

1. `/architect` for V5 Epic 1
2. `/feature` for Stories 1.1 → 1.2 → 1.3
