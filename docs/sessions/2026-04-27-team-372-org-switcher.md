# Team session — 2026-04-27 · #372 org-switcher picker

## Issues shipped

| Issue | Story | PR | Branch | Merged |
|---|---|---|---|---|
| #372 | feat: replace OrgSwitcher with on-demand picker (stories 1.1–1.3) | #375 | feat/org-switcher-picker | 2026-04-27 |

## Cross-cutting decisions

- Single-task epic — no wave coordination required; teammate spawned immediately.
- Markdownlint removed from skill verification pipeline during this session (`.claude/skills/feature-core/SKILL.md`, `.claude/agents/test-runner.md`) — run on demand only.
- Branch protection check removed from `feature-end` skill (Step 7.5 dropped).

## Coordination events

- Teammate completed feature-end autonomously without waiting for a second forward signal — the `/feature-end` ran immediately on PR approval.
- No blockers, no CI flakes, no rebases required.

## What worked / what didn't

- **Worked:** Single-task epic ran cleanly end-to-end. CodeScene 10.0 on all changed files. All 26 unit tests passing.
- **Worked:** Teammate self-corrected review blockers (invalid ARIA roles, duplicate Escape handling) before PR was approved.
- **Didn't:** No issues — smooth run.

## Process notes for `/retro`

- Removing markdownlint from automated pipelines was the right call; it has caused repeated CI fix cycles across many prior sessions with no proportionate benefit.
- Branch protection check in feature-end was dead weight on a private repo without GitHub Pro — good to drop.
