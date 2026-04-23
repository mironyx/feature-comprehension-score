# Backlog — Triage List

Capture point for gaps, ideas, and small enhancements. Items here are untriaged.
When ready to work on, create a GitHub issue and move to the project board.

## Format

```
### [Short title]
- **Source:** [how it was found — bug investigation, dogfooding, drift scan, etc.]
- **Type:** gap | enhancement | idea
- **Affected area:** [component or story reference]
- **Summary:** [1-2 sentences]
- **Issue:** #N (when promoted)
```

---

## Items

### Post-creation participant management

- **Source:** /bug investigation 2026-04-23
- **Type:** gap
- **Affected area:** assessment participant lifecycle
- **Summary:** No UI or API for adding/removing participants after an assessment is created. The DB schema supports it (`status: 'removed'`, `removed_at` column) but no application code implements the transitions. No explicit requirement covers post-creation management — Story 3.1 scopes add/remove to "before confirming".
- **Issue:** —
