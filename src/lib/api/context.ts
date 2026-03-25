// Per-request composition root — assembles all infrastructure clients from the request.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import type { NextRequest } from 'next/server';
import type { AuthUser } from './auth';
import { requireAuth } from './auth';
import { createReadonlyRouteHandlerClient } from '@/lib/supabase/route-handler-readonly';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';

export interface ApiContext {
  supabase: ReturnType<typeof createReadonlyRouteHandlerClient>;
  adminSupabase: ReturnType<typeof createSecretSupabaseClient>;
  user: AuthUser;
}

/** Per-request composition root. Creates all infrastructure clients from the request.
 *  Throws ApiError(401) if the request is unauthenticated. */
export async function createApiContext(request: NextRequest): Promise<ApiContext> {
  const user = await requireAuth(request);
  const supabase = createReadonlyRouteHandlerClient(request);
  const adminSupabase = createSecretSupabaseClient();
  return { user, supabase, adminSupabase };
}
