# Runbook — `GITHUB_APP_PRIVATE_KEY`

Provisioning, rotation, and incident response for the GitHub App private key used by
the Feature Comprehension Score service.

**Authoritative design:** [docs/design/github-auth-hld.md §6](../design/github-auth-hld.md#6-private-key-lifecycle).
This runbook is the operational counterpart — it does not redefine policy, it tells
you which buttons to press.

## Blast radius (read this first)

The GitHub App private key is the **root of trust for every server-to-server GitHub
call** made by FCS. If it leaks:

- An attacker can mint App JWTs and installation tokens for **every** installation of
  the App until the key is revoked.
- They can read pull requests, repository contents, and issues on every customer
  repository the App is installed on, and (once PRCC is enabled) write Check Runs.
- They **cannot** push code, change repository settings, or read anything the App was
  not granted in its permissions manifest.
- Installation tokens minted before revocation remain valid at GitHub until their
  1 h TTL expires — there is no way for us to invalidate them short of uninstalling
  the App on every customer.

**On-call summary:** treat a suspected leak the same as a production credential leak.
Revoke in the GitHub App settings UI *first*, rotate in Secret Manager *second*,
investigate *third*. See [Incident response](#incident-response).

## Storage tiers

| Environment | Storage | Secret name |
| --- | --- | --- |
| Local dev | `.env.local` (gitignored) | `GITHUB_APP_PRIVATE_KEY` |
| CI (our GitHub Actions) | Repository Actions secret in `mironyx/feature-comprehension-score` | `GITHUB_APP_PRIVATE_KEY` |
| Production (Cloud Run) | Google Secret Manager, mounted as env var on the revision | `fcs-github-app-private-key` |

The key is always the same PEM, encoded as a single line with `\n` literal-escaped
newlines so it fits inside an env var.

Every tier also needs `GITHUB_APP_ID` alongside the key.

## Dev setup

Each developer uses a **separate dev-only GitHub App** (e.g. `FCS (dev)`) pointed at
`http://localhost:3000`. The production App's key never leaves Secret Manager.

1. In GitHub, go to **Settings → Developer settings → GitHub Apps** and open your
   dev App (create one if needed, following the manifest in
   [docs/design/github-auth-hld.md §6.2](../design/github-auth-hld.md#62-provisioning)).
2. Under **Private keys**, click **Generate a private key**. GitHub downloads a
   `.pem` file **once** — if you lose it, you must generate another.
3. Convert the PEM to a single-line env-var value:

    ```bash
    awk 'NF {sub(/\r/, ""); printf "%s\\n", $0}' ~/Downloads/fcs-dev.<date>.private-key.pem
    ```

    Copy the output (it ends with `\n` after `-----END RSA PRIVATE KEY-----`).

4. Add to `.env.local`:

    ```bash
    GITHUB_APP_ID=<numeric app id from the App settings page>
    GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n"
    ```

    The value **must** be double-quoted so the shell preserves the `\n` sequences;
    `src/lib/github/app-auth.ts` unescapes them at load.

5. Shred the downloaded `.pem`:

    ```bash
    shred -u ~/Downloads/fcs-dev.<date>.private-key.pem
    ```

6. Verify: `npx vitest run src/lib/github/app-auth.test.ts` — the unit tests will
   refuse to run with a malformed key.

## CI setup

Only the `mironyx/feature-comprehension-score` repository needs this secret. Forks
and PR workflows from forks do not receive it — this is deliberate.

1. Obtain the production App's PEM (or a CI-specific key, see §6.2 of the HLD).
2. Convert to single-line form (see dev setup step 3).
3. Set the secret:

    ```bash
    gh secret set GITHUB_APP_PRIVATE_KEY \
      --repo mironyx/feature-comprehension-score \
      --body "$(awk 'NF {sub(/\r/, ""); printf "%s\\n", $0}' /path/to/key.pem)"
    gh secret set GITHUB_APP_ID \
      --repo mironyx/feature-comprehension-score \
      --body "<numeric app id>"
    ```

4. Reference in the workflow `env:` block:

    ```yaml
    env:
      GITHUB_APP_ID: ${{ secrets.GITHUB_APP_ID }}
      GITHUB_APP_PRIVATE_KEY: ${{ secrets.GITHUB_APP_PRIVATE_KEY }}
    ```

5. Shred the local copy of the PEM immediately.

## Production setup (Cloud Run + Google Secret Manager)

1. Create the secret (one-off):

    ```bash
    gcloud secrets create fcs-github-app-private-key \
      --replication-policy=automatic \
      --project=<gcp-project-id>
    ```

2. Add the first version from the PEM:

    ```bash
    awk 'NF {sub(/\r/, ""); printf "%s\\n", $0}' /path/to/key.pem \
      | gcloud secrets versions add fcs-github-app-private-key \
          --data-file=- \
          --project=<gcp-project-id>
    ```

3. Grant the Cloud Run service account read access:

    ```bash
    gcloud secrets add-iam-policy-binding fcs-github-app-private-key \
      --member=serviceAccount:<cloud-run-sa>@<gcp-project-id>.iam.gserviceaccount.com \
      --role=roles/secretmanager.secretAccessor \
      --project=<gcp-project-id>
    ```

4. Mount the secret as an env var on the Cloud Run service:

    ```bash
    gcloud run services update feature-comprehension-score \
      --update-secrets=GITHUB_APP_PRIVATE_KEY=fcs-github-app-private-key:latest \
      --set-env-vars=GITHUB_APP_ID=<numeric app id> \
      --region=<region> \
      --project=<gcp-project-id>
    ```

5. Shred the local PEM.
6. Verify from the running service: trigger one webhook, confirm
   `POST /app/installations/*/access_tokens` succeeds in the logs.

## Rotation

Routine cadence: **every 90 days**, or immediately on any suspicion of compromise.

GitHub supports multiple active private keys per App simultaneously — this is the
mechanism that makes zero-downtime rotation possible. Always add the new key before
deleting the old one.

1. **Generate the new key.** In the GitHub App settings, under **Private keys**, click
   **Generate a private key**. Download the PEM. Do not delete the old key yet.
2. **Stage the new key in storage tiers that need it**, in this order:
    1. Google Secret Manager — add a new *version* of `fcs-github-app-private-key`:

        ```bash
        awk 'NF {sub(/\r/, ""); printf "%s\\n", $0}' /path/to/new-key.pem \
          | gcloud secrets versions add fcs-github-app-private-key --data-file=-
        ```

    2. CI — `gh secret set GITHUB_APP_PRIVATE_KEY ...` (overwrites in place; CI does
       not support versioning, so this is the commit point for CI).
3. **Roll out the new Cloud Run revision** so it picks up the new secret version:

    ```bash
    gcloud run services update feature-comprehension-score \
      --update-secrets=GITHUB_APP_PRIVATE_KEY=fcs-github-app-private-key:latest \
      --region=<region>
    ```

4. **Verify** on the new revision:
    - Trigger at least one webhook per critical path (`installation.created`,
      `pull_request.opened`).
    - Confirm `POST /app/installations/*/access_tokens` logs success with the new
      key in use.
    - Watch for a spike in `github_installation_token_mints_total{outcome="failed"}`
      for 10 min (see [§6.4 of the HLD](../design/github-auth-hld.md#64-revocation-emergency)).
5. **Delete the old key in the GitHub App settings UI.** This is the commit point —
   once deleted, any process still holding only the old PEM will start failing at
   the App JWT stage.
6. **Disable the old Secret Manager version** (retain for audit, do not destroy):

    ```bash
    gcloud secrets versions disable <old-version-number> \
      --secret=fcs-github-app-private-key
    ```

7. Shred local copies of both PEMs and file a one-line note in the next session log.

## Incident response

Triggers: key suspected leaked, developer laptop lost, Secret Manager audit log shows
unexpected access, a rogue workflow exfiltrates the CI secret, a security researcher
reports it to us.

1. **Revoke immediately.** In the GitHub App settings UI, delete the compromised
   private key. This invalidates every App JWT signed with it within seconds.
   Installation tokens minted *before* revocation remain valid at GitHub for up to
   1 h — this tail is unavoidable without forcing customers to reinstall the App.
2. **Generate and deploy a replacement key** following [Rotation](#rotation) steps
   1–4. Skip the "delete the old key" step — it is already deleted.
3. **Audit access logs for the compromise window:**
    - Google Secret Manager — `gcloud logging read 'resource.type="secretmanager.googleapis.com/Secret" AND resource.labels.secret_id="fcs-github-app-private-key"' --project=<gcp-project-id>`.
      Look for `AccessSecretVersion` calls from identities that are not the Cloud Run
      service account.
    - GitHub App audit log — in the App settings UI, **Advanced → Recent deliveries**
      and the **Audit log** for the owning account. Look for API calls we did not
      originate.
    - Cloud Run request logs — correlate unusual installation-token mint spikes
      with known traffic patterns.
4. **Assess customer exposure.** Which installations had tokens minted during the
   compromise window? What endpoints were called? Document in the incident report.
5. **File an incident report** at `docs/reports/YYYY-MM-DD-github-key-incident.md`
   with timeline, blast radius, and remediation. If the rotation procedure itself
   needs to change as a result, open an ADR.
6. **Notify affected customers** if exposure is confirmed, per the security policy.

## Related documents

- [docs/design/github-auth-hld.md §6 — Private-Key Lifecycle](../design/github-auth-hld.md#6-private-key-lifecycle)
- [ADR-0020 — Org membership via installation token](../adr/0020-org-membership-via-installation-token.md)
- `.env.example` — env var reference
