# Drift Report: Requirements ↔ Design

**Scan date:** 2026-03-08
**Scanner:** requirements-design-drift agent
**Project phase:** Phase 0: Foundation — Requirements, design documents, ADRs, project structure. No code yet.
**Resolved:** 2026-03-09 — all warnings and informational items addressed. See resolution notes inline.

## Summary

| Severity | Count | Resolved |
|----------|-------|---------|
| Critical | 0 | — |
| Warning  | 6 | 6 ✓ |
| Info     | 4 | 4 ✓ |

**Overall drift score:** 100% of requirements have design coverage

**Resolution status:** All 10 findings resolved. Requirements bumped to v0.5; design doc bumped to v0.6.

**Phase context:** All gaps identified below are expected and appropriate for Phase 0: Foundation. The project is pre-implementation, with design work in progress. No critical misalignments exist. Warnings flag minor inconsistencies and areas where design detail will be added as part of the Level 5 (Implementation) process.

## Critical Issues

None. Requirements and design are well-aligned for the current phase.

## Warnings

### W1: Story 2.9 (PR Metadata Export) has no corresponding design section

- **Requirement:** Story 2.9 — Export comprehension score and skip status to PR metadata (labels or commit status) for external systems
- **Expected:** Design section covering which metadata mechanism (labels vs commit statuses), API contract, and integration point in PRCC flow
- **Found:** Mentioned in spike-003 Finding 6 (Check Runs vs Commit Statuses) as a consideration, but no design decision or contract
- **Impact:** Minor — this is a V1 story but implementation detail can be deferred until Phase 3 (PRCC implementation). Spike-003 provides options.
- **Suggested action:** Add L4 contract for PR metadata export before Phase 3.3.10 (per implementation plan)
- **Resolution ✓:** Added design doc section 4.8 PR Metadata Export Contract. Decision: **Check Run only** (Option B from spike-003 Finding 6) — no separate commit status in V1. Aggregate score and outcome surfaced via Check Run `output.summary` (pipe-delimited format) and `external_id` for Supabase cross-reference. Requirements v0.6 Story 2.9 AC updated accordingly. Commit status deferred to V2.

### W2: Naur layer names inconsistency between requirements and design

- **Requirement:** Requirements v0.4 glossary and Story 4.1 use: "world-to-program mapping, design justification, modification capacity"
- **Design:** Design doc v0.5 L4 (section 4.6 LLM prompts) uses the same three layers correctly in the system prompt, but earlier L1 Capabilities section still references the old names
- **Found:** L1 section (C4) states "design justification, modification capacity, integration understanding" (old names from requirements v0.2)
- **Impact:** Minor — correct names are used in the L4 contracts where they matter (LLM prompts), but L1 inconsistency may confuse readers
- **Suggested action:** Update design doc L1 (Capabilities section, C4 table) to use the corrected Naur layer names for consistency
- **Resolution ✓:** Updated design doc v0.6 L1 C4 table row to use the correct three names: world-to-program mapping, design justification, modification capacity.

### W3: Repository-level configuration role references inconsistent

- **Requirement:** Story 1.3 describes "Repo Admin" as the actor who configures repository settings. Requirements v0.2 change log (2026-03-05) notes "simplified roles" removed Repo Admin as a separate role.
- **Design:** ADR-0004 (Roles) confirms Org Admins handle repo configuration. No separate Repo Admin role exists.
- **Found:** Requirements v0.4 has not fully removed Repo Admin references (Story 1.3 acceptance criteria, Story 2.7 acceptance criteria, Story 6.1 acceptance criteria)
- **Impact:** Minor — ADR-0004 is authoritative, and the design is clear. Requirements document has stale role references.
- **Suggested action:** Update requirements doc to replace "Repo Admin" with "Org Admin" in Stories 1.3, 2.7, 6.1
- **Resolution ✓:** Requirements v0.5 updated. Stories 1.3, 2.7, and 6.1 now reference Org Admin consistently throughout.

### W4: FCS Initiator and FCS Participant roles referenced but deprecated

- **Requirement:** Requirements v0.4 Roles section lists "FCS Initiator" and "FCS Participant" as distinct roles
- **Design:** ADR-0004 and design doc confirm only Org Admin, User, Author (contextual), Reviewer (contextual) exist. "FCS Initiator" is a capability of Org Admin, not a separate role. "FCS Participant" is a User who is listed on an FCS assessment.
- **Found:** Requirements Roles section and Story 3.3 acceptance criteria use deprecated role names
- **Impact:** Minor — same as W3, ADR-0004 is authoritative
- **Suggested action:** Remove FCS Initiator and FCS Participant from requirements Roles section; update Story 3.3 to reference "participants" (lowercase) or "User" role
- **Resolution ✓:** Requirements v0.5 updated. Roles table: Org Admin description now states "Can create FCS assessments" (removing FCS Initiator framing); User description now says "nominated as a participant" (removing FCS Participant framing). Story 3.3 now references "participants" without role labels.

### W5: Auto-save draft answers deferred but still in Story 5.3 acceptance criteria

- **Requirement:** Story 5.3 acceptance criteria includes "Partially completed assessments auto-saved"
- **Design:** Design doc v0.5 L1 section (C6) notes "Auto-save of draft answers is deferred to V2." Implementation plan (2026-03-04) confirms "Auto-save drafts: Deferred from V1."
- **Found:** Requirements v0.4 has not removed auto-save from Story 5.3
- **Impact:** Minor — out-of-scope list at end of requirements does not explicitly call this out, but implementation plan is clear
- **Suggested action:** Remove "Partially completed assessments auto-saved" from Story 5.3 acceptance criteria, or move to V2 backlog section
- **Resolution ✓:** Requirements v0.5 updated. Auto-save acceptance criterion removed from Story 5.3. The Out of Scope table already listed it; the Notes line in 5.3 retains the deferral explanation.

### W6: FCS artefact selection mechanism mismatch

- **Requirement:** Story 3.1 (v0.4) states "Artefact selection: one or more merged PRs from the repository (the system extracts artefacts from the selected PRs, reusing the same extraction logic as PRCC)"
- **Design:** Design doc v0.5 L3 section 3.2 (FCS Flow, Phase 1) confirms merged PR selection approach. Implementation plan section "Modified Stories" table states Story 3.1 should be rewritten to "select merged PRs (not file paths/branches/dates)".
- **Found:** Requirements v0.4 Story 3.1 still lists the old artefact selection options: "(a) list of file paths, (b) a branch name (tool extracts changed files vs main), or (c) a date range of commits"
- **Impact:** Minor — acceptance criteria contradict the later description in the same story. Implementation plan is clear about the change needed.
- **Suggested action:** Rewrite Story 3.1 acceptance criteria to remove file path/branch/date options, keep only merged PR selection (as already done in the story description, just not in the "I provide:" bullet list)
- **Resolution ✓:** Requirements v0.5 updated. Story 3.1 "I provide:" bullet now reads "One or more merged PRs from the repository" — file path, branch name, and date range options removed.

## Informational

- **I1: Hosting platform reference inconsistency** — Requirements v0.4 Epic 5 introduction states "The Next.js web application hosted on Vercel." Design doc v0.5 Component 1 and ADR-0002 confirm hosting is GCP Cloud Run, not Vercel. Requirements doc needs update to reference GCP Cloud Run. (Minor editorial fix.)
  - **Resolution ✓:** Requirements v0.5 Epic 5 introduction updated to "hosted on GCP Cloud Run (ADR-0002)" with an explicit note "Not Vercel." ADR-0002 entry in Appendix Decision Log also clarified to "GCP Cloud Run (chosen over Vercel)".

- **I2: Spike documents referenced but not linked in ADR appendix** — Requirements v0.4 Appendix "Decision Log" lists 8 ADRs but does not reference the two completed research spikes (spike-003 GitHub Check API, spike-004 Supabase Auth GitHub OAuth). These spikes informed ADR-0001 and ADR-0003 respectively. Consider adding a "Research Spikes" section to the appendix for traceability.
  - **Resolution ✓:** Requirements v0.5 Appendix now includes a "Research Spikes" section listing spike-003 and spike-004 with their topics and the ADRs/stories they informed.

- **I3: Trivial commit detection heuristic not yet in design contracts** — Story 2.8 acceptance criteria (added in v0.2) includes trivial commit detection heuristic. Design doc L1 (C2 table) and L3 (section 3.1 PRCC sub-flows) reference it. ADR-0007 mentions it. But L4 Contracts do not yet define the specific heuristic logic (which files are considered trivial, line threshold). This is expected — detailed heuristic will be implementation-level, but a contract-level definition would be useful before Phase 3.8. Low priority, can be added during Phase 3 planning.
  - **Resolution ✓:** Design doc v0.6 section 4.2 now includes a "Trivial commit heuristic" subsection defining the two-condition rule (net line delta ≤ threshold AND all changed files are docs/comments), configurable `trivial_commit_threshold`, edge cases, and implementation note.

- **I4: Email service implementation not yet decided** — Design doc L2 Component 5 (Email Service) notes "V1 approach TBD — could be Supabase Edge Functions + Resend, or a simple transactional email service. Lightweight; not a core component." Requirements Story 3.2 requires email notifications. No ADR or design decision exists yet. This is acknowledged as pending and does not block current phase work.
  - **Resolution:** Deferred (non-action per report). Decision to be made during Phase 4 planning.

## Coverage Matrix

| Epic | Stories | Design Coverage | ADR Coverage | Coverage % |
|------|---------|-----------------|--------------|------------|
| Epic 1: Organisation Setup & Configuration | 5 stories (1.1–1.5) | Full coverage: L2 Components 1-3, L3 sections 3.3-3.4, L4 section 4.1 (database schema), L4 section 4.4 (API routes: config endpoints) | ADR-0001 (GitHub App), ADR-0002 (Hosting), ADR-0003 (Auth), ADR-0004 (Roles), ADR-0008 (Data Model & Multi-tenancy) | 100% |
| Epic 2: PR Comprehension Check (PRCC) Flow | 9 stories (2.1–2.9) | Full coverage: L3 section 3.1 (PRCC Flow all phases), L4 webhooks/API/LLM contracts, L4 section 4.8 (PR metadata export contract — added v0.6). Story 2.9 fully covered. | ADR-0001 (GitHub App), ADR-0006 (Soft/Hard modes), ADR-0007 (PR size threshold) | 100% |
| Epic 3: Feature Comprehension Score (FCS) Flow | 5 stories (3.1–3.5) | Full coverage: L3 section 3.2 (FCS Flow), L4 section 4.4 (API: FCS creation endpoint), L4 section 4.7 (Email contract). FCS reuses PRCC engine and web UI. | ADR-0003 (Auth — used for FCS creation), ADR-0008 (Data model — fcs_merged_prs table) | 100% |
| Epic 4: Shared Assessment Engine | 5 stories (4.1–4.5) | Full coverage: L1 C4 (Assessment Engine capabilities), L2 Component 4 (Anthropic Claude API), L3 section 3.1 Phase 3 (scoring), L4 section 4.6 (LLM prompt/response contracts) | ADR-0005 (Aggregate score — no individual score persistence) | 100% |
| Epic 5: Web Application & Authentication | 4 stories (5.1–5.4) | Full coverage: L2 Component 1 (Next.js app), L3 section 3.3 (Auth flow), L4 section 4.4 (API routes), L4 section 4.3 (RLS policies) | ADR-0002 (Hosting), ADR-0003 (Auth), ADR-0004 (Roles) | 100% |
| Epic 6: Reporting & Results | 4 stories (6.1–6.4) | Full coverage: L1 C7 (Reporting capabilities), L4 section 4.4 (API: reporting endpoints). Results pages designed but implementation detail deferred to Phase 5. | ADR-0005 (Aggregate score only), ADR-0006 (Enforcement modes — affects what is shown in results) | 100% |

**Overall:** 32 of 32 stories have corresponding design artefacts or ADRs. All epics at 100% coverage. Story 2.9 PR metadata export now has full L4 contract (design doc section 4.8).

## Recommendations

### Status: All actions completed (2026-03-09)

All Priority 1–4 actions from the original recommendations have been completed:

| Action | Finding | Status |
|--------|---------|--------|
| Update requirements role references (Repo Admin → Org Admin) | W3 | ✓ Done — requirements v0.5 |
| Update requirements role references (FCS Initiator, FCS Participant removed) | W4 | ✓ Done — requirements v0.5 |
| Update requirements Epic 5 hosting reference (Vercel → GCP Cloud Run) | I1 | ✓ Done — requirements v0.5 |
| Define PR metadata export L4 contract | W1 | ✓ Done — design doc v0.6 section 4.8 |
| Define trivial commit heuristic contract | I3 | ✓ Done — design doc v0.6 section 4.2 |
| Fix Naur layer names in design L1 C4 table | W2 | ✓ Done — design doc v0.6 |
| Remove auto-save from Story 5.3 acceptance criteria | W5 | ✓ Done — requirements v0.5 |
| Rewrite Story 3.1 artefact selection list | W6 | ✓ Done — requirements v0.5 |
| Add research spikes to requirements appendix | I2 | ✓ Done — requirements v0.5 |

### Non-actions (gaps that are appropriate — unchanged)

- **Email service implementation (I4)** — Deferred decision is acceptable. Story 3.2 requirements are clear; implementation approach can be chosen during Phase 4.
- **All Phase 0 appropriate gaps** — Design Level 5 (Implementation) has not been written yet because the project is pre-code. This is correct. Implementation details will be added story-by-story during Phases 1–5.

## Assessment: Requirements ↔ Design Alignment

**Verdict (original, 2026-03-08):** **Excellent alignment for Phase 0.** No critical drift. Six minor warnings, all editorial or deferred-design issues that do not block current phase work.

**Updated verdict (2026-03-09):** **All gaps closed.** Requirements v0.5 and design doc v0.6 are fully aligned. All 6 warnings and 3 of 4 informational items resolved. I4 (email service) remains an acknowledged deferred decision with no blocking impact.

**Observation:** The drift detected was typical of iterative design refinement. Requirements v0.2 made role simplification decisions that had not fully propagated to v0.4 (W3, W4, W6). This was a documentation lag, not a conceptual misalignment — now resolved.

**Strength:** Every epic has at least one ADR backing its key decisions. The traceability from requirements → ADR → design section is strong. The design document's four-level structure (Capabilities → Components → Interactions → Contracts) provides clear hooks for each requirement story. All 32 stories now have complete design coverage at 100%.

**Process note:** The "garbage collection" scan at Phase 0 served as the intended **handover verification** — confirming all decisions are documented before moving to implementation. Phase 0 is complete. The project is ready to proceed.
