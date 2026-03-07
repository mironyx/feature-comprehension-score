# 0002. Hosting — GCP Cloud Run

**Date:** 2026-03-07
**Status:** Accepted
**Deciders:** LS, Claude

## Context

The FCS tool is a Next.js application that needs to be deployed as a SaaS product. The app serves three roles from a single codebase: web UI, GitHub App webhook handler, and API routes that call the Anthropic Claude API for question generation and scoring.

The main technical constraint is LLM call duration. Question generation targets < 30 seconds, answer scoring < 10 seconds per answer. The webhook handler must process GitHub events and create Check Runs promptly.

Supabase is the database and auth provider (ADR-0003). The hosting choice does not affect Supabase — it works with either platform.

Practical constraint: existing GCP account with available credits.

## Options Considered

### Option 1: Vercel

Serverless deployment purpose-built for Next.js. API routes run as serverless functions.

- **Pros:** Zero-config deployment for Next.js. Built-in preview deployments per PR. Simple CI/CD.
- **Cons:** Serverless function timeouts: 10s (Hobby), 60s (Pro), 300s (Enterprise). LLM calls need Pro plan minimum. No long-running background workers. Additional monthly cost when GCP credits are already available.

### Option 2: GCP Cloud Run

Container-based deployment. Next.js runs as a Docker container with no function timeout constraints.

- **Pros:** No function timeout limits — containers handle long-running requests natively. Full control over runtime environment. Pay per CPU-second. Available GCP credits reduce cost. Not locked to a single vendor's deployment model.
- **Cons:** Requires Dockerfile and Cloud Build pipeline. Preview deployments need manual setup. Cold starts unless minimum instances are configured. More operational overhead than Vercel.

## Decision

**Option 2: GCP Cloud Run.**

Cloud Run eliminates the function timeout constraint entirely. LLM calls can take as long as they need without worrying about plan tier limits. The container model also provides a natural path to background workers if V2 needs them.

The operational overhead (Dockerfile, Cloud Build) is a one-time setup cost. Next.js standalone output mode produces a Docker-ready build with minimal configuration. Existing GCP credits make this the cheaper option for V1.

## Consequences

- **Easier:** No timeout constraints on LLM calls. Freedom to add background processing later without platform migration.
- **Harder:** Must set up Dockerfile, Cloud Build pipeline, and Cloud Run service configuration. Preview deployments require additional setup (not built-in like Vercel). Cold start management needs attention.
- **Follow-up:** Design doc Component 1 should be updated from "Hosted on Vercel or GCP (ADR-0002 pending)" to "Hosted on GCP Cloud Run".

## References

- Requirements: Epic 5 (Web Application), Cross-cutting concerns (Performance targets)
- ADR-0003: Auth — Supabase Auth + GitHub OAuth (works with either platform)
- Design: Component 1 (Next.js Application)
