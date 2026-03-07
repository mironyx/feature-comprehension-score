# 0001. GitHub App as Integration Mechanism

**Date:** 2026-03-07
**Status:** Accepted
**Deciders:** LS, Claude

## Context

The FCS tool needs to integrate with GitHub to: receive PR events, read PR content and diffs, create and update Check Runs (the PRCC gate), and verify organisation membership. The two standard mechanisms GitHub offers are GitHub Apps and GitHub Actions.

The tool is a SaaS product hosted externally (ADR-0002: GCP Cloud Run), not code running inside a customer's CI pipeline. It needs to act on behalf of the application across multiple organisations.

## Options Considered

### Option 1: GitHub App

A registered application installed on GitHub organisations. Receives webhooks, authenticates via installation tokens, and has granular permission scopes.

- **Pros:** Webhook-driven — reacts to PR events in real time. Installation tokens are scoped per-organisation (natural multi-tenancy boundary). Only mechanism that can create Check Runs. Granular permissions — request only what's needed. Installation flow provides natural onboarding (Story 1.1). Acts as the application, not as a user.
- **Cons:** More complex auth model (JWT + installation tokens). Requires managing a private key and webhook secret. Must handle webhook verification and token refresh.

### Option 2: GitHub Action

A workflow that runs in the customer's CI pipeline, triggered by PR events.

- **Pros:** Familiar to developers. Runs in the customer's GitHub Actions environment. No external webhook infrastructure needed.
- **Cons:** Cannot create Check Runs as a named app — would appear as a generic CI check. Runs in the customer's CI minutes (cost to them). Cannot receive events outside CI — FCS (retrospective) flow has no PR trigger. Secrets (API keys for our backend) must be stored in every customer's repo. No installation-level identity — harder to enforce multi-tenancy. The tool would be split between a CI action and a web backend, complicating the architecture.

## Decision

**Option 1: GitHub App.**

Check Runs are the core PRCC mechanism, and only GitHub Apps can create them as a named application. This alone is decisive — a GitHub Action would produce anonymous CI checks that cannot be distinguished from other workflows.

Beyond Check Runs: the GitHub App model matches the product's architecture. A SaaS product that reacts to events across multiple organisations needs webhook delivery, per-organisation authentication, and granular permissions. GitHub Apps provide all three. GitHub Actions are designed for code that runs inside a repo's CI pipeline, not for an external service.

### Permissions

Minimum required (from spike-003):

| Permission | Access | Purpose |
|-----------|--------|---------|
| Checks | Write | Create and update Check Runs |
| Pull requests | Read | Read PR content, diff, metadata |
| Contents | Read | Read full file contents for context |
| Members | Read | Verify organisation membership |

## Consequences

- **Easier:** Real-time webhook delivery for PR events. Named Check Runs ("Comprehension Check") that integrate cleanly with branch protection. Per-organisation installation tokens provide a natural tenant boundary.
- **Harder:** Must implement JWT generation, installation token management, and webhook signature verification. The auth spike (spike-003) covers the mechanics.
- **Follow-up:** Story 1.1 should guide Org Admins to add "Comprehension Check" as a required status check in branch protection rules after installation.

## References

- Research spike: `docs/design/spike-003-github-check-api.md` — Check Run lifecycle, authentication, permissions
- Requirements: Stories 1.1 (Installation), 2.1 (PR Event Detection), 2.3 (Check Creation)
- ADR-0002: Hosting — GCP Cloud Run (external SaaS, not in-repo CI)
