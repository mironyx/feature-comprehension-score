# Process Improvement Report

**Date:** 2026-03-05
**Phase:** Phase 0: Foundation
**Scope:** Development process review after first 3 days of project work

---

## 1. Summary of Work Completed

### Timeline

| Day | Date | Key Outputs |
|-----|------|-------------|
| 1 | 2026-03-03 | Initial commit, project structure, CLAUDE.md, custom skills (`/create-adr`, `/create-plan`, `/drift-scan`), drift detection agent, V1 requirements plan |
| 2 | 2026-03-04 | V1 requirements document (32 stories, 6 epics), implementation plan (6 phases), confirmed key decisions (roles, Naur layers, question counts, aggregate scoring, admin-first UI) |
| 3 | 2026-03-05 | Design document L1 (Capabilities) + partial L2 (Components), 2 research spikes completed (GitHub Check API, Supabase Auth), ADR-0003 accepted, 12 GitHub issues created, project board set up, first drift scan |

### Artefact Status

| Artefact | Status | Notes |
|----------|--------|-------|
| Requirements (32 stories) | v0.2, mostly complete | Some stale references (Repo Admin role, Naur layer names) |
| Design L1 (Capabilities) | Complete | 100% story coverage |
| Design L2 (Components) | 28% coverage | Epics 1, 3, 6 have no component design |
| Design L3 (Interactions) | Not started | Blocked by L2 completion and ADR-0002 |
| Design L4 (Contracts) | Not started | Blocked by L3 |
| ADRs | 1 of 8 written (ADR-0003) | 7 pending |
| Research spikes | 2 of 4 complete | Spikes 003, 004 done; hosting and permissions remain |
| Code | None | Correct for Phase 0 |

### Commits

3 commits total. 2 of 3 not pushed to remote. Untracked files include ADRs, spike documents, and reports.

---

## 2. Process Problems Identified

### P1: No authoritative, ordered backlog

**Observation:** We have 9 open GitHub issues and an implementation plan listing work items, but these two sources are not synchronised. The implementation plan prescribes a sequence (§0.2: ADR-0004 first, then ADR-0002, then ADR-0003, etc.) but the project board is a flat "Todo" column with no ordering. When a new session starts, the agent must re-read the implementation plan, cross-reference with the issue list, check the drift report, and infer what to do next.

**Impact:** At the start of each session, significant time is spent on orientation rather than production. The agent may pick up work that feels productive but is not the highest-priority item, or may miss that a prerequisite has been completed.

### P2: Dependencies are implicit, not tracked

**Observation:** Issue #8 (L3 Interactions) says "Blocked by L2 Components approval" in its body text, but there is no GitHub "blocked" status or formal dependency link. ADR-0008 (Data model) depends on ADR-0004 (Roles), but this is only discoverable by reading the issue body. The implementation plan lists a sequence, but issues do not reference each other.

**Impact:** An agent (or multiple agents) cannot programmatically determine which tasks are unblocked. A parallel agent might pick up a blocked task and either produce work that needs revision or waste a session discovering the blocker.

### P3: No "definition of done" per task

**Observation:** Issues describe what to produce but not what constitutes completion. When is an ADR "done"? When the markdown file exists? When it is committed? When the requirements document is updated to reference it? When the drift scan confirms no new gaps? Issue #6 (ADR-0003) was closed, but the drift report shows the requirements document was not updated to reflect its decisions (W6).

**Impact:** Tasks get marked as done prematurely. Downstream inconsistencies accumulate. The drift scan catches them eventually, but by then the original context is lost.

### P4: Infrequent commits create risk and ambiguity

**Observation:** 3 commits across 3 days. Each commit bundles multiple artefacts (the second commit includes skills, requirements plan, and implementation plan together). Untracked files (ADRs, spikes, reports) exist but are not committed.

**Impact:** Work can be lost. Git history does not reflect the actual sequence of decisions. A new agent session cannot rely on the repo state to understand what has been done — it must also check for untracked files.

### P5: Session context is lost between conversations

**Observation:** Each Claude Code session starts fresh. The agent reads CLAUDE.md, which points to reference documents, but there is no record of what happened in the previous session, what was decided conversationally, or what the user's current priorities are. The implementation plan was written on day 2 but is already partially stale (spikes 003/004 are done but not marked done in the plan).

**Impact:** The first portion of each session is spent rediscovering context. Decisions made verbally in a session but not captured in documents are lost. The agent may repeat analysis or ask questions that were already answered.

### P6: Drift scan is reactive, not integrated into workflow

**Observation:** The drift scan was run once on day 3 and produced a comprehensive report. But the report sits as a file — its findings are not linked to issues, not tracked as tasks, and not gated on before proceeding.

**Impact:** Drift accumulates between scans. Quick fixes (15-minute documentation cleanups) get deferred indefinitely because they are not in the issue backlog.

---

## 3. Recommendations

### R1: Create a single-source prioritised backlog

**Problem addressed:** P1, P2

**Proposal:** Maintain a `docs/backlog.md` file that serves as the authoritative, ordered task list. This file is the first thing any agent reads after CLAUDE.md. It replaces the need to cross-reference the implementation plan, issue list, and drift report to determine next actions.

**Format:**

```markdown
# Backlog

Last updated: 2026-03-05

## Ready (unblocked, in priority order)

1. **Housekeeping: fix documentation inconsistencies** — #13
   - Fix Repo Admin → Org Admin (W4, W5), Naur layer names (W7), add Story 2.9 to design (W2)
   - DoD: requirements doc updated, drift scan confirms W4/W5/W7/W2 resolved, committed

2. **ADR-0002: Hosting — Vercel vs GCP Cloud Run** — #5
   - Blocks: L3 Interactions (#8), all deployment design
   - DoD: ADR file written, requirements updated, design doc deployment references resolved, committed

3. **ADR-0004: Roles & access control model** — #2
   - Blocks: all UI stories, ADR-0008
   - DoD: ADR file written, requirements roles section aligned, committed

## Blocked

- **ADR-0008: Data model & multi-tenancy** — #7 — blocked by #2 (ADR-0004)
- **Design L3: Interactions** — #8 — blocked by #5 (ADR-0002) and L2 completion
- **Design L2: Complete for Epics 1, 3, 6** — needs issue — blocked by #2 (ADR-0004)

## Low priority (do when convenient)

- **ADR-0005: Single aggregate score** — #10 — not blocking
- **ADR-0006: Soft/Hard enforcement modes** — #11 — not blocking
- **ADR-0007: PR size threshold criteria** — #12 — not blocking
```

**Maintenance rule:** Update `backlog.md` at the end of every session. When an item is completed, remove it from the backlog and move any newly unblocked items from "Blocked" to "Ready". This is the session's final action before committing.

### R2: Add a definition of done checklist to each task

**Problem addressed:** P3

**Proposal:** Every backlog item and every GitHub issue includes a "Definition of Done" checklist. Standard items:

- [ ] Primary artefact created/updated (ADR file, design section, etc.)
- [ ] Cross-references added to related documents (requirements, design, other ADRs)
- [ ] Committed to repository
- [ ] Drift scan confirms no new critical/warning items introduced
- [ ] Backlog updated (completed item removed, blocked items reassessed)

This prevents the ADR-0003 situation where the ADR was accepted but the requirements document was not updated to reflect its decisions.

### R3: Commit atomically per completed task

**Problem addressed:** P4

**Proposal:** One commit per completed backlog item. Use conventional commit messages that reference the issue number:

```
docs: ADR-0004 roles and access control model (#2)
docs: fix Repo Admin references in requirements (drift W4, W5)
docs: complete L2 component design for Epic 1
```

Commit immediately after completing each task, not at the end of the session. This gives clean git history, reduces risk of lost work, and makes it possible for a new session to determine progress from git log alone.

### R4: Maintain a session log

**Problem addressed:** P5

**Proposal:** Create `docs/session-log.md` — a chronological, append-only log updated at the end of each session. Each entry records:

```markdown
## 2026-03-05 — Session 3

### Completed
- Design document L1 (Capabilities) and partial L2 (Components)
- Research spike 003 (GitHub Check API) → findings in spike-003-github-check-api.md
- Research spike 004 (Supabase Auth) → findings in spike-004-supabase-auth-github-oauth.md
- ADR-0003 accepted (Supabase Auth + GitHub OAuth)
- First drift scan → 23% coverage, 3 critical, 8 warnings

### Decisions made
- Confirmed: Check Run + branch protection = merge blocking mechanism
- Confirmed: PKCE flow for Next.js, provider token captured at callback
- Confirmed: Org membership fetched via GitHub API, not from Supabase session

### Open questions carried forward
- ADR-0002 (Hosting) still undecided — needed before L3 design
- Trivial commit heuristic undefined (drift W8)

### Next session should start with
1. Fix documentation inconsistencies (drift W4, W5, W7, W2) — 15 min
2. Decide ADR-0002 (Hosting)
3. Write ADR-0004 (Roles)
```

This gives any future session (human or agent) a 30-second orientation. The "next session should start with" section directly answers "what should I do next?" without re-analysis.

### R5: Run drift scan as a gate

**Problem addressed:** P6

**Proposal:** Run `/drift-scan` at two points:

1. **End of every session** — after all commits. The scan output goes into the session log entry as a summary line (e.g., "Drift: 2 critical, 5 warnings, 30% coverage"). If critical items increased, they become the first items in the next session's backlog.

2. **Before any Level transition** — before starting L3 design, run a scan to confirm L2 is complete and consistent. Before starting L4, confirm L3 is clean. This prevents building on a drifted foundation.

The drift report file continues to be generated, but the actionable items from it should be reflected as backlog items rather than existing only in the report.

### R6: Use GitHub issue labels for agent-readiness

**Problem addressed:** P1, P2

**Proposal:** Add two labels to the GitHub issue system:

- `ready` — task is unblocked and can be picked up
- `blocked` — task has unresolved dependencies (noted in issue body)

When a blocking task is completed, the agent updates downstream issues: remove `blocked` label, add `ready` label. This makes `gh issue list --label ready` a reliable way to find available work.

---

## 4. Enabling Multi-Agent Parallel Work

### The problem

Currently, work is sequential: one human + one agent per session, working through tasks one at a time. The design-down process naturally gates this (L2 before L3, ADRs before design), but within a level there are independent work streams. For example, once ADR-0004 (Roles) is decided, the following tasks could proceed in parallel:

- Agent A: Write L2 component design for Epic 1 (Organisation Setup)
- Agent B: Write L2 component design for Epic 3 (FCS Flow)
- Agent C: Write L2 component design for Epic 6 (Reporting)
- Agent D: Write ADR-0001 (GitHub App) from spike-003 findings

Today, these would be done sequentially in a single session. With multiple agents, they could be done simultaneously — but only if the coordination problems are solved.

### Prerequisites for multi-agent work

#### 4.1 Backlog must be machine-readable

The `backlog.md` format proposed in R1 is human-readable but not easily parseable by agents. For multi-agent coordination, consider a structured format. Options:

**Option A: GitHub Issues as source of truth** (recommended for V1)
- Use issue labels (`ready`, `blocked`, `in-progress`) as the coordination mechanism
- Each agent claims a task by adding the `in-progress` label and self-assigning
- Before starting, the agent runs `gh issue list --label ready` to find available work
- After completing, the agent closes the issue, removes `blocked` from downstream issues, adds `ready` to newly unblocked ones
- `backlog.md` becomes a human-readable view generated from issue state, not the source of truth

**Option B: Structured backlog file** (if GitHub Issues prove too coarse)
- Use a JSON or YAML backlog file with explicit dependency edges
- Agents read the file, claim a task by writing their session ID into it, and update on completion
- Risk: merge conflicts if two agents update simultaneously

Recommendation: Start with Option A. GitHub Issues already exist, have an API, and support atomic label operations.

#### 4.2 Tasks must be independently completable

An agent needs to be able to pick up a task, do it, and commit the result without needing to coordinate mid-task with another agent. This means:

- **Each task produces a distinct file or file section.** Two agents should not be editing the same file simultaneously. If an ADR is one file and a design section is another file, they can proceed in parallel. If both need to update the requirements document, they will conflict.
- **Cross-reference updates are deferred.** When Agent A writes ADR-0004, it should not also update the requirements document (which Agent B might be editing). Instead, it creates a follow-up issue: "Update requirements to reference ADR-0004". These cross-reference tasks are small, serial, and can be batched.
- **Each task has a clear, bounded scope.** "Write ADR-0004" is a good agent task. "Complete all remaining design work" is not.

#### 4.3 File-level locking convention

Since multiple agents may work on branches simultaneously:

- Each agent works on a dedicated branch: `docs/adr-0004-roles`, `docs/l2-epic-1`, etc.
- PRs are opened against `main`
- Merge conflicts are resolved by the second agent to merge (or by the human)
- Rule: each task should touch as few files as possible. Ideally one primary file per task.

#### 4.4 Agent task protocol

When an agent starts a session, it follows this protocol:

```
1. Read CLAUDE.md (orientation)
2. Read docs/session-log.md (last entry — what happened recently)
3. Read docs/backlog.md (or run `gh issue list --label ready`)
4. Pick the highest-priority ready task
5. Claim it (label → in-progress, or update backlog.md)
6. Do the work
7. Commit with conventional commit referencing issue number
8. Run drift scan
9. Update downstream issue labels (unblock dependents)
10. Close the issue
11. Append to session log
12. Update backlog.md
```

This protocol is deterministic. Any agent following it will pick up the right task, do it, and leave the project in a clean state for the next agent.

### What can be parallelised now

Given the current state, here is what becomes parallelisable once the backlog and coordination mechanisms are in place:

**Immediately (no prerequisites):**
- Fix documentation inconsistencies (W4, W5, W7, W2) — touches requirements doc only
- Write ADR-0001 (GitHub App) — spike-003 findings already exist, separate file
- Write ADR-0005 (Aggregate score) — self-contained decision, separate file
- Write ADR-0006 (Soft/Hard modes) — self-contained decision, separate file
- Write ADR-0007 (PR size threshold) — self-contained decision, separate file

**After ADR-0004 (Roles) is completed:**
- L2 component design for Epic 1 — separate design doc section
- L2 component design for Epic 3 — separate design doc section
- L2 component design for Epic 6 — separate design doc section
- Write ADR-0008 (Data model) — depends on roles being defined

**After ADR-0002 (Hosting) is completed:**
- L3 Interactions design — depends on deployment model

### Parallelism constraints

Some work is inherently serial:
- Design levels must proceed in order (L2 → L3 → L4) per the design-down process
- ADR-0004 (Roles) must precede ADR-0008 (Data model)
- ADR-0002 (Hosting) must precede L3 design
- Requirements updates should be batched and done by one agent to avoid merge conflicts

The realistic parallelism ceiling for this project in Phase 0 is **2-3 agents** working simultaneously on independent ADRs or design sections, with one agent handling serial cross-cutting updates.

---

## 5. Proposed Workflow Changes

### Session start protocol

```
1. Read CLAUDE.md
2. Read last session-log entry
3. Read backlog.md
4. Identify highest-priority ready items
5. Confirm with user (or auto-pick if running autonomously)
```

### Session end protocol

```
1. Commit all completed work (one commit per task)
2. Run drift scan
3. Update backlog (remove completed, unblock dependents)
4. Update session log (completed, decisions, next steps)
5. Commit session log and backlog updates
6. Push to remote
```

### Per-task protocol

```
1. Mark task as in-progress (backlog + issue label)
2. Read all referenced documents
3. Do the work
4. Apply definition-of-done checklist
5. Commit
6. Mark task as complete
7. Assess whether downstream tasks are now unblocked
```

---

## 6. Immediate Actions

The following should be done in the next session to implement these process improvements:

| # | Action | Creates |
|---|--------|---------|
| 1 | Create `docs/backlog.md` with current prioritised task list | Single-source backlog |
| 2 | Create `docs/session-log.md` with retrospective entries for days 1-3 | Session continuity |
| 3 | Add `ready` and `blocked` labels to GitHub issues | Agent-readable task states |
| 4 | Update issue labels to reflect current blocked/ready state | Accurate board state |
| 5 | Create a GitHub issue template with definition-of-done checklist | Consistent completion criteria |
| 6 | Add backlog.md and session-log.md to the CLAUDE.md key references table | Agent discoverability |
| 7 | Commit all untracked files | Clean repo state |
| 8 | Fix trivial documentation inconsistencies (drift W4, W5, W7) | Reduced drift |
| 9 | Update CLAUDE.md with session start/end protocols | Codified workflow |

---

## 7. Measuring Improvement

After implementing these changes, track:

| Metric | Current | Target |
|--------|---------|--------|
| Session orientation time (before productive work starts) | Significant (re-reading multiple docs) | Minimal (read session log + backlog) |
| Tasks completed but with missing cross-references | At least 1 (ADR-0003 vs requirements) | 0 (definition of done prevents this) |
| Drift report critical items | 3 | 0 within one session of being reported |
| Commits per completed task | < 1 (batched) | 1 (atomic) |
| Untracked files at session end | Multiple | 0 |
| Agent able to determine next task without human guidance | No | Yes (backlog.md or `gh issue list --label ready`) |

---

*This report was generated from analysis of the project's git history, GitHub issues, project board, requirements, design documents, implementation plan, drift report, and CLAUDE.md configuration.*
