// Org selection cookie helpers.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.3

import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import type { NextResponse } from 'next/server';

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
