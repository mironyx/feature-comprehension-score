# 0009. Test Diamond Strategy

**Date:** 2026-03-11
**Status:** Accepted
**Deciders:** LS, Claude

## Context

The implementation plan specifies a classic test pyramid (70% unit / 20% integration / 10% E2E). This project has three distinct module types with different testing needs:

- **Engine** — pure functions, no I/O. Unit tests are the sweet spot.
- **API routes + webhooks** — orchestration across Supabase, GitHub, auth. Real bugs live at boundaries. Supabase RLS can only be tested at integration level.
- **UI** — user journeys matter more than component isolation.

The test diamond paradigm argues integration tests give the best confidence-to-cost ratio for boundary-heavy code.

## Options Considered

1. **Classic pyramid (70/20/10)** — heavy unit testing everywhere. Over-invests in mocking for API routes; mocks drift from reality; RLS untestable at unit level.
2. **Module-specific diamond** — ratios match the nature of each module. Engine gets unit tests; API routes get integration tests; UI gets E2E.
3. **Uniform diamond** — all modules get mostly integration tests. Over-invests for the engine, which is pure and trivially unit-testable.

## Decision

**Option 2: Module-specific diamond.**

| Module | Unit | Integration | E2E |
|--------|------|-------------|-----|
| Engine | 70% | 20% | 10% |
| API routes + webhooks | 20% | 70% | 10% |
| UI pages | — | — | 100% |
| **Overall** | ~35% | ~45% | ~20% |

Static analysis (TypeScript strict, ESLint, architecture fitness tests, CodeScene) forms the base layer.

Coverage targets unchanged: engine 90%, API routes 85%, overall 80%.

## Consequences

- **Positive:** Higher confidence in API routes (real DB, real RLS). Less mock maintenance. Tests match risk profile.
- **Negative:** Slower CI (~1-2 min for integration tests). Requires robust test data management (factories, transaction rollback). Local dev needs `supabase start`.
- **Neutral:** Coverage targets unchanged — only the test type distribution shifts.
