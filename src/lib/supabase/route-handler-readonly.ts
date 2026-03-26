// Read-only Supabase route handler client — for auth checks that do not set cookies.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { supabaseUrl, supabasePublishableKey } from './env';
import type { Database } from './types';

/** Creates a Supabase client that reads request cookies but never writes them back. */
export function createReadonlyRouteHandlerClient(request: NextRequest) {
  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // Intentionally a no-op: this client is read-only.
        // Session refresh cookie writes are handled by middleware.
      },
    },
  });
}
