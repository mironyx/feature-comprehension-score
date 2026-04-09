// Non-member empty state for /org-select.
// Shown when a signed-in user has zero organisation memberships.
// Copy is verbatim from requirements doc §O.3.
// Design reference: docs/design/lld-onboarding-auth-empty-state.md §3.1

const DEFAULT_INSTALL_URL = 'https://github.com/apps/fcs-app/installations/new';

export function NonMemberEmptyState() {
  // Use || so an empty-string env var also falls back to the default.
  const installUrl =
    process.env['NEXT_PUBLIC_GITHUB_APP_INSTALL_URL'] || DEFAULT_INSTALL_URL;
  return (
    <main>
      <h1>No access</h1>
      <p>
        You do not have access to any organisation using FCS. Ask your admin to
        install the app or add you to an org where it is installed.
      </p>
      <p>
        <a href={installUrl}>Install the GitHub App</a>
      </p>
      <form action="/auth/sign-out" method="post">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
