# Process Improvement Report

**Date:** 2026-03-24
**Trigger:** Drift scan session + usage data analysis (62 sessions, 181 hours, `report.html`)
**Status:** Proposed — not yet implemented

---

## Problem Statement

Generated code quality is consistently below acceptable standards. Code is complex, lacks design
thinking, and does not reflect the architecture decisions recorded in LLD documents. The review
process does not catch this before merge. Agents treat implementation as "make the tests pass"
rather than "implement the design."

Confirmed by usage data:

| Friction type | Session count |
|---|---|
| Wrong approach (overcomplicating) | 29 |
| Buggy code | 17 |
| Excessive changes | 10 |
| Missed checks | 2 (undercount — user catches most) |

---

## LLD vs Code Gap Analysis

To ground the root cause, `GET /api/assessments/[id]` (PR #94) was compared against the design
it was built from: `docs/design/lld-phase-2-web-auth-db.md §2.4`.

### What the LLD specified

- A 5-step logical sequence (auth → fetch assessment → parallel fetch → filterQuestionFields → return)
- `filterQuestionFields()` — full signature, full logic, extracted to `[id]/helpers.ts`
- File structure: `route.ts` + `helpers.ts`
- Response shape (via HLD cross-reference)

### What the agent built that was NOT in the LLD

| Agent-invented construct | File | Problem |
|---|---|---|
| `FetchContext` interface | `[id]/route.ts:88` | Parameter struct for `fetchParallelData` — unnecessary ceremony; pass params directly |
| `ParallelData` type | `[id]/route.ts:81` | Return type struct — not wrong, but not designed |
| `assertNoDbError()` | `[id]/route.ts:96` | Invented error helper — pattern not specified |
| `resolveAssessment()` | `[id]/route.ts:103` | Invented — handles PGRST116 + generic error in one function |
| `fetchParallelData()` | `[id]/route.ts:114` | Wraps the "Parallel:" step — reasonable extraction but not designed |
| `buildResponse()` | `[id]/route.ts:149` | Wraps the "Return response" step — reasonable extraction but not designed |
| `assertAuthOrParticipant()` | `assessments/helpers.ts:145` | Silently swallows 403 — invented, undocumented, triggered a drift warning (W2) |
| `as unknown as` casting | `[id]/route.ts:105,111` | Supabase type limitation workaround — LLD silent on this |

### Verdict

The LLD was a good **"what"** document: logical sequence, key interfaces, response shapes, one
critical business-logic function. It was a poor **"how"** document: it left all internal
decomposition decisions to the agent. Agents filled the gap with ad-hoc patterns of varying
quality. The most harmful example is `assertAuthOrParticipant` — a function that silently swallows
errors, born entirely from the agent's discretion, not from any design decision.

The LLD also used **backwards implementation notes**: corrections were added to the LLD *after*
the agent made mistakes (e.g., "Three helpers were extracted to keep cognitive complexity within
the SonarQube threshold"). These notes should be constraints written *before* implementation, not
post-hoc documentation of things the reviewer had to fix.

---

## Root Cause Analysis

### RC1 (Primary): LLD does not constrain internal decomposition

The LLD specifies public interfaces and sequences but leaves internal structure — which private
helpers to create, how to decompose complex operations, what stays in `route.ts` vs. gets
extracted — entirely unspecified. Agents fill this gap arbitrarily, producing structures that were
never designed and never reviewed.

### RC2: Implementation notes are written backwards

The LLD currently accumulates corrections *after* implementation: "review finding", "spec was
silent on this", "deferred". These should be **pre-implementation constraints**: "do not create
parameter structs for single-use functions", "extract these three helpers and no others". Writing
them after the fact documents mistakes instead of preventing them.

### RC3: `/pr-review` does not check design conformance

The review skill runs correctness and framework-freshness agents. Neither asks: *"Does this code
match the LLD? Are there functions in the implementation that were never designed?"* A reviewer
that does not cross-reference the design will never catch invented complexity.

### RC4: Diagnostics are informational, not blocking

The PostToolUse hook fires after Write/Edit and injects CodeScene findings into context. Agents
acknowledge findings then proceed. No enforcement mechanism exists.

---

## Proposed Improvements

### P1: Add "Internal decomposition" section to every LLD route/component (highest priority)

For every non-trivial implementation target in the LLD, add an explicit internal decomposition
section before implementation begins. This section names every function that will exist — not just
public interfaces — and states what is forbidden.

**Template for a route:**

```markdown
#### Internal decomposition — GET /api/assessments/[id]

Route handler (stays in route.ts, ≤ 25 lines):
- Calls `requireAuth()`, creates clients, calls helpers, returns `json()`

Private helpers in route.ts (and nothing else):
- `resolveAssessment(data, error): AssessmentWithRelations` — PGRST116 → 404, other error → 500
- `fetchParallelData(supabase, adminSupabase, assessmentId, userId, orgId): Promise<ParallelData>`
  — runs the four parallel queries; throws ApiError(500) on any DB failure
- `buildResponse(assessment, parallelData): AssessmentDetailResponse`
  — pure mapping function, no I/O

Extracted to helpers.ts:
- `filterQuestionFields(...)` — [full spec already here]

Do NOT:
- Create parameter structs (FetchContext etc.) for single-use internal functions
- Invent error-handling helpers not listed here
- Add auth helpers that silently swallow errors — if a 403 should be ignored, document why inline
```

**Effort:** Medium (process change + LLD template update). **Impact:** High — closes RC1.

### P2: Flip implementation notes — write constraints before, not corrections after

The LLD currently has 8+ "Implementation note (issue #N): spec was silent on..." entries. These
document gaps that caused mistakes. The fix: when writing an LLD section, actively ask "what will
the agent get wrong?" and write those answers as **constraints** in the LLD, not as retroactive
notes after review.

Rename the pattern: `> **Constraint:**` instead of `> **Implementation note:**`. A constraint is
read before coding. A note is read after.

**Effort:** Low (wording convention). **Impact:** Medium — changes agent reading behaviour.

### P3: Add design-conformance check to `/pr-review`

Add a third parallel agent whose job is:

1. Identify the LLD section relevant to the changed files (from the design reference comment in
   the source file)
2. List every function in the implementation that was NOT specified in the LLD
3. For each unspecified function: flag it and require justification
4. Check `.diagnostics/` for all changed files; flag any findings
5. Check for silent catch/swallow patterns

The justification requirement is the key mechanism: if the agent invented a function, the review
must explain why. This turns invisible complexity into visible decisions.

**Effort:** Medium (skill update). **Impact:** High — closes RC3.

### P4: Complexity budget in CLAUDE.md (hard limits)

Add measurable limits to Coding Principles. These are constraints, not advice:

- Route handler body: ≤ 25 lines
- Any function: ≤ 20 lines
- Nesting depth: ≤ 3 levels
- No parameter structs for single-use internal functions
- No silent catch/swallow without an inline comment explaining why
- CodeScene warnings on changed files: blocking, not advisory

**Effort:** Low. **Impact:** Medium (agents will still deviate without gates, but deviation becomes
visible).

### P5: Blocking diagnostics gate in `/feature`

Replace the "run `/diag` step" with a loop: run `/diag` → if findings, fix → re-run → repeat
until clean. No commit until `.diagnostics/` is clean for all changed files.

**Effort:** Medium (skill update). **Impact:** Medium.

---

## Open Questions

1. **How deep should the LLD internal decomposition go?** For simple routes (e.g., the list
   endpoint `helpers.ts` was well-specified), the current format is adequate. The internal
   decomposition section is most needed for routes with parallel fetches, multi-step error
   handling, or complex type mapping. We need a rule for when to include it vs. not.

2. **Should implementation agents be required to cite the LLD before writing each function?**
   Forcing "I am implementing `fetchParallelData` as specified in §2.4 internal decomposition"
   before writing would make LLD-ignoring visible at generation time.

---

## Implementation Tracking

These improvements should be tracked as GitHub issues to avoid the pattern of producing a process
report and not acting on it. Proposed issues:

| Issue title | Priority | Improvement |
|---|---|---|
| Add internal-decomposition sections to unimplemented LLD routes | High | P1 |
| Add design-conformance agent to `/pr-review` skill | High | P2+P3 |
| Add complexity budget to CLAUDE.md | Medium | P4 |
| Make `/diag` a blocking gate in `/feature` skill | Medium | P5 |

---

## Priority Order

| # | Improvement | Effort | Impact | Addresses |
|---|---|---|---|---|
| 1 | P1: LLD internal decomposition sections | Medium | High | RC1 (root cause) |
| 2 | P2: Flip implementation notes to constraints | Low | Medium | RC2 |
| 3 | P3: Design-conformance agent in `/pr-review` | Medium | High | RC1, RC3 |
| 4 | P4: Complexity budget in CLAUDE.md | Low | Medium | RC1 (partial) |
| 5 | P5: Blocking diagnostics gate in `/feature` | Medium | Medium | RC4 |
