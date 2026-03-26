// Org selection cookie helpers.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.3

import type { cookies as nextCookies } from 'next/headers';
import type { NextResponse } from 'next/server';

// Derive the cookie-store type from the public next/headers API rather than
// importing from an internal next/dist path, which is not a stable contract.
type ReadonlyRequestCookies = Awaited<ReturnType<typeof nextCookies>>;

const COOKIE_NAME = 'fcs-org-id';

/** Returns the currently selected org ID from cookies, or null if none is set. */
export function getSelectedOrgId(cookies: ReadonlyRequestCookies): string | null {
  return cookies.get(COOKIE_NAME)?.value ?? null;
}

/** Sets the selected org ID cookie on a NextResponse. */
export function setSelectedOrgId(response: NextResponse, orgId: string): void {
  response.cookies.set(COOKIE_NAME, orgId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  });
}
