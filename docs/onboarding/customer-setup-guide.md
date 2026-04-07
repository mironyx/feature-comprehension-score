# Customer setup guide

This guide walks a new customer through installing and configuring the Feature Comprehension Score (FCS) GitHub App for their organisation.

> **Status:** stub. Only the "Required GitHub App permissions" section is authoritative at this stage. The surrounding install → sign-in → first-assessment walkthrough will be added in a later task (see epic #176, Task 7).

## Required GitHub App permissions

When you install the FCS GitHub App on your organisation, GitHub will ask you to approve the permissions below. FCS requests the minimum set needed to assess pull requests and verify that users signing in actually belong to your organisation.

| Permission      | Scope         | Why we need it                                                                       |
| --------------- | ------------- | ------------------------------------------------------------------------------------ |
| Contents        | Read-only     | Read PR source files for artefact extraction (see ADR-0001, ADR-0011).               |
| Pull requests   | Read-only     | Enumerate pull requests and read their diffs, comments, and reviews.                 |
| Checks          | Read & write  | Post FCS and PRCC Check Runs back onto your pull requests (see ADR-0006).            |
| Metadata        | Read-only     | Mandatory for all GitHub Apps; GitHub requires this for any App installation.        |
| Members         | Read-only     | Verify that users signing in to FCS are members of your organisation (see ADR-0020). |

FCS does **not** request write access to repository contents, issues, or pull request bodies. The only write scope is `Checks: write`, used solely to publish Check Run results.

### Re-consent on permission changes

If FCS adds a new permission in the future, GitHub will email your organisation owners asking them to approve the updated permission set. Until an owner accepts, the installation keeps working on the previous permission set, and any FCS feature that depends on the new permission will be unavailable for your org. Owners can review and accept pending requests from **Settings → GitHub Apps → Feature Comprehension Score → Review request**.
