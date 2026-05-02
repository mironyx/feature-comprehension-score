// SignOutButton — clears lastVisitedProjectId from localStorage before POSTing sign-out form.
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md § B.1
// Issue: #432

'use client';

import { clearLastVisitedProject } from '@/lib/last-visited-project';

export function SignOutButton() {
  return (
    <form
      method="POST"
      action="/auth/sign-out"
      onSubmit={() => clearLastVisitedProject()}
    >
      <button type="submit" className="text-label text-text-secondary hover:text-accent">
        Sign out
      </button>
    </form>
  );
}
