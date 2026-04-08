# Research Spike #3: GitHub Check API

> **Superseded in part by epic [#176](https://github.com/mironyx/feature-comprehension-score/issues/176) / [ADR-0020](../adr/0020-org-membership-via-installation-token.md).**
> Any references in this spike to the user OAuth `provider_token` / `read:org` path
> for org membership are historical. Org membership is now resolved server-side via
> the GitHub App installation token; see [github-auth-hld](github-auth-hld.md).

## Document Control

| Field | Value |
|-------|-------|
| Issue | #3 |
| Status | Complete |
| Author | Claude |
| Created | 2026-03-05 |

## Questions Investigated

1. Does Check Run + branch protection rules = merge blocked?
2. What is the Check Run lifecycle (create, update, complete)?
3. How does the GitHub App authenticate to create/update Check Runs?
4. What webhook events do we receive and how do we verify them?
5. What are the minimum GitHub App permissions needed?

---

## Finding 1: Check Run + Branch Protection = Merge Blocked (Confirmed)

**Yes.** This is the mechanism that makes PRCC a real gate, not just a notification.

### How it works

Branch protection rules have a setting: **"Require status checks to pass before merging."** When enabled, repository admins select which checks are required by name. Our check will be named "Comprehension Check".

When a Check Run with that name exists on the PR's head commit:

| Check Run conclusion | Treated as | Merge allowed? |
|---------------------|------------|----------------|
| `success` | Passing | Yes |
| `failure` | Failing | **No — merge button disabled** |
| `neutral` | Passing | Yes |
| `skipped` | Passing | Yes |
| `cancelled` | Failing | No |
| `timed_out` | Failing | No |
| `action_required` | Failing | No |
| No check run exists | Pending | No (waits indefinitely) |
| `in_progress` | Pending | No (waits for completion) |

### What this means for our stories

| Story | Conclusion we use | Why |
|-------|------------------|-----|
| **2.3** Assessment initiated | `in_progress` (status, not conclusion) | Merge blocked while participants answer |
| **2.5** Soft mode pass | `success` | All answered relevantly — merge allowed |
| **2.6** Hard mode pass | `success` | Aggregate above threshold — merge allowed |
| **2.6** Hard mode fail | `failure` | Aggregate below threshold — merge blocked |
| **2.7** Admin skip | `neutral` | Explicitly not a failure — merge allowed |
| **2.1** Small PR / exempt files | `neutral` | Nothing to check — merge allowed |
| **4.5** LLM failure (generation failed) | `neutral` | Tool failure should not block the team |

**Critical insight:** `neutral` is our escape hatch. It means "this check has nothing to report" — not success, not failure. It allows merge without the green tick of `success`. This is exactly right for skips and auto-exemptions.

### Setup required by the customer

For the merge gate to work, the customer's **Org Admin must configure their repository's branch protection rules** to require the "Comprehension Check" status check. Our app cannot set branch protection rules — that is a repository admin action.

This means:
1. Our GitHub App creates Check Runs named "Comprehension Check" on every eligible PR.
2. The Org Admin adds "Comprehension Check" as a required status check in the repository's branch protection settings.
3. From that point, GitHub enforces the merge gate. We do not need to enforce it ourselves.

**Implication for Story 1.1 (GitHub App Installation):** We should display setup instructions after installation, guiding the Org Admin to add the required status check to their branch protection rules. This is a one-time setup step per repository.

### Strict vs loose mode

Branch protection offers two modes for required checks:

- **Strict:** Branch must be up to date with the base branch before merging. Our check re-runs on every push (Story 2.8), so this works naturally.
- **Loose:** Branch does not need to be up to date. Our check still applies to whatever SHA is the head commit.

We do not control this setting. It is the customer's choice. Both modes work with our Check Run approach.

---

## Finding 2: Check Run Lifecycle

A Check Run moves through a clear lifecycle. Our app creates it, updates it, and completes it.

### The lifecycle, mapped to our PRCC flow

```
  PR opened/ready                Our App                 GitHub Checks API
      │                            │                            │
      │                            │                            │
  STEP 1: PR event triggers assessment creation                 │
  ─────────────────────────────────────────────                 │
      │                            │                            │
      │  Webhook: pull_request     │                            │
      │  (opened/ready_for_review) │                            │
      │ ──────────────────────────►│                            │
      │                            │                            │
      │                            │  POST /repos/{owner}/{repo}/check-runs
      │                            │  {                         │
      │                            │    name: "Comprehension Check",
      │                            │    head_sha: "abc123",     │
      │                            │    status: "in_progress",  │
      │                            │    started_at: "2026-...", │
      │                            │    details_url: "https://our-app.com/assessment/xyz",
      │                            │    output: {               │
      │                            │      title: "Comprehension Check",
      │                            │      summary: "Waiting for 3 participants..."
      │                            │    }                       │
      │                            │  }                         │
      │                            │ ─────────────────────────► │
      │                            │                            │
      │                            │  201 Created               │
      │                            │  { id: 12345, ... }        │
      │                            │ ◄───────────────────────── │
      │                            │                            │
      │                            │  Store check_run_id=12345  │
      │                            │  in our DB (assessment     │
      │                            │  record)                   │
      │                            │                            │
      │                            │                            │
  STEP 2: Participants answer (intermediate updates)            │
  ──────────────────────────────────────────────                │
      │                            │                            │
      │  Each time a participant   │                            │
      │  submits answers:          │                            │
      │                            │                            │
      │                            │  PATCH /repos/{owner}/{repo}/check-runs/12345
      │                            │  {                         │
      │                            │    output: {               │
      │                            │      title: "Comprehension Check",
      │                            │      summary: "2 of 3 participants completed"
      │                            │    }                       │
      │                            │  }                         │
      │                            │ ─────────────────────────► │
      │                            │                            │
      │                            │  The summary updates live  │
      │                            │  on the PR — reviewers can │
      │                            │  see progress.             │
      │                            │                            │
      │                            │                            │
  STEP 3: All participants done — score and complete            │
  ──────────────────────────────────────────────                │
      │                            │                            │
      │  Last participant submits. │                            │
      │  Scoring runs.             │                            │
      │                            │                            │
      │  (a) Soft mode pass:       │                            │
      │                            │  PATCH /repos/{owner}/{repo}/check-runs/12345
      │                            │  {                         │
      │                            │    status: "completed",    │
      │                            │    conclusion: "success",  │
      │                            │    completed_at: "2026-...",
      │                            │    output: {               │
      │                            │      title: "Comprehension Check — Passed",
      │                            │      summary: "All 3 participants answered.\nAggregate: 82%"
      │                            │    }                       │
      │                            │  }                         │
      │                            │ ─────────────────────────► │
      │                            │                            │
      │                            │  Merge button goes green.  │
      │                            │                            │
      │  (b) Hard mode fail:       │                            │
      │                            │  PATCH ...                 │
      │                            │  {                         │
      │                            │    status: "completed",    │
      │                            │    conclusion: "failure",  │
      │                            │    output: {               │
      │                            │      title: "Comprehension Check — Failed",
      │                            │      summary: "Aggregate comprehension: 58% (threshold: 70%)"
      │                            │    }                       │
      │                            │  }                         │
      │                            │ ─────────────────────────► │
      │                            │                            │
      │                            │  Merge button stays red.   │
      │                            │                            │
      │  (c) Admin skip:           │                            │
      │                            │  PATCH ...                 │
      │                            │  {                         │
      │                            │    status: "completed",    │
      │                            │    conclusion: "neutral",  │
      │                            │    output: {               │
      │                            │      title: "Comprehension Check — Skipped",
      │                            │      summary: "Skipped by @admin: Emergency hotfix"
      │                            │    }                       │
      │                            │  }                         │
      │                            │ ─────────────────────────► │
      │                            │                            │
      │                            │  Merge allowed (neutral    │
      │                            │  = not blocking).          │
```

### Key API details

| Field | Purpose | Our usage |
|-------|---------|-----------|
| `name` | Identifies the check. Must match the name in branch protection rules. | Always `"Comprehension Check"` |
| `head_sha` | The commit SHA the check applies to. | The PR's head commit SHA (from webhook payload) |
| `status` | Current phase: `queued`, `in_progress`, `completed` | Create as `in_progress`, complete when scored |
| `conclusion` | Final result. Only set when `status` = `completed`. | `success`, `failure`, or `neutral` |
| `details_url` | Link shown on the check — "Details" link in the PR UI. | URL to our assessment answering page |
| `output.title` | Bold heading in the check detail view. | "Comprehension Check", "...— Passed", "...— Failed" |
| `output.summary` | Markdown body. Participant count, aggregate score. | Progress updates, final results |
| `external_id` | Our internal reference. Not shown to user. | Our assessment UUID |

### Limits

- **1,000 check runs per name per suite.** Far beyond our usage. One PR = one check run (replaced on new commits).
- **50 annotations per API call.** We do not use annotations (no line-level feedback).
- **Output text supports Markdown.** We can format the summary nicely.

---

## Finding 3: GitHub App Authentication — Two Layers

> **Clarification: "installation token" ≠ "provider token"**
>
> Spike #4 (Supabase Auth) describes the **provider token** — a GitHub OAuth token that represents a *human user*, obtained during browser sign-in, used only for fetching the user's org list (`read:org` scope). Supabase passes it through once and discards it; we store it encrypted.
>
> This spike describes the **installation access token** — a GitHub App token that represents *our application*, generated server-side from our app's private key, used for all automated GitHub API calls (reading PRs, writing Check Runs). No human is involved.
>
> These are completely separate authentication contexts. They never substitute for each other. See spike #4, Finding 7 ("Two Separate GitHub Authentication Contexts") for the full comparison.

Our webhook handler needs to both **receive** webhooks and **call the GitHub API**. These use different authentication mechanisms.

### Layer 1: Verifying incoming webhooks (HMAC)

When GitHub sends a webhook, it signs the request body with a shared secret (configured when registering the GitHub App). Our handler verifies the signature before processing.

```
  GitHub                           Our Webhook Handler
    │                                     │
    │  POST /api/webhooks/github          │
    │  Headers:                           │
    │    X-Hub-Signature-256: sha256=abc  │
    │    X-GitHub-Event: pull_request     │
    │    X-GitHub-Delivery: guid-123      │
    │  Body: { action: "opened", ... }    │
    │ ───────────────────────────────────► │
    │                                     │
    │                                     │  1. Read X-Hub-Signature-256
    │                                     │  2. Compute HMAC-SHA256 of body
    │                                     │     using our stored webhook secret
    │                                     │  3. Compare using timing-safe
    │                                     │     comparison (crypto.timingSafeEqual)
    │                                     │  4. Match? → process
    │                                     │     No match? → 401 Unauthorized
    │                                     │
```

**Implementation:** The `@octokit/webhooks` library handles this. No manual HMAC code needed:

```typescript
import { Webhooks } from "@octokit/webhooks";

const webhooks = new Webhooks({
  secret: process.env.WEBHOOK_SECRET,
});

// In our Next.js route handler:
const isValid = await webhooks.verify(requestBody, signatureHeader);
```

### Layer 2: Calling the GitHub API (installation token)

After verifying a webhook, our handler needs to call GitHub's API (create Check Run, fetch PR diff, etc.). This requires a **GitHub App installation access token** — a short-lived token the app generates for itself.

```
  Our App                         GitHub API
    │                                │
    │                                │
  Step 1: Generate a JWT (JSON Web Token) from our private key
  ────────────────────────────────────────────────────────────
    │                                │
    │  JWT claims:                   │
    │    iss: APP_ID (our app's ID)  │
    │    iat: now - 60s (clock drift)│
    │    exp: now + 10min (maximum)  │
    │  Signed with: RS256 algorithm  │
    │  Using: our app's private key  │
    │  (stored as env variable)      │
    │                                │
    │                                │
  Step 2: Exchange JWT for installation token
  ────────────────────────────────────────────
    │                                │
    │  POST /app/installations/{installation_id}/access_tokens
    │  Authorization: Bearer <JWT>   │
    │ ──────────────────────────────►│
    │                                │
    │  {                             │
    │    token: "ghs_xxxx...",       │
    │    expires_at: "+1 hour",      │
    │    permissions: {              │
    │      checks: "write",         │
    │      pull_requests: "read",   │
    │      contents: "read"         │
    │    }                           │
    │  }                             │
    │ ◄──────────────────────────────│
    │                                │
    │                                │
  Step 3: Use installation token for API calls
  ──────────────────────────────────────────────
    │                                │
    │  POST /repos/{owner}/{repo}/check-runs
    │  Authorization: Bearer ghs_xxxx...
    │  { name: "Comprehension Check", ... }
    │ ──────────────────────────────►│
    │                                │
    │  201 Created                   │
    │ ◄──────────────────────────────│
```

### Where does the installation_id come from?

The webhook payload includes it:

```json
{
  "action": "opened",
  "installation": {
    "id": 12345678
  },
  "pull_request": { ... },
  "repository": { ... }
}
```

Every webhook from a GitHub App includes `installation.id`. We use it to generate the correct installation token for that customer's org.

### Token lifecycle

| Token | Lifetime | Generated from | Stored? |
|-------|----------|----------------|---------|
| **JWT** | 10 minutes max | App private key + app ID | Generated on demand, not stored |
| **Installation token** | 1 hour | JWT + installation ID | Can be cached until expiry |

### Simplification with Octokit SDK

The `octokit` library (official GitHub SDK) handles the entire JWT → installation token → API call chain:

```typescript
import { App } from "octokit";

const app = new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
  webhooks: { secret: process.env.WEBHOOK_SECRET },
});

// Get an authenticated client for a specific installation
const octokit = await app.getInstallationOctokit(installationId);

// Now make API calls — token generation is automatic
await octokit.rest.checks.create({
  owner: "org-name",
  repo: "repo-name",
  name: "Comprehension Check",
  head_sha: "abc123...",
  status: "in_progress",
  details_url: "https://our-app.com/assessment/xyz",
  output: {
    title: "Comprehension Check",
    summary: "Waiting for 3 participants to complete the assessment.",
  },
});
```

The SDK:
- Generates the JWT from the private key
- Exchanges it for an installation token
- Caches the token and regenerates when it expires
- Handles all auth headers automatically

**Recommendation:** Use the `octokit` SDK. Manual JWT generation adds complexity with no benefit.

---

## Finding 4: Webhook Events We Handle

### Events we must subscribe to

| Event | Action | What triggers it | What we do |
|-------|--------|-----------------|------------|
| `pull_request` | `opened` | PR created (not draft) | Initiate PRCC assessment |
| `pull_request` | `ready_for_review` | Draft PR marked ready | Initiate PRCC assessment |
| `pull_request` | `synchronize` | New commits pushed to PR | Invalidate + regenerate assessment (Story 2.8) |
| `pull_request` | `closed` | PR closed or merged | Clean up: mark assessment as cancelled (if not completed) |
| `pull_request` | `review_requested` | Reviewer added | Add participant to assessment |
| `pull_request` | `review_request_removed` | Reviewer removed | Remove participant from assessment |
| `check_run` | `rerequested` | User clicks "Re-run" on the check in PR UI | Re-trigger assessment (optional — could regenerate or just re-create the check) |
| `installation` | `created` | App installed on an org | Register organisation (Story 1.1) |
| `installation_repositories` | `added` / `removed` | Repos added/removed from app | Register/deregister repos (Story 1.1) |

### Webhook payload structure (pull_request example)

```json
{
  "action": "opened",
  "number": 42,
  "pull_request": {
    "id": 987654321,
    "number": 42,
    "state": "open",
    "draft": false,
    "title": "Add user authentication",
    "body": "This PR implements...",
    "head": {
      "sha": "abc123def456...",
      "ref": "feat/auth"
    },
    "base": {
      "ref": "main"
    },
    "user": {
      "login": "author-username",
      "id": 12345
    },
    "requested_reviewers": [
      { "login": "reviewer1", "id": 67890 },
      { "login": "reviewer2", "id": 11111 }
    ],
    "additions": 150,
    "deletions": 30,
    "changed_files": 8
  },
  "repository": {
    "id": 555555,
    "full_name": "my-org/my-repo",
    "owner": { "login": "my-org" }
  },
  "installation": {
    "id": 12345678
  },
  "sender": {
    "login": "author-username"
  }
}
```

### What we extract from the payload

| Field | Used for |
|-------|----------|
| `installation.id` | Generate installation token for API calls |
| `pull_request.head.sha` | Create Check Run on the correct commit |
| `pull_request.number` | Fetch PR diff and files via API |
| `pull_request.user.login` | Identify the Author participant |
| `pull_request.requested_reviewers` | Identify Reviewer participants |
| `pull_request.additions + deletions` | Quick size check for minimum PR size (Story 2.1) |
| `pull_request.draft` | Skip if draft |
| `repository.full_name` | Look up repo configuration in our DB |
| `repository.owner.login` | Org-level lookup |

### Debouncing synchronize events (Story 2.8)

The `synchronize` event fires on every push. If someone pushes 3 commits in rapid succession, we get 3 events. We need to debounce: wait 60 seconds after the first event before processing. If another `synchronize` arrives within that window, reset the timer.

**Implementation options:**
1. **Queue with delay:** Use a background job queue (e.g., Vercel Cron, or a simple setTimeout with a database-backed check).
2. **Database flag:** On first `synchronize`, store a "pending regeneration" timestamp. Before processing, check if another event arrived since. Process only the latest SHA.

The database flag approach is simpler for V1 and avoids external job queue dependencies.

---

## Finding 5: GitHub App Permissions Manifest

The minimum permissions our GitHub App needs:

| Permission | Level | Why |
|-----------|-------|-----|
| **Checks** | Write | Create and update Check Runs on PRs |
| **Pull requests** | Read | Read PR metadata, diff, changed files |
| **Contents** | Read | Read full file contents for artefact extraction (not just diffs) |
| **Members** | Read | Read organisation membership (for role resolution) |
| **Metadata** | Read | Implicit — all apps get this. Basic repo/org info. |

### Webhook subscriptions

| Event | Required |
|-------|----------|
| Pull request | Yes — core PRCC trigger |
| Check run | Yes — "Re-run" support |
| Installation | Yes — app install/uninstall lifecycle |
| Installation repositories | Yes — repo add/remove lifecycle |

### What we do NOT need

| Permission | Why not |
|-----------|---------|
| **Contents: Write** | We never push code or create files |
| **Issues** | We do not create or read issues (linked issues are fetched via PR description parsing, which uses Contents: Read) |
| **Actions** | We are not a GitHub Action |
| **Administration** | We cannot set branch protection rules (the customer does that) |
| **Statuses: Write** | Story 2.9 (PR metadata export) could use commit statuses — but this is optional and can be added later. Check Runs already provide status visibility. |

---

## Finding 6: Check Runs vs Commit Statuses — For Story 2.9

Story 2.9 requires exporting comprehension score to PR metadata for external systems. Two options:

### Option A: Commit Status API

```
POST /repos/{owner}/{repo}/statuses/{sha}
{
  "state": "success",
  "target_url": "https://our-app.com/assessment/xyz",
  "description": "Comprehension: 82%",
  "context": "fcs/comprehension-score"
}
```

- States: `pending`, `success`, `failure`, `error`
- Simple key-value metadata
- Shows as a separate status line on the commit (distinct from our Check Run)
- External tools can query `GET /repos/{owner}/{repo}/commits/{ref}/statuses` to read it
- Requires **Statuses: Write** permission (not currently in our manifest)

### Option B: Our Check Run already shows the score

The Check Run output summary already contains the aggregate score. External tools can query:
```
GET /repos/{owner}/{repo}/commits/{ref}/check-runs?check_name=Comprehension+Check
```

And parse the score from the `output.summary` field or use `external_id` to cross-reference with our API.

### Recommendation

**Use both, but defer commit status to later.** The Check Run already provides score visibility. Adding a separate commit status with a machine-readable context string (`fcs/comprehension-score`) is useful for external tooling but is not blocking. We can add the Statuses: Write permission later without re-installation (GitHub Apps can update permissions).

---

## Finding 7: Re-run Behaviour

When a user clicks "Re-run" on our check in the PR UI, GitHub sends a `check_run` webhook with action `rerequested`.

| Scenario | What we should do |
|---------|------------------|
| Assessment not started | Re-create the assessment (regenerate questions) |
| Assessment in progress | Questionable — participants may have answered. Safest: ignore the re-run and keep the current assessment. |
| Assessment completed | Re-create (new assessment from current PR state) |
| Assessment skipped | Re-create (admin may have changed their mind) |

**For V1:** On `rerequested`, create a new assessment if the current one is completed or skipped. If in progress, ignore (participants have already started answering).

---

## Finding 8: The `details_url` — Link to Our App

The `details_url` field on the Check Run becomes the **"Details" link** in the PR's checks section. This is how participants reach our assessment answering page.

```
Check Run:
  name: "Comprehension Check"
  details_url: "https://our-app.com/assessment/abc-123-def"
                                                    └── assessment ID
```

When a participant clicks "Details" on the check:
1. They arrive at our web app.
2. If not authenticated, they see "Sign in with GitHub" (Story 5.1).
3. After sign-in, they see their questions (Story 2.4).

The URL must include the assessment ID so we can route to the correct assessment. It does not need to include auth tokens — authentication is handled by our Supabase Auth session.

---

## Implications for Design

### Architecture confirmed

| Decision | Confirmed |
|----------|-----------|
| Check Run is the merge gate mechanism | Yes — with branch protection, it blocks merge on `failure` and allows on `success`/`neutral` |
| `neutral` conclusion for skips and exemptions | Yes — allows merge without false green tick |
| GitHub App installation tokens for API auth | Yes — JWT → installation token → API call. Octokit SDK handles this. |
| Webhook HMAC verification | Yes — `@octokit/webhooks` library handles it |
| Single check name: "Comprehension Check" | Yes — must match branch protection rule name |

### What the customer must configure (one-time per repo)

1. Install our GitHub App on their org.
2. In each repo's branch protection rules, add "Comprehension Check" as a required status check.
3. (Optional) Enable strict mode to require branch to be up to date.

### SDK dependencies

| Package | Purpose |
|---------|---------|
| `octokit` | GitHub API client. Handles JWT generation, installation token management, API calls. |
| `@octokit/webhooks` | Webhook signature verification. Type-safe event handling. |

These are the official GitHub SDK packages. Well-maintained, type-safe, and handle all the authentication complexity.

### Sequence of Check Run API calls per PRCC assessment

1. **Create** — `POST /repos/{o}/{r}/check-runs` with `status: "in_progress"`. Returns `check_run_id`.
2. **Update** (0-N times) — `PATCH /repos/{o}/{r}/check-runs/{id}` to update summary as participants complete.
3. **Complete** — `PATCH /repos/{o}/{r}/check-runs/{id}` with `status: "completed"` and `conclusion: "success" | "failure" | "neutral"`.

Minimum: 2 API calls (create + complete). Typical: 3-5 (create + progress updates + complete).

### Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Customer does not add required status check | Check Run exists but does not block merge — PRCC is advisory only | Setup guide in app; optional setup verification endpoint |
| Installation token expires mid-operation | API call fails with 401 | Octokit SDK auto-regenerates tokens; wrap long operations with retry |
| Webhook delivery failure | Assessment not created for a PR | GitHub retries failed deliveries; add manual "trigger assessment" button in V2 |
| Rate limiting on Check Run updates | Updates fail during high-traffic periods | Batch updates (update once per participant, not per answer); Check Run API limits are generous |
| `synchronize` event flood | Multiple assessments created for rapid pushes | Debounce with database-backed flag (Finding 4) |

---

## Answers to Spike Questions

| Question | Answer |
|----------|--------|
| Does Check Run + branch protection = merge blocked? | **Yes.** `failure` conclusion blocks merge. `neutral` and `success` allow it. Customer must add "Comprehension Check" as a required status check. |
| What is the Check Run lifecycle? | **Create** (`in_progress`) → **Update** (progress) → **Complete** (`success`/`failure`/`neutral`). Only GitHub Apps can create/update. |
| How does the app authenticate? | **Webhooks:** HMAC-SHA256 signature verification. **API calls:** JWT → installation access token (1 hour). Octokit SDK handles both. |
| What permissions are needed? | Checks (write), Pull requests (read), Contents (read), Members (read). |
| Can we update the Check Run summary in real time? | **Yes.** PATCH updates are shown immediately in the PR UI. |

---

## References

- [GitHub Docs: Check Runs API](https://docs.github.com/en/rest/checks/runs)
- [GitHub Docs: Check Suites API](https://docs.github.com/en/rest/checks/suites)
- [GitHub Docs: About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub Docs: About status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)
- [GitHub Docs: Authenticating as a GitHub App installation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)
- [GitHub Docs: Generating a JWT for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app)
- [GitHub Docs: Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [GitHub Docs: Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- [GitHub Docs: Commit Statuses API](https://docs.github.com/en/rest/commits/statuses)
- [GitHub Docs: Permissions required for GitHub Apps](https://docs.github.com/en/rest/overview/permissions-required-for-github-apps)
