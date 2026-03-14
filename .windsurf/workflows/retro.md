---
description: Run a process retrospective. Reviews recent sessions, git history, issue board state, and drift reports to identify what's working, what isn't, and what to change. Produces a report in docs/reports/.
---

# Process Retrospective

Analyses the development process since the last retro (or project start) and produces a process improvement report.

## Instructions

### 1. Gather data

- **Session logs** — Read all files in `docs/sessions/` since the last retro (or all if this is the first retro). These capture completed work, decisions, and conversation summaries.
- **Git history** — Run `git log --oneline` to see commit frequency, message quality, and whether atomic commits per task are happening.
- **GitHub Issues** — Run `gh issue list --state all --json number,title,state,labels` to assess backlog health.
- **Project board** — Run `gh project item-list 1 --owner leonids2005` to check priority ordering and status accuracy.
- **Drift reports** — Read any drift reports in `docs/reports/` generated since the last retro. Note whether any design↔code drift findings (Critical/Warning) were raised and whether they were resolved within the same or next session.
- **Previous retro** — Read the most recent `docs/reports/YYYY-MM-DD-process-retro.md` if one exists, to check whether previous actions were implemented.

### 2. Assess process health

Evaluate against these dimensions:

| Dimension | What to look for |
|-----------|-----------------|
| **Backlog hygiene** | Are issues labelled (`ready`/`blocked`/`in-progress`)? Is priority ordering maintained? Are dependencies explicit? |
| **Definition of done** | Are issues being closed with all DoD checklist items ticked? Or are cross-references and drift checks being skipped? |
| **Commit discipline** | One commit per completed task? Conventional commit messages with issue references? Untracked files at session end? |
| **Session continuity** | Are session logs being written? Do they contain all four sections (completed work, decisions, summary, next guidance)? Is the next session able to orient quickly? |
| **Drift management** | Is drift scan being run at session end and before level transitions? Are critical drift items (including design↔code mismatches) being resolved within one session? |
| **Multi-agent readiness** | Are tasks scoped to single files? Are cross-reference updates deferred as follow-up issues? Could a second agent pick up a `ready` issue and work independently? |

### 3. Write the report

Save to `docs/reports/YYYY-MM-DD-process-retro.md` using this structure:

```markdown
# Process Retrospective

**Date:** YYYY-MM-DD
**Period:** [date of last retro or project start] to today
**Sessions reviewed:** [list session numbers/dates]

## What went well

- [Things that worked — keep doing these]

## What needs improving

- [Problems observed, with evidence from the data gathered]

## Actions from previous retro

| Action | Status | Notes |
|--------|--------|-------|
| [action from last retro] | Done / Partial / Not started | [what happened] |

## New actions

| # | Action | Addresses |
|---|--------|-----------|
| 1 | [concrete action] | [which problem] |

## Process health scorecard

| Dimension | Rating | Notes |
|-----------|--------|-------|
| Backlog hygiene | Green / Amber / Red | [brief explanation] |
| Definition of done | Green / Amber / Red | |
| Commit discipline | Green / Amber / Red | |
| Session continuity | Green / Amber / Red | |
| Drift management | Green / Amber / Red | |
| Multi-agent readiness | Green / Amber / Red | |
```

### 4. Summarise

Present:
- The health scorecard
- Top 3 actions to take
- Comparison with previous retro (if one exists)
- The file path to the full report
