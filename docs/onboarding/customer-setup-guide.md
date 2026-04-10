# Customer setup guide

This guide walks a new customer through installing and configuring the
Feature Comprehension Score (FCS) GitHub App for their organisation —
from first install to running your first assessment.

## Prerequisites

- A GitHub organisation where you have **owner** or **admin** permissions.
- At least one repository with merged pull requests that you want to assess.

## Step 1: Install the GitHub App

1. Visit the FCS GitHub App install page:
   <https://github.com/apps/fcs-app/installations/new>
2. Select the organisation you want to enable FCS for.
3. Choose which repositories to grant access to — either **All repositories**
   or select specific ones. FCS only reads from repositories you grant.
4. Review the permissions (listed below) and click **Install**.

Once installed, GitHub creates a webhook link between your organisation
and FCS. No further admin configuration is required — team members can
sign in immediately.

### Required GitHub App permissions

When you install the FCS GitHub App on your organisation, GitHub will ask
you to approve the permissions below. FCS requests the minimum set needed
to assess pull requests and verify that users signing in actually belong
to your organisation.

| Permission    | Scope        | Why we need it                                                                     |
| ------------- | ------------ | ---------------------------------------------------------------------------------- |
| Contents      | Read-only    | Read PR source files for artefact extraction (see ADR-0001, ADR-0011).             |
| Pull requests | Read-only    | Enumerate pull requests and read their diffs, comments, and reviews.               |
| Checks        | Read & write | Post FCS and PRCC Check Runs back onto your pull requests (see ADR-0006).          |
| Metadata      | Read-only    | Mandatory for all GitHub Apps; GitHub requires this for any App installation.       |
| Members       | Read-only    | Verify that users signing in to FCS are members of your organisation (ADR-0020).   |

FCS does **not** request write access to repository contents, issues, or
pull request bodies. The only write scope is `Checks: write`, used solely
to publish Check Run results.

### Re-consent on permission changes

If FCS adds a new permission in the future, GitHub will email your
organisation owners asking them to approve the updated permission set.
Until an owner accepts, the installation keeps working on the previous
permission set, and any FCS feature that depends on the new permission
will be unavailable for your org. Owners can review and accept pending
requests from **Settings > GitHub Apps > Feature Comprehension Score >
Review request**.

## Step 2: Sign in

1. Navigate to the FCS application in your browser.
2. Click **Sign in with GitHub**.
3. GitHub will ask you to authorise the FCS OAuth app. The consent screen
   requests only `read:user` — FCS does not need access to your
   repositories or organisation list via OAuth because the installed
   GitHub App handles that.
4. After authorising, you are redirected back to FCS.
5. If your GitHub account belongs to **one** organisation with FCS
   installed, you land directly on the assessments dashboard.
6. If you belong to **multiple** organisations with FCS installed,
   you are taken to the organisation picker (`/org-select`) — choose
   the org you want to work in.

### What if I see "No access"?

If you land on a page saying "You do not have access to any organisation
using FCS", it means none of the organisations you belong to on GitHub
have the FCS App installed. Either:

- Ask an admin of your organisation to install the App (Step 1 above), or
- Confirm that you are a member of the GitHub organisation where the App
  is installed — FCS checks membership directly via GitHub.

You can sign out and try again after the issue is resolved.

## Step 3: Add team members

FCS uses your GitHub organisation membership as the source of truth —
there is no separate user management inside FCS.

**To add a team member:**

1. Ensure they are a member of your GitHub organisation. You can check
   this at `https://github.com/orgs/<your-org>/people`.
2. Share the FCS URL with them. They sign in with GitHub (Step 2 above)
   and FCS automatically verifies their org membership.

**To remove access:**

Remove the user from your GitHub organisation. FCS re-checks membership
on every sign-in, so a removed user will lose access on their next login.

> **Note:** There is no real-time session revocation in V1. A removed
> user retains access until their current session ends or they sign in
> again.

### Roles

- **Admin** — GitHub organisation owners and members with the `admin`
  role can create and manage assessments.
- **Member** — All other organisation members can participate in
  assessments (answer questions, view results) but cannot create them.

## Step 4: Run your first assessment

1. From the assessments dashboard (`/assessments`), click **New Assessment**.
   (Only admins see this option.)
2. Fill in the form:
   - **Feature name** — a short label for the feature you are assessing
     (e.g. "User authentication rewrite").
   - **Feature description** (optional) — additional context about the
     feature.
   - **Repository** — select the repository containing the pull requests.
   - **Merged PR numbers** — comma-separated list of PR numbers that make
     up the feature (e.g. `42, 43, 44`).
   - **Participant GitHub usernames** — comma-separated list of team
     members who will answer the assessment (e.g. `alice, bob`).
3. Click **Create Assessment**.
4. FCS extracts artefacts from the listed pull requests and generates
   comprehension questions based on what was built.
5. Share the assessment link with the listed participants. Each
   participant answers the questions from their own perspective.
6. Once all participants have submitted, view the results page for the
   aggregated Feature Comprehension Score and per-question breakdown.

## Troubleshooting

| Problem                                    | Solution                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| "No access" after sign-in                  | Confirm the FCS App is installed on your org and that you are a member. See [Step 2](#what-if-i-see-no-access).  |
| Cannot see "New Assessment" button          | Only admins can create assessments. Check your role in the GitHub organisation.                                   |
| Sign-in fails with an error                | Try signing out and in again. If the problem persists, ask your admin to check the App installation status.      |
| Permission change pending                  | An org owner must accept the new permissions. See [Re-consent on permission changes](#re-consent-on-permission-changes). |
