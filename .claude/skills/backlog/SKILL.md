---
name: backlog
description: Run backlog maintenance. Reads the project board, open issues, all requirements docs (current and future), recent session logs, retros, drift reports, and ADRs; produces a propose-only grooming report that recommends ≥10 next items, flags backlog health, surfaces coverage gaps, sanity-checks the current project phase, and proposes new ideas informed by light web research. Use when unsure what to pick up next, or after finishing a batch of work. Produces a report in docs/reports/. Never mutates issues or the board.
allowed-tools: Read, Write, Bash, Glob, Grep, WebSearch, WebFetch
---

# Backlog Grooming

Synthesises the state of the backlog from multiple signals and proposes next actions for human approval.

## Ground rule — propose-only

This skill **never** mutates state:

- No `gh issue create`, `gh issue edit`, `gh issue close`, `gh issue comment`.
- No `gh-project-status.sh` calls that change status.
- No edits to `docs/requirements/`, `docs/design/`, `docs/adr/`, or `CLAUDE.md`.

Write only the report file in `docs/reports/`. The human reads the report and actions approved items manually (or invokes the relevant skill: `/feature`, `gh-create-issue.sh`, etc.).

## Instructions

### 1. Gather data

Read broadly. Do not cap inputs arbitrarily — if a file is relevant, read it.

**Board and issues:**
- `gh project item-list 2 --owner mironyx --format json --limit 300` — full board snapshot.
- `gh issue list --state open --limit 300 --json number,title,labels,updatedAt,createdAt,body,assignees` — every open issue, including bodies (needed for acceptance-criteria checks).
- `gh issue list --state closed --limit 100 --json number,title,closedAt,labels` — recent closes, to compute "progress since last grooming".

**Requirements — read ALL files in `docs/requirements/`**, not just the current version. Include:
- Current version (e.g. `v1-requirements.md`).
- Future versions (`v2-requirements.md`, `v3-requirements.md`, etc.) — these hold ideas that belong in the backlog eventually.
- Proposed additions (`*-proposed-additions.md`) — ideas not yet accepted into a version.
- Domain-specific requirements (e.g. `req-onboarding-and-auth.md`).
- Anything else in that directory.

Treat future-version requirements as a **source of ideas**, not an immediate gap. Flag them as "not yet scheduled" but surface them when the current phase nears completion.

**Recent activity:**
- `docs/sessions/` — all session logs since the last grooming report. If there is no prior grooming, read the last ~14 days of sessions. These reveal stuck patterns, deferred work, recurring themes, and mood.
- `git log --oneline --since="<date of last grooming or 14d ago>"` — commit cadence.

**Reports:**
- Most recent `docs/reports/backlog/*-backlog-grooming.md` — to track which proposals were actioned.
- Most recent `docs/reports/drift/*-drift-report.md` — extract Critical/Warning findings not yet tracked by an issue.
- Most recent `docs/reports/retro/*-process-retro.md` — extract "New actions" rows not yet tracked by an issue.
- Most recent `docs/reports/baseline/*-baseline.md` — authoritative picture of what is actually built. Use this to distinguish genuine coverage gaps from already-delivered work when assessing requirements.

**Design / decisions:**
- `docs/adr/` — browse for recent ADRs that may imply follow-up work (superseded decisions, accepted proposals).
- `docs/design/` — skim LLDs / HLDs for any "TODO", "deferred", "out of scope" markers.
- `docs/plans/` — implementation plans may list phases/sections not yet started.

**Phase context:**
- `CLAUDE.md` — note the declared current phase.

### 2. Sanity-check the declared phase

Do not trust `CLAUDE.md`'s "Current Phase" line blindly. Compare it against:

- What has actually shipped (closed issues in current phase's epics).
- What the implementation plan says "done" means for this phase.
- Whether recent session logs describe work from this phase or a later one.

If there is a mismatch, flag it clearly in the report under a **Phase accuracy** section:

- "CLAUDE.md says Phase 1, but Phase 1 work closed 2 weeks ago — we appear to be in Phase 2 by activity."
- "CLAUDE.md says Phase 2, but 3 of 8 Phase 1 acceptance items remain open."
- Recommend a concrete `CLAUDE.md` edit (as a proposal, not an action).

### 3. Assess backlog health

Evaluate each open issue:

| Check | What to look for |
|-------|-----------------|
| **Epic link** | Task issues (`kind:task`) must reference a parent epic. Flag tasks without it. |
| **Acceptance criteria** | Body contains Given/When/Then or explicit acceptance list. Flag if absent. |
| **Size indicator** | Body hints at scope (files touched, L1-L5 label, estimated lines). Flag if totally unsized. |
| **Staleness** | `In Progress` not updated in >3 days. `Todo` not updated in >30 days. `Blocked` not updated in >14 days. |
| **Blocked with no unblock path** | `Blocked` items with no comment or body text explaining what unblocks them. |
| **Duplicates / overlap** | Two open issues covering the same surface area. |
| **Orphaned** | Open issue with no board entry, or board entry with no open issue. |
| **Label hygiene** | Missing `kind:*`, missing phase/priority, contradictory labels. |

### 4. Identify coverage gaps

- **Current-version requirements → issues**: for each requirement in the current version doc, check whether an open or closed issue exists. Flag gaps.
- **Future-version requirements → parked ideas**: surface these in a separate section so the human knows they exist, without treating them as overdue.
- **Drift findings → issues**: Critical/Warning findings with no corresponding issue.
- **Retro actions → issues**: retro "New actions" rows with no corresponding issue.
- **ADR follow-ups → issues**: recent ADRs implying work (e.g. "we will migrate to X") without tracking issues.

### 5. Be creative — propose new ideas

Backlog grooming is not purely mechanical. Spend real effort here:

- **Re-read the FCS article** (`local-docs/feature-comprehension-score-article.md`) and ask: what would make this product more *convincing* as a dogfooding example? What would a skeptical reader want to see that we haven't built yet?
- **Think about the user journey end-to-end** — where are the rough edges? Onboarding? Empty states? Error recovery? Mobile? What would make a first-time user say "this is polished"?
- **Consider adjacent capabilities** — what natural extensions of current features would deepen the product without bloating scope?
- **Light web research** (use WebSearch sparingly, 1-3 queries max): what are comparable products doing that we could adapt? What does "state of the art" look like for code-comprehension / engineering-metrics tools in the current year? Do not blindly copy — use for inspiration and flag ideas explicitly as "external inspiration".
- **Read between the lines of session logs** — if the human repeatedly complains about something, that's a backlog candidate even if no issue tracks it.

Label each creative proposal clearly: **Source: creative / research / session-log theme**. Never present speculation as if it came from requirements.

### 6. Recommend next — at least 10 items

Score the top items using:

```
score = 0.4 * value
      + 0.3 * unblocks
      + 0.2 * risk_of_drift
      + 0.1 * (1 - effort)
```

Where each factor is 0.0–1.0:

- **value** — user-visible progress toward the current phase goal.
- **unblocks** — how many other issues become actionable once this is done.
- **risk_of_drift** — likelihood that delay creates design↔code drift, stale context, or rework.
- **effort** — estimated relative effort (1.0 = week+, 0.1 = <1h). Smaller scores higher via `(1 - effort)`.

Show the score AND the four component values for each recommendation. Transparency matters more than precision.

Recommend at least **10** items. Group them:

- **Top priority (score ≥ 0.6)** — strong cases to pick up next.
- **Worth doing soon (0.45–0.59)** — solid candidates once top priority is drained.
- **Lower priority (< 0.45)** — listed for completeness, may get deprioritised further.

If fewer than 10 existing issues are viable, fill the remaining slots with **proposed new issues** from section 5. Mark these clearly as "proposed, not yet created".

### 7. Write the report

Save to `docs/reports/backlog/YYYY-MM-DD-backlog-grooming.md` using this structure:

```markdown
# Backlog Grooming

**Date:** YYYY-MM-DD
**Period since last grooming:** [date of previous report, or "first grooming"]
**Declared phase (CLAUDE.md):** [quoted verbatim]

## Summary

| Column | Count |
|--------|-------|
| Todo | N |
| In Progress | N |
| Blocked | N |
| Done (since last grooming) | N |

[Two-sentence state of the backlog and overall health verdict.]

## Phase accuracy

[Either "CLAUDE.md phase matches observed activity" or a concrete mismatch with evidence and a proposed edit.]

## Progress since last grooming

- Closed: #123 (<title>), #124 (<title>)…
- Moved to In Progress: #125

## Actions from previous grooming

| Proposal | Status | Notes |
|----------|--------|-------|
| [proposal from previous report] | Actioned / Ignored / Partial | [what happened] |

## In-flight health

- **#125** — In Progress, last update 5 days ago. Risk: stale branch.
- **#126** — Blocked on #200, no path-to-unblock noted.

## Backlog health findings

| # | Issue | Finding | Severity |
|---|-------|---------|----------|
| 1 | #127 | Missing acceptance criteria | Warning |
| 2 | #128 | No epic link (kind:task) | Warning |
| 3 | #129 | Potential duplicate of #130 | Info |

## Requirements coverage

### Current version (vN) gaps
- **R-12** "filter repos by language" — no issue exists.

### Parked future ideas (vN+1, proposed additions)
- **v2-R-3** "comparison view across assessments" — noted, not yet scheduled.

## Signals from reports

### From latest drift report
- **Critical:** [finding] — no issue tracks this.

### From latest retro
- Action "add SLA check to engine" — no issue.

### From recent ADRs
- ADR-0020 implies follow-up work on X — no issue.

## Creative / research proposals

- **[idea title]** — source: creative. Rationale: [why worth considering]. Effort estimate: [low/med/high].
- **[idea title]** — source: research ([link]). Rationale: ... Not a recommendation to copy — flagging as inspiration.

## Recommended next (≥10 items, propose-only)

### Top priority (score ≥ 0.6)

| Rank | # / proposal | Title | Score | V | U | R | 1-E | Rationale |
|------|--------------|-------|-------|---|---|---|-----|-----------|
| 1 | #131 | ... | 0.78 | 0.9 | 0.6 | 0.7 | 0.7 | Unblocks #132; closes R-5 |
| 2 | (new) | "…" | 0.72 | … | … | … | … | From drift Critical |

### Worth doing soon (0.45–0.59)

| Rank | # / proposal | Title | Score | V | U | R | 1-E | Rationale |
|------|--------------|-------|-------|---|---|---|-----|-----------|

### Lower priority (<0.45)

| Rank | # / proposal | Title | Score | V | U | R | 1-E | Rationale |
|------|--------------|-------|-------|---|---|---|-----|-----------|

## Proposed new issues (NOT created — human-approve to action)

- [ ] **"<title>"** — source: [drift / retro / requirements gap / creative].
  - Suggested labels: …
  - Suggested epic: #…
  - Suggested acceptance criteria: …

## Proposed reprioritisation (NOT actioned)

- Move #X above #Y — higher score, unblocks downstream.
- Move #Z to Blocked — depends on #X which is not yet started.

## Proposed issue edits (NOT actioned)

- #127 — add acceptance criteria (suggested text below).
- #128 — link to parent epic #100.
```

### 8. Summarise to the user

Keep the terminal summary under 20 lines:

- Board summary table (counts per column).
- Phase-accuracy verdict (one line).
- Top 5 recommendations with one-line rationale each (full 10+ list is in the report).
- Counts: proposed new issues / reprioritisations / edits.
- File path to the full report.

The report is authoritative — do not duplicate it in the terminal.

## When to run

- When unsure what to work on next.
- After a batch of completed work (2-3 merged PRs).
- Before starting a new phase (to audit coverage of the outgoing phase).
- When the board feels stale or unclear.

## What this skill is NOT

- **Not `/retro`** — /retro is about process health (how we work). /backlog is about product health (what we build next).
- **Not `/drift-scan`** — /drift-scan detects requirements↔design↔code mismatches. /backlog consumes drift output.
- **Not PO acceptance** — a separate skill (future) will walk deployed features against requirements on a test environment. /backlog is desk-based analysis only.
- **Not auto-actioning** — propose-only. The human reviews and invokes the relevant skill to action approved items.
