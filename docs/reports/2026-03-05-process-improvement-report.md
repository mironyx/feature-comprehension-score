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

### R1: Make GitHub Issues the single-source prioritised backlog

**Problem addressed:** P1, P2

**Principle:** GitHub Issues is the source of truth for what needs doing. No separate `backlog.md` file — that would create a second source that drifts from the issues. Instead, make the issue system itself queryable and ordered.

**Required issue hygiene:**

1. **Board columns for workflow state:**
   - **Todo** — unblocked, can be picked up. Ordered by priority (highest at top).
   - **Blocked** — has unresolved dependencies (blocker noted in issue body as `Blocked by: #N`).
   - **In Progress** — currently being worked on.
   - **Done** — completed.
   - Existing labels (`L1-capabilities` through `L5-implementation`) remain for design-level classification.
   - *Decision:* Board columns used instead of labels to avoid duplicating state.

2. **Explicit dependency references in issue body:**
   - Every blocked issue must include a line: `Blocked by: #N, #M`
   - When a blocking issue is closed, the agent moves downstream issues from Blocked to Todo

3. **Definition of done checklist in every issue** (see R2)

**Agent task discovery protocol:**
```
gh project item-list 1 --owner leonids2005
```
Check the board for Todo items. Priority is determined by position (highest at top).

**Maintenance rule:** When completing a task, the agent closes the issue and moves dependent issues from Blocked to Todo. This keeps the backlog self-maintaining.

#### Ephemeral local sub-tasks

When an agent picks up an issue, it may need to break it into sub-steps. These are tracked locally using the agent's task management tool (e.g., TodoWrite) — they are ephemeral and not persisted as GitHub Issues. They exist only for the duration of the session.

Example: Issue #2 "ADR-0004: Roles & access control model" might decompose locally into:
1. Read requirements roles section and implementation plan decisions
2. Read spike-004 findings on org membership
3. Draft ADR using `/create-adr` template
4. Update requirements to reference ADR-0004
5. Commit and close issue

These sub-tasks are working memory, not backlog items. They are not created as GitHub Issues because they have no independent value — they only exist in the context of completing the parent issue.

### R2: Add a definition of done checklist to each task

**Problem addressed:** P3

**Proposal:** Every GitHub issue includes a "Definition of Done" checklist in its body. Standard items:

- [ ] Primary artefact created/updated (ADR file, design section, etc.)
- [ ] Cross-references added to related documents (requirements, design, other ADRs)
- [ ] Committed to repository with conventional commit referencing issue number
- [ ] Drift scan confirms no new critical/warning items introduced
- [ ] Downstream issue labels updated (remove `blocked`, add `ready` where applicable)

This prevents the ADR-0003 situation where the ADR was accepted but the requirements document was not updated to reflect its decisions. The checklist is enforced by convention: an agent should not close an issue until all items are ticked.

### R3: Commit atomically per completed task

**Problem addressed:** P4

**Proposal:** One commit per completed issue. Use conventional commit messages that reference the issue number:

```
docs: ADR-0004 roles and access control model (#2)
docs: fix Repo Admin references in requirements (drift W4, W5)
docs: complete L2 component design for Epic 1
```

Commit immediately after completing each task, not at the end of the session. This gives clean git history, reduces risk of lost work, and makes it possible for a new session to determine progress from git log alone.

### R4: Maintain a session log

**Problem addressed:** P5

**Proposal:** One file per session in `docs/sessions/`, named `YYYY-MM-DD-session-N.md`. Written at the end of each session. This is the first thing any agent reads after CLAUDE.md to orient itself.

Each session log captures four sections:

#### Section 1: Completed work
Factual record of what was done. Issues closed, artefacts created or updated, commits made. Brief — one line per item with references to files and issue numbers.

#### Section 2: Decisions made
Significant decisions from conversation that are not yet captured in ADRs, requirements, or design documents. This is the safety net for decisions that happen verbally and would otherwise be lost between sessions. Each entry should note whether the decision is already recorded in a durable artefact or still needs to be.

#### Section 3: Conversation summary
Brief narrative of what was discussed, including dead ends, rejected approaches, and context that shaped decisions. Not a transcript — a distillation. The goal is to prevent the next session from re-exploring paths already explored or re-asking questions already answered.

#### Section 4: Next session guidance
Prioritised list of 2-4 items the next session should start with. Directly answers "what should I do next?" without re-analysis. Should reference GitHub issue numbers where applicable.

**Template:**

```markdown
# Session N — YYYY-MM-DD

## Completed work

- Closed #6: ADR-0003 Auth — Supabase Auth + GitHub OAuth
  - Created `docs/adr/0003-auth-supabase-auth-github-oauth.md`
  - Commit: `abc1234`
- Completed research spike 004 (Supabase Auth)
  - Created `docs/design/spike-004-supabase-auth-github-oauth.md`

## Decisions made

- **PKCE flow for Next.js App Router** — provider token must be captured
  in `/auth/callback` route handler, not middleware.
  Recorded in: ADR-0003 and spike-004.
- **Org membership not in Supabase session** — must fetch via GitHub API
  on each login and cache.
  Recorded in: spike-004. NOT yet in requirements or design doc.

## Conversation summary

Explored two approaches for auth: NextAuth.js vs Supabase Auth. Rejected
NextAuth because [reason]. Discussed token lifecycle — concluded that
provider tokens should be encrypted in Supabase Vault rather than stored
in plain text. User confirmed that org membership caching with 1-hour TTL
is acceptable.

## Next session should start with

1. Fix documentation inconsistencies — drift W4, W5, W7 (#2 partial)
2. Write ADR-0002: Hosting — Vercel vs GCP (#5)
3. Write ADR-0004: Roles & access control (#2)
```

**Maintenance rule:** The session log is the last thing written before the final commit. It should be committed alongside any issue label updates.

### R5: Run drift scan as a gate

**Problem addressed:** P6

**Proposal:** Run `/drift-scan` at two points:

1. **End of every session** — after all commits. The scan output goes into the session log entry as a summary line (e.g., "Drift: 2 critical, 5 warnings, 30% coverage"). If critical items increased, they become the first items in the next session's backlog.

2. **Before any Level transition** — before starting L3 design, run a scan to confirm L2 is complete and consistent. Before starting L4, confirm L3 is clean. This prevents building on a drifted foundation.

The drift report file continues to be generated, but the actionable items from it should be reflected as backlog items rather than existing only in the report.

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

GitHub Issues with labels (as defined in R1) provide this. The coordination mechanism:

- Each agent discovers work via `gh issue list --label ready --state open`
- Claims a task by changing label from `ready` to `in-progress` and self-assigning
- After completing, closes the issue, removes `blocked` from downstream issues, adds `ready` to newly unblocked ones
- Priority is determined by project board ordering — agents pick the top `ready` item

No separate backlog file. GitHub Issues is the single source of truth.

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
2. Read latest session log in docs/sessions/ (what happened recently)
3. Run `gh issue list --label ready --state open` (available work)
4. Pick the highest-priority ready task
5. Claim it (label → in-progress, assign self)
6. Break into local sub-tasks (ephemeral, via TodoWrite or similar)
7. Do the work
8. Commit with conventional commit referencing issue number
9. Run drift scan
10. Update downstream issue labels (unblock dependents)
11. Close the issue
12. Write session log file to docs/sessions/
13. Commit session log
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
2. Read latest session log in docs/sessions/
3. Run `gh issue list --label ready --state open`
4. Identify highest-priority ready items
5. Confirm with user (or auto-pick if running autonomously)
```

### Session end protocol

```
1. Commit all completed work (one commit per task)
2. Run drift scan
3. Update downstream issue labels (remove blocked, add ready)
4. Write session log file to docs/sessions/
5. Commit session log
6. Push to remote
```

### Per-task protocol

```
1. Change issue label from ready to in-progress
2. Break into local ephemeral sub-tasks
3. Read all referenced documents
4. Do the work
5. Apply definition-of-done checklist from issue
6. Commit with conventional commit referencing issue number
7. Close the issue
8. Update labels on downstream issues
```

---

## 6. Immediate Actions

The following should be done in the next session to implement these process improvements:

| # | Action | Creates | Status |
|---|--------|---------|--------|
| 1 | Add `ready`, `blocked`, and `in-progress` labels to GitHub repo | Agent-readable task states | **Modified** — used board "Blocked" column instead of labels to avoid duplicating board state |
| 2 | Update all open issue labels to reflect current blocked/ready state | Accurate board state | **Done** — #7, #8 moved to Blocked; all others in correct columns |
| 3 | Add definition-of-done checklist to all open issues | Consistent completion criteria | **Done (simplified)** — two-item checklist (artefact + commit). Drift scan kept as session-level activity, not per-task gate |
| 4 | Reorder project board "Todo" column by priority | Queryable priority ordering | **Done** — ordered: #2 > #5 > #9 > #10 > #11 > #12 |
| 5 | Create `docs/sessions/` directory with retrospective entries for sessions 1-3 | Session continuity | **Done** — three session logs written |
| 6 | Add `docs/sessions/` to the CLAUDE.md key references table | Agent discoverability | **Done** |
| 7 | Update CLAUDE.md with session start/end/per-task protocols | Codified workflow | **Done** — added as guidance, not enforced ceremony. Session boundaries are informal for now |
| 8 | Commit all untracked files | Clean repo state | **Done** — two commits: `6a61202`, `68211c2` |
| 9 | Fix trivial documentation inconsistencies (drift W4, W5, W7) | Reduced drift | **Done** — W5, W7 were already fixed in requirements v0.2. Cleaned up remaining Repo Admin reference (W4) |

---

## 7. Measuring Improvement

After implementing these changes, track:

| Metric | Current | Target |
|--------|---------|--------|
| Session orientation time (before productive work starts) | Significant (re-reading multiple docs) | Minimal (read session log + `gh issue list --label ready`) |
| Tasks completed but with missing cross-references | At least 1 (ADR-0003 vs requirements) | 0 (definition of done prevents this) |
| Drift report critical items | 3 | 0 within one session of being reported |
| Commits per completed task | < 1 (batched) | 1 (atomic) |
| Untracked files at session end | Multiple | 0 |
| Agent able to determine next task without human guidance | No | Yes (`gh issue list --label ready`) |

---

## 8. Recurring Process Retrospectives

Process improvement is not a one-off. This report captures the initial state, but the process will evolve as we move through phases, introduce multi-agent work, and start writing code.

### The `/retro` command

A `/retro` command has been created (`.claude/commands/retro.md`) to run process retrospectives. It gathers data from session logs, git history, GitHub Issues, drift reports, and previous retros, then produces a structured report with a health scorecard and concrete actions.

### Cadence

- **Phase transitions** — run `/retro` before moving from Phase 0 to Phase 1, Phase 1 to Phase 2, etc. The process that works for "documents only" will not work for "documents + code".
- **Every 3-5 sessions** — if 3 or more sessions have passed since the last retro, the session end protocol should prompt running `/retro` before continuing with feature work.
- **Before starting multi-agent work** — the first time we run parallel agents, run a retro to confirm the coordination mechanisms (labels, scoped tasks, branch conventions) are in place.
- **When something feels off** — if tasks are being picked up in the wrong order, drift is accumulating, or sessions are spending too much time on orientation, that is a signal to run a retro.

### What the retro tracks

Each retro produces a health scorecard across six dimensions:

| Dimension | What it measures |
|-----------|-----------------|
| Backlog hygiene | Are issues labelled, prioritised, and dependencies explicit? |
| Definition of done | Are issues closed with all checklist items completed? |
| Commit discipline | Atomic commits per task, conventional messages, no untracked files? |
| Session continuity | Are session logs written with all four sections? Can the next session orient quickly? |
| Drift management | Is drift scan running regularly? Are critical items resolved promptly? |
| Multi-agent readiness | Are tasks scoped to single files? Can agents work independently? |

### Tracking improvement over time

Each retro checks whether actions from the previous retro were implemented. This creates accountability — a recommendation that was not acted on will resurface in the next retro rather than being silently forgotten.

---

*This report was generated from analysis of the project's git history, GitHub issues, project board, requirements, design documents, implementation plan, drift report, and CLAUDE.md configuration.*

---

## 9. Follow-up Observations — 2026-03-09

Observations from session work after the initial report. Recorded as a brain dump; structured below into problems and proposed actions.

### New Problems Identified

#### P7: GitHub project status updates are operationally expensive

**Observation:** Moving an issue to "In Progress" on the GitHub project board requires a chain of four `gh` CLI calls chained with inline Python: get project ID, get item ID, get field ID, get option ID — then a final `gh project item-edit`. This is fragile, verbose, and slow. Example (actually executed in session):

```bash
gh project item-edit \
  --project-id $(gh project list --owner leonids2005 --format json | python3 -c "import json,sys; print(json.load(sys.stdin)['projects'][0]['id'])") \
  --id $(gh project item-list 1 --owner leonids2005 --format json | python3 -c "import json,sys; [print(i['id']) for i in json.load(sys.stdin)['items'] if i.get('content',{}).get('number')==8]") \
  --field-id $(gh project field-list 1 --owner leonids2005 --format json | python3 -c "import json,sys; [print(f['id']) for f in json.load(sys.stdin)['fields'] if f['name']=='Status']") \
  --single-select-option-id $(gh project field-list 1 --owner leonids2005 --format json | python3 -c "import json,sys; [print(o['id']) for o in next(f for f in json.load(sys.stdin)['fields'] if f['name']=='Status').get('options',[]) if o['name']=='In Progress']")
```

The same four-call pattern repeats for every status transition (In Progress → Done). In practice, status updates were missed or deferred to the end of the session because the cost of doing them correctly was too high mid-task.

**Impact:** Issues were not moved to "In Progress" when work started, and status updates were batched at session end rather than per-task. This defeats the real-time board visibility that R1 was designed to provide.

#### P8: Session startup is slow — multiple round trips to orient

**Observation:** Even with session logs in place (R4), starting a session still required several sequential `gh` calls to discover project state: listing issues, checking board columns, identifying blockers. The session log helps but does not eliminate the back-and-forth.

**Impact:** Session start friction remains high. The orientation protocol is correct in theory but each step requires a network round trip, and blocked items require reading their body to understand why they are blocked.

#### P9: Work started without a GitHub issue

**Observation:** In at least one instance, work began on a task that had no corresponding GitHub issue. The task was completed and committed, but no issue was created, claimed, or closed — breaking the backlog-as-truth-source principle from R1.

**Impact:** The backlog is incomplete. Completed work is not traceable to an issue. The board does not reflect what was actually done.

#### P10: Commit and status discipline slipped mid-session

**Observation:** The intended per-task protocol (commit → close issue → update status) was not consistently followed. Commits and issue closures were deferred to session end. Status updates were incorrect at points during the session.

**Impact:** Mid-session state was unreliable. A second agent reading the board during the session would have seen an inaccurate picture. The post-session cleanup worked, but the process relies on the agent remembering to batch-fix at the end.

#### P11: Scope inflation risk from low-cost AI generation

**Observation:** When generating design and documentation is cheap (AI-assisted), there is a pull toward adding more detail, more sections, more coverage — beyond what is actually needed. Brevity requires more discipline than verbosity when the marginal cost of an extra paragraph is near zero.

**Impact:** Documents grow longer than necessary. ADRs in particular accumulated sections (Forces, Implications subsections) that added length without adding decision clarity. The user explicitly noted this in Session 5 (ADR-0006 trimmed from 174 to 134 lines).

#### P12: Markdown linting and spell-check add friction without proportionate value

**Observation:** Lint and spell-check steps were experienced as overhead that slowed sessions without catching meaningful issues. For a documentation-heavy pre-code phase, formatting consistency is less valuable than content accuracy.

**Impact:** Process friction. Steps that do not pay for themselves should be removed or made optional.

#### P13: Context window fills before session work is complete

**Observation:** Long sessions accumulate context (file reads, command outputs, conversation history) that can exhaust the model's context window before the intended session scope is finished. Work may be cut short or require a new session to complete partial tasks.

**Impact:** Unfinished tasks, incomplete commits, or tasks that span sessions unintentionally — increasing the orientation cost for the next session.

---

### New Recommendations

#### R6: Create a `gh-project` helper script for status updates

**Problem addressed:** P7

**Proposal:** Write a small shell script `scripts/gh-project-status.sh` that wraps the four-call chain into a single command:

```bash
./scripts/gh-project-status.sh <issue-number> <status>
# e.g.
./scripts/gh-project-status.sh 8 "In Progress"
./scripts/gh-project-status.sh 8 "Done"
```

The script resolves project ID, item ID, field ID, and option ID internally. The agent calls one line instead of four chained subshells. This removes the friction that caused status updates to be skipped.

**Alternative considered:** A custom `/gh-status` skill in `.claude/commands/`. This keeps the logic in the agent layer rather than a shell script, which may be preferable for portability.

#### R7: Encode project IDs in CLAUDE.md to eliminate discovery round trips

**Problem addressed:** P7, P8

**Proposal:** The GitHub project ID, Status field ID, and status option IDs (Todo, Blocked, In Progress, Done) are stable — they do not change between sessions. Cache them in `CLAUDE.md` or a dedicated `docs/project-config.md`. The agent reads them once at session start rather than querying for them each time.

This reduces the four-call chain to a single `gh project item-edit` call with known IDs.

#### R8: Enforce "no work without an issue" rule in session protocol

**Problem addressed:** P9

**Proposal:** Add an explicit gate to the per-task protocol:

```
0. If no issue exists for the task → create one before starting
1. Move issue to In Progress (using R6 helper)
2. ... (existing steps)
```

The session log "Next session should start with" section must reference issue numbers. If it cannot, the issue does not exist and must be created.

#### R9: Tighten ADR format — three sections maximum for straightforward decisions

**Problem addressed:** P11

**Proposal:** The ADR template should distinguish between:

- **Simple decisions** (one viable option, context is clear): Status, Context, Decision, Consequences — four sections, target ≤ 60 lines.
- **Contested decisions** (multiple real alternatives evaluated): add Options Considered and Rationale — target ≤ 100 lines.

Forces, Implications subsections, and LLM call strategy tables are only added if they contain information not already present elsewhere. Default posture: omit and add only if needed.

#### R10: Remove markdown lint and spell-check from session protocol

**Problem addressed:** P12

**Proposal:** Drop lint and spell-check as session steps. They are not in the current protocol (CLAUDE.md) but may be invoked ad hoc. Explicitly note in CLAUDE.md that these are not required steps. The drift scan and definition-of-done checklist are the quality gates; formatting consistency is not a gate.

#### R11: Scope sessions explicitly — stop before context fills

**Problem addressed:** P13

**Proposal:** At session start, after identifying the task list, estimate whether the full scope fits in one session. If not, scope down to a single issue before starting. The "Next session should start with" section in the session log is the handoff mechanism — it is better to finish one task cleanly and hand off than to half-finish two tasks.

Add to the per-task protocol:

```
Before starting: confirm this task can be completed before context fills.
If uncertain, pick a smaller task or explicitly scope to a subset.
```

#### R12: Introduce PR-based review flow for agent-produced work

**Problem addressed:** P11 (quality, not just brevity)

**Proposal:** For substantive artefacts (ADRs, design sections, requirements changes), introduce a lightweight PR review loop:

1. Agent produces artefact on a feature branch and opens a draft PR.
2. A second agent (or async review) checks the PR against the definition of done and flags issues as PR comments.
3. Human reviews the PR (with agent commentary already present) and merges or requests changes.
4. After merge, issue is closed.

**Current constraint:** This adds overhead that is disproportionate for Phase 0 single-author documentation. Recommended to trial when parallel agents are active (see §4) — the review step is most valuable when an agent is working autonomously on a branch and the human is not present for the session.

**Minimum viable version for now:** Agent opens a PR instead of committing directly to `main`. Human merges. No second agent review yet. This alone gives a review checkpoint without requiring parallel agent infrastructure.

---

### Updated Immediate Actions

| # | Action | Priority | Status |
|---|--------|----------|--------|
| A1 | Write `scripts/gh-project-status.sh` helper (R6) | High | Pending |
| A2 | Cache project/field/option IDs in CLAUDE.md (R7) | High | Pending |
| A3 | Add "no work without an issue" gate to CLAUDE.md per-task protocol (R8) | Medium | Pending |
| A4 | Update ADR template with size guidance (R9) | Medium | Pending |
| A5 | Add explicit note to CLAUDE.md: lint/spell-check not required (R10) | Low | Pending |
| A6 | Add session scoping step to CLAUDE.md session start protocol (R11) | Medium | Pending |
