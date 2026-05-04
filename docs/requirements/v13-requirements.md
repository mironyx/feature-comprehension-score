# Feature Comprehension Score — V13 Requirements: FCS Assessment Lifecycle

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.1 |
| Status | Draft — Structure (Gate 1 review pending) |
| Author | LS / Claude |
| Created | 2026-05-04 |
| Last updated | 2026-05-04 |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-05-04 | LS / Claude | Initial structure draft. Single epic — FCS assessment lifecycle admin actions. Story 1.1 add-participant (new); Story 1.2 close-without-full-participation (carried from v1 Story 3.5). Story 3.6 Self-Reassessment from v1 explicitly dropped — superseded by v12 reference-answer policy. Epic 2 (Prompt Privacy) deferred to a future ADR + version. |

---

## Context / Background

V11 introduced Projects as the organising layer for FCS assessments. V12 implements PRCC end-to-end and adopts a revised reference-answer policy (v12 Design Principle 8): once an assessment is fully complete, the rubric — questions, reference answers, and the participant's own scored answers — becomes visible to that participant.

V13 closes two outstanding gaps in the FCS assessment lifecycle that surfaced in the 2026-05-04 baseline:

- **Adding a participant to an assessment that is already in flight.** Today, the participant list is fixed at creation. There is no path for an admin to add a late participant. PRCC handles this automatically via webhook (v12 Story 2.1) when a required reviewer is added to a PR; FCS has no equivalent admin action.
- **Closing an assessment when not every participant will respond.** V1 Story 3.5 specified this capability; the schema is ready (`did_not_participate` enum on `assessment_participants.status`) but no admin UI or endpoint exists.

V13 also ratifies the deliberate drop of v1 Story 3.6 (FCS Self-Reassessment). Under v12's reference-answer policy, completion reveals the rubric — the path forward for a participant who wants another attempt is to create a new assessment, not to re-answer the existing one. The `is_reassessment` column on `participant_answers` becomes vestigial and is cleaned up as part of Story 1.2.

Epic 2 (Prompt Privacy — moving prompt source-of-truth to a private repo with encrypted distribution) was scoped during v13 planning but **deferred** pending an ADR that captures threat model, trigger conditions, and the acknowledgement that today's published prompts cannot be retroactively unpublished. See "What We Are NOT Building" below.

---

## Glossary

| Term | Definition |
|------|-----------|
| **Assessment** | A generated set of comprehension questions with reference answers and weights (FCS or PRCC). V13 scope is FCS only. |
| **Unfinished assessment** | An assessment whose status is `awaiting_responses` — rubric is finalised, but at least one participant has not yet submitted (or been marked `did_not_participate`). |
| **Participant** | A user who is required to answer an assessment. For FCS, participants are chosen by the assessment creator at creation time (today) and may be added mid-flight by an admin (V13 Story 1.1). |
| **Late-added participant** | A participant added to an assessment after creation, while it is still `awaiting_responses`. Distinguished from original participants by the moment of enrolment, not by the question set — they answer the same rubric. |
| **`did_not_participate`** | A participant status indicating the participant will not be submitting answers. Excluded from aggregate-score denominator. Schema enum exists today; admin action to set it is V13 Story 1.2. |
| **Close-without-full-participation** | The admin action of finalising an assessment when one or more participants will not be answering. Marks the non-responding participants as `did_not_participate` and computes the aggregate score from the responding participants only. |
| **Aggregate score recomputation point** | The moment at which the assessment's aggregate score is computed: at completion (all submitted or marked DNP), and re-computed if a late participant submits before close. See Open Questions. |
| **Repo-Admin-of-the-assessment's-repo** | A user holding the Repo Admin role on the repository that the FCS assessment was created against. Granted admin actions on assessments tied to repos in their scope. Persistent role; contextual permission. |
| **Reference-answer visibility window** | The interval after assessment completion in which a participant's self-directed view shows the reference answers (per v12 Design Principle 8). Relevant to V13 because adding a late participant before close defers the window opening. |

---

## Design Principles / Constraints

1. **Lifecycle-gated.** All admin actions in V13 (add participant, close without full participation) are valid only while the assessment is `awaiting_responses`. Once the assessment is finalised — aggregate score computed, reference-answer view opened — the participant set is immutable.
2. **No data migration.** All required schema is already in place (`assessment_participants` table, `participant_status` enum). V13 ships UI + API + business logic only. No backfill of existing assessments.
3. **Aggregate score is computed once, at close.** Late participant submissions before close are treated identically to original-participant submissions. The aggregate is finalised when the close condition is met (all participants either `submitted` or `did_not_participate`).
4. **Reference-answer policy unchanged.** The reference-answer visibility window opens at close per v12 Design Principle 8. A late-added participant who joins before close sees the reference answers when the assessment closes — exactly like an original participant. There is no "leakage gate" for late additions because the window only opens at close.
5. **Symmetry deferred.** PRCC handles add-participant via webhook (v12 Story 2.1) and remove-participant via the corresponding webhook event. V13 introduces FCS add-participant only. **FCS remove-participant is not in V13** — symmetric to v1 Story 5.2's auto-suggest model, removal is handled by re-creating the assessment if the participant set is wrong, not by mid-flight removal.
6. **Permission: Org Admin or Repo Admin of the assessment's repo.** The same pair of roles that can create FCS assessments (per v11 §Roles and v11 Story 1.6) can also amend their participant lists and close them without full participation. The original creator does not gain extra privileges beyond this.
7. **Self-reassessment is a non-goal.** The path to "another attempt" is to create a new assessment, not to re-answer an existing one. The `is_reassessment` column on `participant_answers` is dropped as part of Story 1.2.
8. **Small PRs.** Each story targets < 200 lines of change.

---

## Roles

| Role | Type | Description |
|------|------|-----------|
| **Org Admin** | Persistent | Org-level administrator. Can amend participants on, and close, any FCS assessment in the org. |
| **Repo Admin** | Persistent (contextual permission) | Holds the Repo Admin role on a specific repository (per v11). Can amend participants on, and close, FCS assessments tied to repositories in their scope. |
| **Assessment Participant** | Contextual | Any user enrolled on the assessment as a respondent. V13 admin actions affect participants but participants take no V13-specific action — they answer as today. |
| **Late-added participant** | Contextual | An Assessment Participant whose enrolment occurred mid-flight via Story 1.1. Same UX and permissions as an original participant; distinguished only by the enrolment moment. |

> **Note:** V13 introduces no new persistent roles. Permission boundaries reuse v11's "Org Admin or Repo Admin of the assessment's repo" pattern.

---

## Epic 1: FCS Assessment Lifecycle Management [Priority: High]

Provides admins the two missing FCS lifecycle actions: amend participants on an in-flight assessment, and close an assessment without full participation. Together they let an admin recover from realising mid-flight that the original participant list was incomplete or that one or more participants will not answer.

**Rationale:** Both stories are unblockers for ongoing dogfooding. The 2026-05-04 baseline classified Story 3.5 as Not started (carried forward) and Story 1.1 is a freshly-surfaced gap from real usage. No external dependencies — schema, RLS, and admin views (v11 Design Principle 8) are all in place.

<a id="REQ-fcs-assessment-lifecycle-add-participant"></a>

### Story 1.1: Add participant to unfinished FCS assessment

**As an** Org Admin or Repo Admin of the assessment's repo,
**I want to** add a participant to an FCS assessment that is `awaiting_responses`,
**so that** I can correct an incomplete participant list without discarding the work the original participants have already done.

*(Acceptance criteria in next pass — see Notes below for the contract this story must enforce.)*

> **Notes (carry into AC pass):**
>
> - Permission: Org Admin or Repo-Admin-of-the-assessment's-repo. No other role.
> - Lifecycle gate: only valid when assessment status is `awaiting_responses`. Reject with 409 / clear error otherwise.
> - The added participant answers the **same rubric** as the original participants (no question regeneration, no rubric mutation).
> - The added participant's submission is identical in shape and scoring to original participants — they appear in the aggregate calculation when they submit.
> - UI affordance: an "Add participant" action lives in the existing admin assessment-detail view (per v11 Design Principle 8 — single shared component). A GitHub-username input with validation against the org's known users.
> - Audit: the act of adding is logged with `user_id`, `target_user_id`, `assessment_id`, `added_at`. This is observability per v1 Cross-Cutting Concerns; mechanism follows the existing pino logging conventions.
> - Out of scope for V13: bulk add (one at a time only); email notification (no email stack); remove-participant (Design Principle 5).

---

<a id="REQ-fcs-assessment-lifecycle-close-without-full-participation"></a>

### Story 1.2: Close FCS assessment without full participation

**As an** Org Admin or Repo Admin of the assessment's repo,
**I want to** close an FCS assessment when one or more participants will not be answering,
**so that** the responding participants can see their results and the assessment moves out of the "awaiting" state.

*(Acceptance criteria in next pass — see Notes below for the contract this story must enforce.)*

> **Notes (carry into AC pass):**
>
> - Permission: Org Admin or Repo-Admin-of-the-assessment's-repo. No other role.
> - Lifecycle gate: only valid when assessment status is `awaiting_responses`.
> - UX: admin selects which participants to mark `did_not_participate` and confirms close. At least one participant must remain `submitted` for close to succeed (an assessment with zero submissions cannot be "completed" — it can only be deleted via existing v4 Epic 3 deletion).
> - Aggregate-score effect: aggregate is computed across submitted participants only. `did_not_participate` participants are excluded from both numerator and denominator.
> - Reference-answer visibility: closing opens the visibility window per v12 Design Principle 8 for all submitted participants.
> - Schema cleanup: the `is_reassessment` column on `participant_answers` (vestigial since v1 Story 3.6 is dropped — see Design Principle 7) is removed as part of this story. Migration drops the column; service code stops writing it. Approximately 10 lines of changes across schema and 4 call sites in `service.ts`. **Open Question #3 asks whether this cleanup should be split into a separate chore-style story.**
> - Out of scope for V13: re-opening a closed assessment; bulk-close across multiple assessments; email notification.

---

## Cross-Cutting Concerns

### Permission model

Both stories use the existing "Org Admin OR Repo-Admin-of-the-assessment's-repo" check (per v11 Story 1.6). V13 introduces no new permission predicates — it reuses the helper.

### Multi-tenancy / RLS

New endpoints (the add-participant POST and the close PATCH) MUST be scoped by `org_id` in WHERE clauses, following the pattern hardened in #309 and #378. RLS policies on `assessment_participants` already enforce org isolation; the API layer must mirror it.

### Audit logging

Both stories emit a structured pino log entry on success. Field set: `event` (`assessment.participant_added` or `assessment.closed_without_full_participation`), `user_id`, `assessment_id`, plus story-specific fields. Per v1 Cross-Cutting Concerns "Observability". No new logging infrastructure required.

### UI surface

Both actions live in the admin assessment-detail view (per v11 Design Principle 8 — single shared component). No new pages.

### Reference-answer policy interaction (with v12)

V13 does not modify the reference-answer policy. The policy lands as v12 Design Principle 8: completion opens the visibility window. V13's late-added participants and DNP-marked participants both interact with this policy through the existing close mechanism — there is no V13-specific carve-out.

---

## What We Are NOT Building

- **FCS Self-Reassessment (v1 Story 3.6).** Deliberately dropped. Path to another attempt is to create a new assessment. The `is_reassessment` column is cleaned up as part of Story 1.2.
- **FCS remove-participant.** Design Principle 5. Removal is handled by deleting and re-creating the assessment (v4 Epic 3) rather than mid-flight participant removal.
- **Bulk add-participant or bulk-close.** One assessment at a time.
- **Email/notification when a late participant is added.** No email infrastructure (per 2026-05-04 baseline; v1 Story 3.2 deferred).
- **Re-opening a closed assessment.** Once closed, the participant set and aggregate are immutable.
- **Prompt Privacy (Epic 2 in v13 planning).** Deferred. Requires an ADR capturing the threat model, the architecture (private repo + encrypted bundle + runtime decrypt + ZDR with provider), the trigger conditions for implementation (e.g. first paying customer), and the acknowledgement that today's published prompts cannot be retroactively unpublished. **Action item:** open ADR-00NN before next major version; reference back from this section once filed.

---

## Open Questions

| # | Question | Context | Options | Impact |
|---|----------|---------|---------|--------|
| 1 | When a late-added participant submits before close, should the aggregate score (a) be re-computed live and visible to other submitted participants in real time, (b) be re-computed live but hidden until close, or (c) be deferred entirely until close? | v13 Story 1.1 introduces a new shape: assessments where participants enrol at different times. Today's aggregate is computed once at close. With late additions, the question is whether other-participant scores update visibly. | (a) Live + visible; (b) live + hidden; (c) compute only at close | Affects results-page polling behaviour and the perceived integrity of "completion". Recommend (c) — simplest and matches Design Principle 3. |
| 2 | If a late participant is added after some original participants have already submitted *and the assessment was already at "all original participants submitted" status*, what happens? | Edge case: original participants 1, 2, 3 all submit. Status flips to ready-to-close (or auto-closes — needs check). Admin then adds participant 4. | (a) Reject the add — assessment is effectively done; (b) re-open the lifecycle — late add is permitted up until explicit close; (c) explicit policy decision needed | Affects whether close is implicit (auto on last submission) or explicit (admin action). Today's behaviour needs verification — see investigation note below. |
| 3 | Should the `is_reassessment` column drop be a sub-AC of Story 1.2 or a separate chore-style story? | The cleanup is small (~10 lines) but conceptually separate from "close without full participation" — it's about ratifying the v1 Story 3.6 drop. | (a) Sub-AC of 1.2; (b) Story 1.3 chore; (c) backlog issue, not v13 | Recommend (a) — keeps v13 to two stories, the cleanup is small enough to bundle. |
| 4 | Permission: should the original assessment creator (who may be neither Org Admin nor Repo Admin if they were promoted-then-demoted) retain admin actions on assessments they created? | Edge case from v11 role model. Today, creator role is not retained as a permission grant. | (a) No special creator permission (consistent with v11); (b) creator-of-record gains admin actions on their assessments only | Recommend (a) — keeps role model simple and matches v11. |
| 5 | When does close happen? Is it always explicit (admin clicks "close"), or implicit when all participants have submitted? | Today's behaviour: when all participants submit, the assessment auto-finalises (rubric/aggregate computed, reference-answer view opens). With Story 1.1 introducing late additions, the auto-finalisation timing becomes load-bearing for Question 2. | (a) Keep auto-finalisation on last submission, with explicit close only for DNP cases; (b) require explicit close in all cases now that late-add is possible | Needs investigation of current code (`service.ts` finalisation hook) before deciding. Recommend (a) until investigation says otherwise. |
| 6 | Should V13 file the prompt-privacy ADR at the same time as v13 Final, or strictly after v13 ships? | Captures the deferred Epic 2. | (a) File now (alongside v13 finalisation); (b) file after v13 ships | Recommend (a) — keeps the strategic decision visible while context is fresh. |

---

## Next steps

1. **Gate 1 review** — confirm the single-epic, two-story shape; resolve Open Questions where possible; add `[Review]` comments inline for anything to revise.
2. **Step 4: Acceptance Criteria pass** — write Given/When/Then ACs for each story, applying the INVEST lens.
3. **Step 5: Testability validation** — scan ACs for vague qualifiers and missing negative cases; fix in place.
4. **Gate 2 review.**
5. **Finalise.**
6. **Run `/kickoff docs/requirements/v13-requirements.md`** to produce HLD delta + epic plan.
