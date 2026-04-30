# Session: V11 kickoff bootstrap

**Date:** 2026-04-30
**Skill:** /kickoff
**Slug:** v11-bootstrap
**Mode:** major-version delta
**Inputs:** docs/requirements/v11-requirements.md (v1.1, Final)

## Summary

Bootstrapped V11 design artefacts in delta mode over the V1 HLD. Produced
delta HLD, three load-bearing ADRs, and an epic-shaped implementation
plan covering 18 stories across four epics. Both drift scans passed
with surface patches; no critical drift. Epic issue creation deferred
to /architect per user direction.

## Artefacts produced

- **HLD:** [docs/design/v11-design.md](../design/v11-design.md) — delta over v1, three levels, three V11 sequence diagrams.
- **ADRs:**
  - [ADR-0027 Project as a Sub-Tenant Within Organisation](../adr/0027-project-as-sub-tenant-within-org.md) — pins org-as-tenant-boundary; no project_members table.
  - [ADR-0028 Project Context Reuses organisation_contexts Keyed by project_id](../adr/0028-project-context-reuses-organisation-contexts.md) — uses ADR-0017's nullable hook; amends ADR-0013 for FCS context resolution.
  - [ADR-0029 Repo Admin Permission: Sign-in Snapshot](../adr/0029-repo-admin-permission-runtime-derived.md) — extends ADR-0020's `user_organisations` snapshot with admin-repo set; one-tier model after course correction.
- **Plan:** [docs/plans/2026-04-30-v11-implementation-plan.md](../plans/2026-04-30-v11-implementation-plan.md) — four epics with parallelisation Mermaid.

## Drift scans

- **Gate 1 (HLD ↔ requirements):** PASS-with-patches. 4 warnings — Stories 4.1 NavBar, 4.3 breadcrumbs, 4.5 legacy 404, and Repo Admin gate boundary all needed explicit anchors in L1/L2. Patches W1–W4 applied as one-line additions. No requirement reassignment.
- **Gate 2 (plan ↔ HLD ↔ requirements):** PASS-with-patches. 4 warnings — Story 4.5 cross-epic reassignment acknowledgement, E11.3 Depends-on missing the gate dependency, partial-payload constraint missing from E11.1 Exit criteria, breadcrumb/route coupling stated as advisory rather than constraint. All resolved by R1–R4. Stale "Story 3.3" reference noted in requirements §Config Model (I3) — left for user to fix in the requirements doc.

## Course corrections

1. **ADR proposal pruning.** Initial seven-ADR list reduced to three after user pushed back on level: ADR-2 (no org fallback) was already specified by requirements §DP4 — captured as a one-line amendment note on ADR-0013 inside the HLD. ADR-5 (single PATCH endpoint) and ADR-6 (localStorage for last-visited) were too low-level — moved to LLD scope. ADR-3 (hard-delete-only-when-empty) also dropped to LLD scope.
2. **Story 4.5 framing.** Initial plan presented it as "implement the legacy 404 handler in E11.2" — user corrected: pre-prod, no legacy URLs in the wild (requirements §OQ 5), so Story 4.5 is incidental and satisfied by deleting the legacy route directory as part of the E11.2 URL migration. Plan and Coupling notes rewritten to reflect this.
3. **Two-tier → one-tier auth model.** Initial ADR-0029 had project CRUD reading the snapshot but FCS create issuing a fresh GitHub fetch per repo (defence in depth). User pointed out (a) this contradicted the snapshot story for non-GitHub-adjacent ops, and (b) the existing `user_organisations.github_role` already accepts a sign-in-bounded staleness window, so extending it to the admin-repo set is consistent rather than a new staleness class. Collapsed to one-tier model: all V11 Repo-Admin checks read the snapshot. ADR-0029, HLD L2 row, HLD sequence diagram 3.V11.1, and plan E11.2 Owns all updated.

## Decisions deferred to /architect or LLDs

- Storage shape for the admin-repo snapshot: JSONB column on `user_organisations` vs sibling junction table (ADR-0029 §Decision 1 — LLD chooses).
- Project hard-delete-only-when-empty enforcement: API-level check, transaction shape (E11.1 LLD).
- `PATCH /api/projects/[id]` request schema and partial-payload validation (E11.1 LLD).
- Last-visited localStorage key name, sign-out clear hook, project-existence validation (E11.4 LLD).
- File-level conflict analysis between E11.2 and E11.4 around `src/app/projects/[id]/assessments/...` (per /architect's authoritative pass).

## CLAUDE.md update

Skipped (delta mode — no new ADR invalidates a CLAUDE.md block).

## Epic issue creation

Deferred per user direction. /architect will create each epic issue
alongside its task issues and LLD, in dependency order starting with
E11.1. Issue body templates are recorded in the session conversation
for reuse.

## Next step

`/architect` on E11.1 (Project Management).
