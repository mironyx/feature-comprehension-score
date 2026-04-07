# Session 2026-04-07 #4 — Issue #178 `resolveUserOrgsViaApp`

## Summary

Implemented the new installation-token-based org membership resolver (Task 2 of epic #176) and, in the process, discovered a systemic drift between `docs/design/v1-design.md`, ADR-0020, and the actual codebase. The PR itself landed cleanly; the bulk of the session was spent auditing the drift and planning the design/docs cleanup that now blocks the rest of the epic.

## Work completed

### Implementation — PR [#185](https://github.com/mironyx/feature-comprehension-score/pull/185)

- **`src/lib/github/app-auth.ts`** — `createAppJwt` (RS256 via `node:crypto`), `createInstallationToken`, cached `getInstallationToken`, test-only `__resetInstallationTokenCache`.
- **`src/lib/supabase/org-membership.ts`** — `resolveUserOrgsViaApp` with injected deps, error contract per LLD §5.3, personal-account shortcut, split into 5 internal helpers to stay inside the CodeScene CC budget.
- **`tests/lib/github/app-auth.test.ts`** — 8 unit tests, real RSA keypair via `generateKeyPairSync`, signature verification round-trip.
- **`tests/lib/supabase/org-membership.test.ts`** — 8 unit tests covering every BDD spec in LLD §7.
- **`tests/fixtures/org-membership-mocks.ts`** — shared mock Supabase client + factories extracted to kill 80+ lines of duplication between the unit test and the evaluator suite.
- **`tests/evaluation/onboarding-auth-resolver.eval.test.ts`** — 10 adversarial tests from the feature-evaluator agent (ADR-0019).
- **CI green:** lint, type-check, unit, integration, Docker build, E2E — all passed.

### Skill / agent improvements

- **`.claude/agents/feature-evaluator.md`** — added a "Reuse, do not duplicate, test boilerplate" section with 5 concrete steps (read existing test files, check `tests/fixtures/`, import existing helpers, extract duplicates into shared fixtures, only write new helpers for genuinely different mock shapes).
- **`.claude/skills/feature-core/SKILL.md`** — mirror rule added before the RED step so the primary author avoids boilerplate duplication in the first place, rather than the evaluator catching it afterwards.

### Design / docs scope expansion

During implementation we discovered:

1. ADR-0020 §37–44's claim that "installation tokens are already used for PR/Check Runs" is **aspirational, not current**. A grep of `src/` shows no installation-token machinery existed before this PR — `createGithubClient` still builds Octokit from the user OAuth token via `get_github_token` RPC + Supabase Vault.
2. `docs/design/v1-design.md` references `provider_token`, `user_github_tokens`, `read:org`, `/user/orgs`, and `syncOrgMembership` in 10+ places — a token-context table, an FCS flow description, a sign-in sequence diagram, an OAuth scopes list, a whole `user_github_tokens` schema subsection with pgsodium helpers, and RLS policies — all describing a model that's about to be deleted.
3. There is no HLD for GitHub auth at all. ADR-0020 picked a direction but never produced a system-level sequence/security document.
4. There is no runbook or written policy for `GITHUB_APP_PRIVATE_KEY` lifecycle (provisioning, rotation, revocation, incident response).

Seven follow-up issues opened on epic #176 and added to the project board:

| # | Title | Type |
|---|---|---|
| [#186](https://github.com/mironyx/feature-comprehension-score/issues/186) | Design: GitHub auth & token handling HLD | Design — blocks everything below |
| [#187](https://github.com/mironyx/feature-comprehension-score/issues/187) | Rewrite v1-design.md §3 + related auth sections | Docs |
| [#188](https://github.com/mironyx/feature-comprehension-score/issues/188) | ADR-0020 addendum — security/key-mgmt + current-state correction | Docs |
| [#189](https://github.com/mironyx/feature-comprehension-score/issues/189) | ADR-0003 authorisation half superseded by ADR-0020 | Docs |
| [#190](https://github.com/mironyx/feature-comprehension-score/issues/190) | Runbook — `GITHUB_APP_PRIVATE_KEY` lifecycle | Ops |
| [#191](https://github.com/mironyx/feature-comprehension-score/issues/191) | Cross-doc grep & fix for stale token references | Chore |
| [#192](https://github.com/mironyx/feature-comprehension-score/issues/192) | Migrate `createGithubClient` off user OAuth token | Code — blocks #179 |

Epic #176 body updated with the new checklist, dependency diagram, and explicit "implementation pause" note — #179 onwards is blocked until #186–#192 land. Each new issue body contains a "For a standalone agent" section so a fresh `/feature <N>` run has everything it needs without chat context.

## Decisions made

- **Use `node:crypto` instead of `jose`/`jsonwebtoken`** — `jose` was assumed to be a transitive dep but isn't actually installed. Rather than add a package for a ~30-line JWT signer, used Node's built-in `createSign('RSA-SHA256')`. Noted in LLD §4.2 that a future refactor to `@octokit/auth-app` is the preferred cleanup path.
- **Co-location of test files reverted** — LLD originally said `src/lib/**/*.test.ts`; actual repo convention is `tests/**`. Moved and updated LLD §4.2.
- **Shared fixture extracted mid-review** — user called out that the evaluator had duplicated 80+ lines of mock Supabase client setup from the unit test. Extracted to `tests/fixtures/org-membership-mocks.ts`, both test files import from it now. Rule added to both feature-core and feature-evaluator skills so this doesn't recur.
- **PR #178 merges despite the design drift** — #178 delivers only infrastructure (zero call sites in `src/`), so it cannot break production. Holding it open would entangle two unrelated problems. The design freeze applies to #179 onwards, not to the in-flight building-blocks PR.
- **LLD-sync ran and found 3 corrections + 3 additions** — see the sync report in this session's transcript; LLD marked Revised.

## Review feedback addressed

- `/pr-review-v2` agents A + C: 0 blockers, 6 warnings. 1 fixed (env-leak in test), 5 deferred with rationale in the PR triage comment.
- CI first run failed on unused `makeUserOrg` in the evaluator file → removed, plus added `const p = parts[1] ?? ''` guard to satisfy strict indexed access.
- User feedback on test-file location → moved `src/lib/**/*.test.ts` → `tests/lib/**`.
- User feedback on fixture duplication → shared fixture + skill updates.

## Next steps

**The next unblocked item is [#186 — HLD](https://github.com/mironyx/feature-comprehension-score/issues/186), not #179.**

Recommended sequencing:

```
#186 (HLD)
  → #187 #188 #189 (docs alignment, parallelisable)
    → #190 #191 (ops + grep pass)
      → #192 (createGithubClient migration)
        → #179 (sign-in cutover — the original Task 3)
          → #180 #181 #182 (parallel)
            → #183 (customer onboarding guide)
```

## Cost retrospective

**Cost summary:**

- PR-creation snapshot: **$3.8533**
- Final total: **$29.1030**
- Delta: **$25.25** post-PR

**Cost drivers identified:**

| Driver | Observed | Impact | Action |
|---|---|---|---|
| Design discovery mid-implementation | The design-drift audit (ADR-0020 vs code vs v1-design.md), 7 new issues, 1 LLD sync, 2 skill updates, runbook planning, all happened **after** PR creation | Dominant — probably ~80% of the post-PR cost | **Run a drift-scan before starting any feature in an epic that spans multiple tasks.** The drift would have been caught in the `/architect` phase if we had audited the current state, not just the target state. |
| Fixture duplication re-worked twice | Evaluator wrote boilerplate → user caught it → extracted fixture → updated both skills | Medium | Skill update now lives in `/feature-core` and `/feature-evaluator` — should prevent recurrence. |
| Test file relocation | `src/lib/**/*.test.ts` → `tests/lib/**` after LLD spec was wrong | Small | `/lld` skill could cross-check repo convention when proposing test file paths. |
| PR-review agents (2 × general-purpose) | Standard for ≥150-line diff | Small | As designed. |
| CI probe + rerun | Lint failure on unused var + strict-index guard | Small | Evaluator agent should run its own lint pass before declaring done. |

**Improvement actions for next feature:**

1. **Run `/drift-scan` before `/feature` on any epic task that changes a system-level concern** (auth, tokens, caching, routing). Had we done this for #178, the ADR-0020 claim would have been caught before implementation and the 7 follow-up issues would have been opened as part of `/architect`, not mid-PR.
2. **`/architect` should produce an HLD, not jump straight to LLDs**, when the epic touches multiple subsystems. ADR-0020 + per-task LLDs proved insufficient — we needed a system-level sequence + security document.
3. **The design-drift check should be a standalone `/feature-core` step** — grep for claims in ADRs/design docs that the target area touches, verify they match reality before writing code.
4. **Evaluator fixture-reuse rule is now enforced** — future eval files should stay thin.

**What went right:**

- TDD discipline held throughout; 16 unit tests + 10 adversarial + 16 existing all green.
- Diagnostics loop caught CC=9 on `writeUserOrgs` early; refactor was quick.
- Shared fixture extraction happened inside the same PR, not in a follow-up — kept the review cycle clean.
- LLD-sync produced a revised LLD with 4 implementation notes, so the next task starts from accurate spec.
