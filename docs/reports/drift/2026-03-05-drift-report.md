# Drift Report: Requirements ↔ Design

**Scan date:** 2026-03-05
**Scanner:** requirements-design-drift agent
**Project phase:** Phase 0: Foundation

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| Warning  | 8 |
| Info     | 4 |

**Overall drift score:** 23% of requirements have design coverage (component level or above)

## Critical Issues

### C1: Epic 1 (Organisation Setup) has no design coverage

- **Requirement:** Epic 1 (Stories 1.1-1.5) — GitHub App installation, organisation dashboard, repository configuration, multi-tenancy
- **Expected:** Design document section describing HOW organisations are registered, configured, and isolated at the component and interaction level
- **Found:** Capabilities level mentions "Organisation Management" (C1) but no component or interaction design
- **Impact:** Stories 1.1-1.5 cannot be implemented without knowing which components handle org registration, where configuration is stored, how RLS policies enforce isolation, or what the GitHub App installation webhook flow looks like

### C2: Epic 3 (FCS Flow) has no design coverage

- **Requirement:** Epic 3 (Stories 3.1-3.5) — Feature assessment creation, participant notification, FCS scoring
- **Expected:** Design document section describing HOW FCS assessments differ from PRCC in terms of artefact aggregation, participant nomination, and email notification
- **Found:** Capabilities level mentions "Feature Comprehension Score" (C3) but no component or interaction design. FCS is referenced only as "reusing" PRCC infrastructure.
- **Impact:** Stories 3.1-3.5 cannot be implemented without knowing how merged PRs are aggregated into a single artefact set, how email notifications are sent (which component?), or how the "close early" partial participation flow works

### C3: Epic 6 (Reporting & Results) has no design coverage

- **Requirement:** Epic 6 (Stories 6.1-6.4) — PRCC results page, FCS results page, organisation overview, repository history
- **Expected:** Design document section describing result page components, data aggregation for org overview, trend calculation for repository history
- **Found:** Capabilities level mentions "Reporting & Results" (C7) but no component or interaction design
- **Impact:** Stories 6.1-6.4 cannot be implemented without knowing which components fetch and aggregate assessment data, how the trend chart is generated, or how access control applies to results pages

## Warnings

### W1: Design document is incomplete (Levels 3 and 4 missing)

- **Location:** `docs/design/v1-design.md`
- **Issue:** Levels 3 (Interactions) and 4 (Contracts) are marked "To be completed". Only Levels 1 (Capabilities) and 2 (Components) exist. Level 2 is marked "Under review", not "Approved".
- **Suggested action:** Complete Interactions and Contracts levels before implementation begins. CLAUDE.md explicitly states "No code until Level 5" and the design-down process requires all four design levels to be approved sequentially.

### W2: Story 2.9 (PR Metadata Export) added after design document was created

- **Location:** Requirements v0.2 (2026-03-05), Design v0.2 (2026-03-05) — same date but design doc change log does not mention Story 2.9
- **Issue:** Story 2.9 appears in the requirements and is mentioned in the implementation plan as a confirmed decision, but is not referenced in the design document's Capabilities mapping (C2: PRCC) or anywhere else in the design.
- **Suggested action:** Add Story 2.9 to the Capabilities list under C2 (PRCC) and describe HOW metadata export will be implemented (GitHub Commit Status API vs labels vs Check Run fields) at the Interactions or Contracts level.

### W3: ADR-0002 (Hosting) is marked "pending" but design assumes deployment target

- **Location:** Requirements ("Hosting platform TBD (ADR-0002 pending: Vercel vs GCP Cloud Run)"), Design ("Hosted on Vercel or GCP (ADR-0002 pending)")
- **Issue:** The design document's Component 1 description states the Next.js app is "Hosted on Vercel or GCP" but does not account for differences in deployment model (serverless functions vs containers), environment variable handling, or cold start behaviour between these platforms. Interaction and Contract design cannot proceed until this is decided.
- **Suggested action:** Resolve ADR-0002 before completing Level 3 (Interactions). The choice affects webhook handler deployment, LLM call timeout handling, and session middleware execution.

### W4: Ambiguous "Repo Admin" role removed from requirements but persists in glossary and stories

- **Location:** Requirements glossary ("Repo Admin"), Stories 2.7, 6.1, 6.4
- **Issue:** The implementation plan confirms "No Repo Admin in V1" and defines simplified roles (Org Admin, User, Author, Reviewer), but the requirements document v0.2 still references "Repo Admin" in four locations. The roles section in the requirements does NOT list Repo Admin but the glossary and stories do.
- **Suggested action:** Globally replace "Repo Admin" with "Org Admin" in Stories 2.7, 6.1, and 6.4. Remove "Repo Admin" from the glossary. The implementation plan already confirms Org Admins have repo-level configuration capability.

### W5: Story 1.3 refers to "Repo Admin" in the story actor but implementation plan removed this role

- **Location:** Requirements Story 1.3: "As a Repo Admin, I want to configure comprehension assessment settings..."
- **Issue:** Same root cause as W4. Story 1.3's actor is "Repo Admin" but this role does not exist in the simplified model. The acceptance criteria list configurable settings but do not specify WHO can configure them after the role simplification.
- **Suggested action:** Change Story 1.3 actor to "As an Org Admin" to align with the confirmed role model.

### W6: ADR-0003 (Auth) decision is accepted but requirements Story 5.1 description is thin

- **Location:** ADR `docs/adr/0003-auth-supabase-auth-github-oauth.md` (accepted), Requirements Story 5.1, Design Component 3
- **Issue:** ADR-0003 is marked "Accepted" with detailed rationale and implementation decisions (OAuth scopes, provider token storage, org membership caching, Supabase Vault). Requirements Story 5.1 acceptance criteria are generic ("OAuth flow redirects to GitHub", "Minimum OAuth scopes: read:user, read:org") and do not reference the critical provider token capture requirement or Supabase Auth specifics. Design Component 3 lists Supabase Auth as a sub-component but does not describe the PKCE flow or token lifecycle.
- **Suggested action:** Expand Story 5.1 acceptance criteria to include: "Provider token captured in /auth/callback route and stored encrypted", "User's GitHub org list fetched and cached on login", "Session refresh handled by Next.js middleware". Add cross-reference to ADR-0003. At Design Level 3 (Interactions), include the full auth flow diagram from spike-004.

### W7: Naur layer names inconsistent between requirements and implementation plan

- **Location:** Requirements glossary ("design justification, modification capacity, integration understanding"), Implementation plan ("World-to-program mapping, Design justification, Modification capacity")
- **Issue:** The implementation plan explicitly corrects the Naur layer names to match Peter Naur's Theory Building but the requirements glossary still uses the old names. Story 4.1 uses the correct names in the prompt examples but the glossary is stale.
- **Suggested action:** Update the requirements glossary to use the confirmed Naur layer names from the implementation plan. This is a documentation consistency issue, not a design gap, but creates confusion.

### W8: Story 2.8 (PR Update Handling) references trivial commit detection but no heuristic is specified

- **Location:** Requirements Story 2.8, Implementation plan ("Need heuristic (e.g., only docs/comments changed, < 5 lines)")
- **Issue:** Story 2.8 acceptance criteria states "Given a trivial commit is pushed...the existing assessment is NOT invalidated" but the requirements document does not define what constitutes a "trivial" commit. The implementation plan suggests a heuristic but marks it as needing decision. Design document does not address this at all.
- **Suggested action:** Either (a) add acceptance criteria to Story 2.8 defining the trivial commit heuristic (file patterns + line threshold), or (b) create ADR-0009 for the trivial commit detection strategy, or (c) defer to implementation and mark as "configurable" in Story 1.3 (repository configuration).

## Informational

- **I1: Spike documents exist for ADRs not yet written.** spike-003-github-check-api.md covers findings for ADR-0001 (GitHub App integration). spike-004-supabase-auth-github-oauth.md covers findings for ADR-0003 (Auth, already written). Both spikes are comprehensive and ready to be converted into ADRs.
- **I2: Git status shows untracked files.** `docs/adr/`, `docs/design/spike-003-github-check-api.md`, `docs/design/spike-004-supabase-auth-github-oauth.md` are not committed. This is expected in Phase 0 (Foundation) but should be resolved before Phase 1 begins.
- **I3: ADR numbering gap.** ADR-0003 exists but ADR-0001 and ADR-0002 do not. Implementation plan lists these as needed. Not a drift issue but a completeness gap.
- **I4: Plans directory contains context documents, not design.** `docs/plans/` files are execution context (how work gets done) not design documents (what components exist, how they interact). This is correct per CLAUDE.md but worth noting for clarity.

## Coverage Matrix

| Epic | Stories | Capabilities (L1) | Components (L2) | Interactions (L3) | Contracts (L4) | Coverage |
|------|---------|-------------------|-----------------|-------------------|----------------|----------|
| Epic 1: Organisation Setup | 5 (1.1-1.5) | Yes (C1) | No | No | No | 12% |
| Epic 2: PRCC Flow | 9 (2.1-2.9) | Yes (C2, C4, C5, C6) | Partial | No | No | 25% |
| Epic 3: FCS Flow | 5 (3.1-3.5) | Yes (C3, C4, C5, C6) | No | No | No | 12% |
| Epic 4: Assessment Engine | 5 (4.1-4.5) | Yes (C4) | Yes (Component 4) | No | No | 50% |
| Epic 5: Web App & Auth | 4 (5.1-5.4) | Yes (C5, C6) | Yes (Components 1, 3) | No | No | 50% |
| Epic 6: Reporting & Results | 4 (6.1-6.4) | Yes (C7) | No | No | No | 12% |
| **Overall** | **32** | **32 (100%)** | **9 (28%)** | **0 (0%)** | **0 (0%)** | **23%** |

## Recommendations

### Priority 1: Unblock implementation (Critical gaps)

1. **Complete Design Level 2 (Components) for Epics 1, 3, and 6.** These three epics have zero component design. Estimate: 1 design session per epic.
2. **Resolve ADR-0002 (Hosting: Vercel vs GCP).** Blocks Level 3 (Interactions) because deployment model affects all components. Estimate: half-day.
3. **Advance Design Levels 3 and 4 for Epic 2 (PRCC) and Epic 4 (Assessment Engine).** These are the highest-priority epics per the implementation plan (Phase 1 and Phase 3). Estimate: 2-3 design sessions.

### Priority 2: Close documentation gaps (Warnings)

4. **Fix role inconsistencies (W4, W5).** Replace "Repo Admin" with "Org Admin" throughout requirements. Estimate: 15 minutes.
5. **Add Story 2.9 to design document (W2).** Estimate: 30 minutes.
6. **Expand Story 5.1 acceptance criteria (W6).** Reference ADR-0003. Estimate: 20 minutes.
7. **Resolve trivial commit heuristic (W8).** Estimate: 1 hour.
8. **Fix Naur layer name inconsistency (W7).** Estimate: 5 minutes.

### Priority 3: Complete foundation (Info items)

9. **Write missing ADRs (ADR-0001, ADR-0002, ADR-0004-0008).** Estimate: 1-2 hours per ADR.
10. **Commit untracked files.** Estimate: 5 minutes.

### Sequencing

1. Continue design walkthrough (Components for all epics, then Interactions, then Contracts) — addresses C1, C2, C3, W1
2. Write ADR-0004 (Roles) — unblocks W4, W5
3. Write ADR-0002 (Hosting) — addresses W3
4. Complete remaining ADRs — addresses Priority 3 item 9
5. Update requirements with fixes — addresses W4, W5, W6, W7, W8
6. Commit and move to new repo — addresses Priority 3 item 10

**Estimated time to close all critical and warning gaps:** 2-3 days of focused design and documentation work. This aligns with Phase 0 being "no code, only documents, ADRs, and research".

---

## File Paths Referenced

- Requirements: `docs/requirements/v1-requirements.md`
- Design: `docs/design/v1-design.md`
- ADR-0003: `docs/adr/0003-auth-supabase-auth-github-oauth.md`
- Spike-003: `docs/design/spike-003-github-check-api.md`
- Spike-004: `docs/design/spike-004-supabase-auth-github-oauth.md`
- Implementation plan: `docs/plans/2026-03-04-implementation-plan.md`
- Requirements plan: `docs/plans/2026-03-03-v1-requirements-plan.md`
