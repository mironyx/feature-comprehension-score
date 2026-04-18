# Drift Report: Requirements ↔ Design ↔ Code

**Scan date:** 2026-04-18
**Scanner:** requirements-design-drift agents (3 parallel)
**Project phase:** Phase 1: Core Feature Implementation

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| Warning  | 4 |
| Info     | 5 |

**Overall drift score:** No critical issues. The C1 finding from the 2026-04-12 scan
(`fetchRepoInfo` missing `installation_id`) is confirmed fixed. E11 revert is clean — no
orphaned code. V3 epics (#214, #215) fully shipped with LLDs in sync. Primary drift is in
ADR follow-up tracking and two design docs awaiting human approval.

**Resolved since last scan (2026-04-12):**

- C1 — `fetchRepoInfo` select string missing `installation_id`: **Fixed.** Line 158 of
  `src/app/api/fcs/service.ts` now selects `organisations!inner(github_org_name, installation_id)`.
  Test assertions added in #261/#262.
- C2 — `lld-onboarding-auth-client-migration.md` status "in progress": **Resolved** — the
  remaining select-string work was the C1 fix above.
- W1 — `installer_github_user_id` deferred in webhooks LLD: **Resolved** — marked as
  "descoped" in `lld-onboarding-auth-webhooks.md` AC (rationale: first-install-race mitigation
  was descoped in `lld-onboarding-auth-cutover.md` §6; column never added to schema).

---

## Warnings

### W1: `github-auth-hld.md` still "Draft (pending human security sign-off)"

- **Location:** `docs/design/github-auth-hld.md` header
- **Issue:** Carried from 2026-04-12 scan (was C3). The cross-org isolation model in §4.3 is
  implemented in production-path code. The "three entry points" CLAUDE.md rule from §4.3 has
  not been added. The document has never received its required human approval.
- **Impact:** Organisational risk — security model running without sign-off. Not a code bug.
- **Suggested action:** Human review. If approved as-is, change status to "Accepted". Add the
  §4.3 CLAUDE.md rule. This is blocked on human, not process.

### W2: ADR-0012 body references `AnthropicClient` after partial supersession

- **Location:** `docs/adr/0012-llm-client-interface-and-model-default.md`
- **Issue:** Carried from 2026-04-12 scan (was W3). Header correctly annotated "Partially
  superseded by ADR-0015" but body still discusses `AnthropicClient` and old model string
  `claude-sonnet-4-20250514`. Follow-up note references updating `AnthropicClient` — the
  adapter is now `OpenRouterClient`.
- **Impact:** Low. Misleading for readers who don't notice the supersession header.
- **Suggested action:** Add inline annotations at stale paragraphs referencing ADR-0015.

### W3: ADR-0003 Vault encryption follow-up obsoleted by ADR-0020

- **Location:** `docs/adr/0003-auth-supabase-auth-github-oauth.md`, Consequences section
- **Issue:** Follow-up states "Provider token encryption approach (Supabase Vault) should be
  validated during Phase 2." ADR-0020 supersedes this — `user_github_tokens` table is being
  removed; Vault encryption is no longer relevant. ADR-0003 does not acknowledge this.
- **Impact:** Low. A reader following ADR-0003 may attempt unnecessary Vault work.
- **Suggested action:** Add note that this follow-up is superseded by ADR-0020.

### W4: E11 LLD is obsolete — design review pending rewrite

- **Location:** `docs/design/lld-v2-e11-artefact-quality.md`
- **Issue:** The LLD (v0.1, 2026-04-16) describes a standalone artefact-quality evaluator.
  This was fully implemented (5 tasks, 4 PRs) then reverted on 2026-04-17 after design review
  found over-engineering. The 2026-04-18 session cancelled E11 entirely — quality scoring
  deferred to V3, E17 tool-call logs provide organic quality signal.
- **Impact:** The LLD is misleading if read without context. However, the epic is cancelled
  and all code reverted, so there is no code↔design mismatch.
- **Suggested action:** Update LLD status to "Cancelled — see 2026-04-18 session log" or
  delete it. No rewrite needed since the epic is cancelled.

---

## Informational

### I1: `frontend-system.md` still "Draft — awaiting human approval"

- **Location:** `docs/design/frontend-system.md`
- **Issue:** Technology choices (Tailwind, shadcn/ui, Syne + Outfit fonts, amber accent) are
  in active use. Document should be marked "Accepted" if choices are considered final.
- Carried from 2026-04-12 scan.

### I2: ADR-0016 (Structured Logging with Pino) still "Proposed"

- **Location:** `docs/adr/0016-structured-logging-with-pino.md`
- **Issue:** Pino logging is implemented and in use. ADR should be accepted. Console-call
  count ("35+") is a stale snapshot. No lint rule enforcement mechanism created.

### I3: ADR-0023 (Tool-Use Loop) still "Proposed"

- **Location:** `docs/adr/0023-tool-use-loop-for-rubric-generation.md`
- **Issue:** This governs E17 implementation which has 7 GH issues ready. Should be accepted
  before implementation begins.

### I4: V2 Epics 7–10, 12–16 have requirements but no design or issues

- **Location:** `docs/requirements/v2-requirements.md`
- **Issue:** 9 epics exist as requirements only. No LLDs, no GH issues, no `/architect` run.
  Expected for V2 phase — no action needed until those epics are scheduled.

### I5: Silent catch in `artefact-source.ts` line 198 lacks explanatory comment

- **Location:** `src/lib/github/artefact-source.ts:198–200`
- **Issue:** `fetchLinkedIssues` catch block returns `null` without logging. This is
  intentional graceful degradation (missing issues are non-fatal), but no comment explains why.
- **Suggested action:** Add inline comment.

---

## Coverage Matrix

| Epic / Area | Stories | HLD | LLDs | ADRs | Code | Tests | Coverage |
|---|---|---|---|---|---|---|---|
| E1: Org Setup | 1.1–1.5 | Full | Inline + webhook LLD | ADR-0001, -0008, -0020 | Webhook handler, schema, RLS | installation-handlers, webhook | 70% — config UI deferred |
| E2: PRCC Flow | 2.1–2.9 | Full | lld-artefact-pipeline | ADR-0006, -0007, -0011 | None | None | 0% — expected |
| E3: FCS Flow | 3.1–3.6 | Full | Inline | ADR-0005, -0011 | 3.1/3.3/3.4 done | fcs, answering, results | 50% — email, partial, reassess deferred |
| E4: Engine | 4.1–4.5 | Full | Inline | ADR-0009, -0010, -0012, -0015 | All modules | Comprehensive | 100% |
| E5: Auth & Web | 5.1–5.4 | Full | 7 onboarding-auth LLDs | ADR-0003, -0004, -0020 | Auth, org-select, middleware | callback, org-membership, auth | 85% — HLD not approved (W1) |
| E6: Reporting | 6.1–6.4 | Partial | None | None | Basic results page | results tests | 25% — org overview deferred |
| V3 E1: Hints (#214) | 1.1–1.3 | Final | lld-v3-e1-hints (current) | — | All shipped | Full | 100% |
| V3 E2: Depth (#215) | 2.1–2.4 | Final | lld-v3-e2-depth (current) | — | All shipped | Full | 100% |
| V2 E11: Quality (#233) | 11.1–11.2 | Draft | Obsolete (cancelled) | — | Reverted | Reverted | N/A — cancelled |
| V2 E17: Retrieval (#240) | 17.1–17.2 | Draft | lld-v2-e17 (current) | ADR-0023 | Partial (#244, #248) | Partial | 20% — 7 tasks remain |
| Onboarding & Auth (#176) | O.1–O.6 | Full | 7 task LLDs | ADR-0020 | O.1–O.5 done | Full per task | 85% — closed epic |

---

## Recommendations

1. **Accept ADR-0023 before E17 implementation begins.** It governs the tool-use loop
   architecture and has 7 GH issues ready to implement against it.

2. **Update E11 LLD status to "Cancelled".** The epic is cancelled, code reverted, and
   requirements updated. The LLD should reflect this to avoid confusion.

3. **ADR hygiene pass (W2, W3).** Annotate stale follow-ups in ADR-0003 and ADR-0012. These
   are 5-minute edits that prevent future confusion.

4. **W1 (HLD sign-off) remains blocked on human.** Not a process gap — flagged for visibility.
