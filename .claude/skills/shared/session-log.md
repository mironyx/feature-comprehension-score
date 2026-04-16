# Session Log Guide

Shared template referenced by planning skills (`/kickoff`, `/requirements`, `/architect`) and any other skill that produces design artefacts over a non-trivial session. `/feature-end` has its own implementation-focused variant — don't use this guide there.

## Filename

`docs/sessions/YYYY-MM-DD-session-N-<skill>-<slug>.md`

Examples:

- `2026-04-16-session-4-architect-e11-e17.md`
- `2026-03-09-session-1-kickoff-feature-comprehension-score.md`
- `2026-04-02-session-2-requirements-v2.md`

If a pre-compact-hook draft exists for the same session ID (`docs/sessions/YYYY-MM-DD-session-N-draft.md`), promote it to the real log and delete the draft in the same commit.

## Required sections

1. **Summary** — one paragraph. What was produced, what pivoted, what stopped. This is the only section that must be readable in isolation.
2. **Shipped** — table: commit hash / scope. Every commit this session produced.
3. **Board state** — what issues / epics exist or changed as a result of the session.
4. **Cross-cutting decisions** — ADRs created, architectural pivots, invariants that span multiple artefacts.
5. **What didn't go to plan** — mid-session rewrites, scope revisions, design pivots. Be candid. Fastest-decaying content, so capture now.
6. **Process notes for `/retro`** — explicit hand-off: friction in the skill itself, requirements gaps, missed guardrails, template improvements.
7. **Next step** — which follow-on skill invocation picks this up.

Keep it concise — one screen is typical. Density over completeness.

## Commit

Session logs commit separately from the artefacts they describe:

```bash
git add docs/sessions/<filename>
git commit -m "docs(sessions): <skill> session for <scope>"
```

## When to write

At the end of the skill, after all artefacts are committed but **before** the final report step. Writing the log forces you to name what happened clearly; this often surfaces decisions you were about to leave undocumented in the report.

## What not to include

- Step-by-step narration of what you did — git log covers that.
- Full content of artefacts produced — they're linked from the Shipped table.
- Self-congratulatory framing — the retro will judge the work; the log captures the facts.
