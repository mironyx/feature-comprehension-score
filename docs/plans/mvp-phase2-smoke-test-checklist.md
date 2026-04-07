# MVP Phase 2 — Manual Smoke Test Checklist

**Purpose:** Step-by-step checklist for a human to verify the full FCS cycle end-to-end.

**When to run:** After deploying MVP Phase 2 changes, or any time the demo flow needs
manual validation.

---

## Pre-requisites

Before starting, ensure the following are in place:

- [ ] Supabase cloud project is reachable and has the latest migrations applied (`npx supabase db push --linked`)
- [ ] Environment variables are configured (`.env.local` with Supabase URL, keys, GitHub App credentials including `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`)
- [ ] Application is running (`npm run dev` locally on `http://localhost:3000` or deployed to Cloud Run)
- [ ] **For local testing:** ngrok tunnel is running and pointed at the local app — see [Local Testing Setup](#local-testing-setup) below
- [ ] GitHub App is installed on the test organisation (see [Test Organisation Setup](#test-organisation-setup) below)
- [ ] At least two GitHub user accounts are available (one admin, one participant)
- [ ] The test repository has at least one merged PR with meaningful code changes

---

## Local Testing Setup

GitHub webhooks (for `installation`, `installation_repositories`, etc.) cannot reach
`localhost`, so a public tunnel is required when running the app locally.

1. **Confirm Supabase cloud connectivity** — `.env.local` should point at the cloud
   project (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`). No local Supabase container is needed.

2. **Start the app locally:**

   ```bash
   npm run dev
   ```

   Confirm it is reachable at `http://localhost:3000`.

3. **Start an ngrok tunnel** in a separate terminal:

   ```bash
   ngrok http 3000
   ```

   Copy the HTTPS forwarding URL (e.g. `https://abcd-1234.ngrok-free.app`). This URL
   changes every time ngrok restarts unless you have a reserved domain.

4. **Update the GitHub App settings** at
   `https://github.com/settings/apps/feature-comprehension-score-dev`:
   - **Homepage URL:** `<ngrok-url>`
   - **Callback URL:** `<ngrok-url>/auth/callback`
   - **Webhook URL:** `<ngrok-url>/api/webhooks/github`
   - Save changes.

5. **Update `.env.local`** so OAuth redirects resolve correctly:

   ```env
   NEXT_PUBLIC_SITE_URL=<ngrok-url>
   ```

   Restart `npm run dev` after editing `.env.local`.

6. **Verify the tunnel** by visiting `<ngrok-url>` in your browser — you should see the
   app's sign-in page.

> **Tip:** keep the ngrok web inspector open at `http://127.0.0.1:4040` to watch
> incoming webhook deliveries in real time.

---

## Test Organisation Setup

For realistic multi-participant testing, create a dedicated GitHub organisation:

1. **Create a GitHub organisation** — use a name like `fcs-smoke-test` or similar.
2. **Install the FCS GitHub App** on this organisation.
   - The app is not listed in the Marketplace (still in development). Visit its public
     install URL directly:
     <https://github.com/apps/feature-comprehension-score-dev/installations/new>
   - If only your personal account appears, open the app settings and set
     **"Where can this GitHub App be installed?"** to **"Any account"**, then retry.
   - Select the test organisation and grant access to all repositories (or specific ones).
   - **Local testing:** make sure the ngrok tunnel from [Local Testing Setup](#local-testing-setup)
     is running *before* clicking Install, so the `installation` webhook reaches your
     local app.
3. **Add members** — invite at least one other GitHub user as a member.
   Each member needs their own GitHub account to test the participant flow.
4. **Create a test repository** with real code:
   - The repository should have at least one merged PR with non-trivial changes
     (a feature implementation, not just a README edit).
   - Multiple merged PRs from different contributors are ideal for testing
     multi-participant scenarios.
5. **Verify the webhook fires** — after installing the App, check the GitHub App's
   "Advanced" tab for recent deliveries. You should see `installation` events with
   a `200` response from the FCS webhook endpoint.

---

## 1. Sign In

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1.1 | Navigate to the application root URL | Redirects to `/auth/sign-in` |
| 1.2 | Click "Sign in with GitHub" | Redirects to GitHub OAuth consent screen |
| 1.3 | Authorise the application on GitHub | Redirects back to the app |
| 1.4 | Observe the landing page | Redirected to `/assessments` (assessments list) |

**Multi-org users only:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1.5 | If the user belongs to multiple orgs, observe the org selection page | `/org-select` page displays all organisations |
| 1.6 | Select the test organisation | Redirected to `/assessments` with the selected org active |

---

## 2. Create Assessment (Admin Only)

Pre-condition: signed-in user is an admin of the selected organisation.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.1 | Click "New Assessment" link on the assessments page | Navigates to `/assessments/new` |
| 2.2 | Enter a feature name (e.g. "User Authentication") | Field accepts text input |
| 2.3 | Optionally enter a feature description | Field accepts text input |
| 2.4 | Select the test repository from the dropdown | Repository list shows repos the GitHub App can access |
| 2.5 | Enter merged PR number(s) (comma-separated, e.g. "1, 2") | Field accepts numeric input |
| 2.6 | Enter participant GitHub usernames (comma-separated, including the admin's own username for self-assessment) | Field accepts text input |
| 2.7 | Click "Create Assessment" | Form submits successfully |
| 2.8 | Observe the redirect | Redirected to `/assessments?created=true` |

---

## 3. Verify Assessment Creation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.1 | On the assessments list page, observe success feedback | Success message is visible (e.g. "Assessment created") |
| 3.2 | Find the newly created assessment in the list | Assessment appears with status **"Generating..."** (`rubric_generation`) |
| 3.3 | Wait 30-60 seconds and refresh the page | Status transitions to **"Ready"** (`awaiting_responses`) |
| 3.4 | If status shows **"Failed"** (`rubric_failed`), check server logs | Look for LLM errors — see [Troubleshooting](#troubleshooting) |

**Note:** The `rubric_generation` → `awaiting_responses` transition happens asynchronously.
The LLM generates questions based on the PR diffs. Typical generation time is 15-60 seconds
depending on diff size and LLM provider latency.

---

## 4. Answer Questions (As Participant)

Pre-condition: assessment status is "Ready" (`awaiting_responses`).

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.1 | Sign in as a participant user (or use the admin account if self-included) | Redirected to `/assessments` |
| 4.2 | Find the assessment in the list | Assessment is visible to participants |
| 4.3 | Click on the assessment | Navigates to `/assessments/{id}` — the answering page |
| 4.4 | Verify questions are displayed | Questions grouped by Naur layer (program-to-world, world-to-program, program-internal) |
| 4.5 | Answer each question with a substantive response | Text areas accept input; each question has a text field |
| 4.6 | Click "Submit Answers" | Answers are submitted |
| 4.7 | Observe the redirect | Redirected to `/assessments/{id}/submitted` — confirmation page |
| 4.8 | Attempt to navigate back to `/assessments/{id}` | Shows "Already Submitted" message (cannot re-submit) |

**Repeat steps 4.1-4.7 for each participant account** to complete the assessment.

---

## 5. View Scores

Pre-condition: all participants have submitted their answers.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.1 | Navigate to `/assessments/{id}/results` | Results page loads |
| 5.2 | Verify aggregate comprehension score is displayed | A numeric score is visible |
| 5.3 | Verify per-question scores are shown | Each question shows its individual score |
| 5.4 | Verify scores are grouped by Naur layer | Questions are organised under layer headings |
| 5.5 | Verify reference answers are revealed | Reference answers are shown alongside participant answers (only after all participants have submitted and scoring is complete) |

---

## 6. Sign Out

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.1 | Click "Sign Out" | Redirected to `/auth/sign-in` |
| 6.2 | Attempt to navigate to `/assessments` directly | Redirected back to `/auth/sign-in` (session cleared) |
| 6.3 | Check browser developer tools → Application → Cookies | Supabase auth cookies are cleared |

---

## 7. Error Paths

What to check when something fails at each step:

### Sign-in fails

- **"Missing authorisation code" error** — the OAuth callback did not receive a `code`
  parameter. Check that the GitHub App's callback URL matches the application URL
  (e.g. `http://localhost:3000/auth/callback` for local development).
- **"Could not exchange code for session" error** — Supabase could not exchange the
  OAuth code. Check Supabase Auth configuration: GitHub provider must be enabled with
  the correct Client ID and Client Secret from the GitHub App.

### Organisation not visible after sign-in

- The GitHub App webhook may not have fired or may have failed. Check:
  1. GitHub App → Advanced → Recent Deliveries for `installation` events.
  2. Server logs for webhook processing errors.
  3. `organisations` and `user_organisations` tables in Supabase for the expected rows.

### "New Assessment" button not visible

- The signed-in user is not an admin of the selected organisation. Check the
  `user_organisations` table: the user's `github_role` must be `admin`.

### Assessment stuck in "Generating..."

- The LLM call may have failed silently or timed out. Check:
  1. Server logs for errors from the assessment engine or LLM gateway.
  2. `assessments` table: if `status` is still `rubric_generation`, the generation
     process may have crashed.
  3. OpenRouter API key validity and rate limits.
  4. If the assessment transitions to `generation_failed` or `rubric_failed`, use the
     admin retry button (if available) or check logs for the specific error.

### Assessment shows "Failed"

- Check server logs for the LLM error. Common causes:
  - Invalid or expired OpenRouter API key.
  - PR diffs too large for the model's context window.
  - Rate limiting from the LLM provider.
- If a retry button is available on the assessments list page, click it to re-trigger
  rubric generation.

### Questions not displaying

- Assessment may not be in `awaiting_responses` status yet. Refresh and wait.
- The participant may not be linked to the assessment. Check `assessment_participants`
  table for a row matching the user's ID and the assessment ID.

### Scores not displaying

- Not all participants may have submitted answers. Check `assessment_participants` table
  for any rows with `status = 'pending'`.
- Scoring may still be in progress. Check the `assessments` table `status` field — it
  should be `completed`.

### Sign-out does not clear session

- Check that the sign-out route (`/auth/sign-out`) is a POST request (not GET).
  The sign-out button should submit a form, not follow a link.

---

## Troubleshooting

### Checking server logs

- **Local development:** logs appear in the terminal running `npm run dev`.
- **Cloud Run:** use `gcloud logging read` or the GCP Console Logs Explorer.
  Filter by the service name and look for structured JSON log entries.

### Checking the database

Connect to Supabase and inspect key tables:

```sql
-- Check assessment status
SELECT id, feature_name, status, created_at
FROM assessments
ORDER BY created_at DESC
LIMIT 5;

-- Check participant linkage
SELECT ap.id, ap.user_id, ap.github_username, ap.status
FROM assessment_participants ap
WHERE ap.assessment_id = '<assessment-id>';

-- Check generated questions
SELECT id, question_number, naur_layer, question_text
FROM assessment_questions
WHERE assessment_id = '<assessment-id>'
ORDER BY question_number;

-- Check org membership
SELECT uo.user_id, uo.github_role, o.github_org_name
FROM user_organisations uo
JOIN organisations o ON o.id = uo.org_id;
```

### Resetting test data

To start fresh without re-deploying:

```sql
-- Delete all assessments and cascaded data (questions, participants, answers)
DELETE FROM assessments WHERE org_id = '<test-org-id>';
```

Or locally, reset the entire database:

```bash
npx supabase db reset
```

**Note:** after `supabase db reset`, Kong may lose port forwarding. If API calls fail
with `fetch failed`, run:

```bash
docker restart supabase_kong_feature-comprehension-score
```
