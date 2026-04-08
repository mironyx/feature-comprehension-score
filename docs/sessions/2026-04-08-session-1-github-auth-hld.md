# Session Log — 2026-04-08 Session 1 — GitHub Auth HLD (#186)

## Context

Issue #186: author the High-Level Design for GitHub auth & token handling, reconciling ADR-0020 with the actual state of the codebase. PR #193 (branch `docs/github-auth-hld`) had landed the initial draft; this session was a substantive review pass driven by user questions and pushback.

No LLD exists for #186 — it *is* a design document. `/lld-sync` skipped accordingly.

## Work completed

All changes are to [docs/design/github-auth-hld.md](../design/github-auth-hld.md). PR #193.

1. **§4.1a — Supabase session JWT (context D).** Added a new subsection naming the Supabase session JWT as the fourth token context. It is not a GitHub credential but is the trust root for edge E3 of §4.3, and its absence from the original draft left a gap in the cross-org isolation story. Documented its storage (HTTP-only cookie via `@supabase/ssr`), lifetime, the full surface area of code that touches it (four helpers in `src/lib/supabase/`), and the threat-model note that E3's integrity depends on the JWT being unforgeable.
2. **§4.3 E3 — explicit reference to context D.** E3 previously said "the user's session JWT is the authorisation" without naming where that JWT lives. Updated to reference context D directly.
3. **§6.1 clarification — "CI" means *our* CI only.** The CI row in the storage-tiers table was easy to misread as "every customer needs a copy of this key in their pipeline". Added an explicit note that customers never hold the private key under any circumstance, that PRCC runs server-side on our Cloud Run as a GitHub Check Run, and that this is why we chose the GitHub App + Check Run model rather than shipping PRCC as a distributable GitHub Action.
4. **§9 renamed — "Open Questions" → "Decisions and Forward Notes".** Every bullet was already resolved in-place; the old heading misled readers. Marked each as **Decision** or **Forward note** explicitly.
5. **§10 — Scaling and Non-Goals (new section).**
    - **§10.1 Sign-in resolver scaling.** Named the N-calls fan-out cliff with honest numbers (comfortable up to ~50 installations, uncomfortable at 100, unacceptable at 200+). Explicitly ruled out GraphQL as a fix because the limit is authorisation-scope-per-token, not query shape. Sketched the webhook-driven `github_org_memberships` reverse index as the forward path with concrete metrics (`sign_in_resolver_duration_ms`, `sign_in_resolver_installations_scanned`) and alert thresholds set well before the cliff.
    - **§10.2 LLM-driven GitHub access non-goal.** Recorded FCS's pre-fetch-in-our-code approach as a deliberate V1 choice, with prompt injection on attacker-controlled PR content named as the controlling reason. Specified the architecture any future MCP integration must follow (stateless server, per-request installation token minted at edge E3, allowlisted tool surface, per-invocation audit log, token scope minimised at mint time, tool-call budget per conversation). Principle: privilege lives in the orchestrator, not the tool surface. Any proposal to add a fourth edge to §4.3 now requires a new ADR.

## Decisions made

- **Hybrid (FCS on user OAuth, sign-in on installation tokens) was considered and rejected.** During the session I proposed a hybrid as a way to preserve GitHub's defence-in-depth on PR reads, then the user correctly pointed out it was incoherent: PRCC cannot use user OAuth (no user at webhook time), so the cross-org discipline is required regardless. The hybrid would pay the cost of two token systems while only protecting the easier half. Decision: full installation-token cutover as originally planned, with §4.3 discipline applied uniformly.
- **Cross-org isolation principle stays in the HLD (§4.3), not as a standalone ADR.** Tightly coupled to ADR-0020. Extract only if a second use case beyond FCS + PRCC emerges.
- **GraphQL is not a fix for the sign-in resolver fan-out.** Limit is authorisation scope per token, not query shape. Documented in §10.1 so nobody re-asks.
- **LLM/MCP access is a deliberate non-goal for V1.** Prompt injection is the controlling reason. Documented in §10.2 with the required architecture for any future revisit.
- **Reverse-index trigger thresholds set explicitly:** p95 `sign_in_resolver_duration_ms` > 1500 ms OR `installations_scanned` > 25 → begin reverse-index migration.
- **§9 renamed to reflect actual state** (everything was resolved; the heading was misleading).

## Review feedback addressed

Review feedback from user came in several waves during the session, all addressed:

1. Scope drop on M2 cached tokens — documented in M2.
2. `members:read` consent ordering — M4 promoted to M1.5 (must run before M2).
3. Observability for token minting — added to M5.
4. Confirmation that `mironyx` App already has `members:read` — M1.5 simplified to verification script.
5. Supabase session JWT not named — §4.1a added.
6. §6.1 CI row ambiguous — clarified.
7. Sign-in resolver scaling implicit — §10.1 added with honest numbers.
8. LLM/MCP access not addressed — §10.2 added.
9. §9 mislabelled — renamed.

## Next steps

- PR #193 ready for user's final review and merge.
- Downstream tasks (#178 FCS cutover, #179 sign-in cutover) remain scoped as before. The M1 `assessments.installation_id` denormalisation is a small schema addition that gets picked up when #178 is implemented.
- Metrics and alerts from §10.1 belong on the M5 hardening list, not as blockers for #186.
- CLAUDE.md rule from §4.3 ("installation_id has three entry points") to be added as part of M1 implementation, not in this PR.

## Cost retrospective

No Prometheus cost data collected for this session — this was a pure review/discussion cycle on a docs-only PR, not a `/feature` run. The session was user-driven via direct questions and pushback, with each round resulting in a focused HLD edit + commit + push. Approximately 8 commits pushed across the session.

**Cost drivers (qualitative):**

- **High-value review cycle.** The biggest architectural improvement of the session came from user questions that exposed gaps in the original draft (hybrid consideration, cross-org risk, scaling cliff, MCP non-goal). Claude's initial instinct on several points was wrong or oversold (the hybrid was incoherent; "500+ installations" was too generous; §9 was mislabelled). Every user challenge resulted in a better doc. This is the value of human review — not minor edits, but catching structural confusions before they ship.
- **Long conversation, steady cost.** The HLD grew by ~250 lines across the session. Each edit was small and focused; no wasted tokens on re-reading the entire file repeatedly because edits were targeted.

**Improvement actions for future HLD work:**

1. **Surface hidden assumptions in the first draft.** The original HLD implicitly assumed the Supabase session JWT, the "our CI vs customer CI" distinction, and the sign-in resolver scaling story were obvious. They weren't. Next HLD: run a "what would a new reader misread?" pass before asking for human review.
2. **Don't oversell mitigations.** I initially framed §4.3 as "solved by RLS" when in reality it is "solved by RLS + discipline about service-role access + denormalisation on work rows". The user pushed on this and the doc got better. Next time: write the caveats alongside the solution, not after being asked.
3. **Be willing to reverse framings quickly.** The hybrid proposal was a mistake; admitting it took two rounds. Should have stress-tested it against PRCC before proposing it.
4. **Resolved questions are not open questions.** If every bullet in "Open Questions" has an answer inline, the heading is wrong. Apply this to future LLDs too.
