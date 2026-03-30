// Auth extraction and enforcement helpers for API route handlers.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import type { NextRequest } from 'next/server';
import { createReadonlyRouteHandlerClient } from '@/lib/supabase/route-handler-readonly';
import { ApiError } from './errors';
import { logger } from '@/lib/logger';

export interface AuthUser {
  id: string;
  email: string;
  githubUserId: number;
  githubUsername: string;
}

/** Extract authenticated user from Supabase session. Returns null if unauthenticated. */
export async function extractUser(request: NextRequest): Promise<AuthUser | null> {
  const supabase = createReadonlyRouteHandlerClient(request);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    logger.error({ err: error }, 'extractUser: Supabase auth.getUser() failed');
    throw new ApiError(500, 'Internal server error');
  }

  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? '',
    githubUserId: Number(user.user_metadata['provider_id']),
    githubUsername: String(user.user_metadata['user_name']),
  };
}

/** Require authentication. Throws ApiError(401) if not authenticated. */
export async function requireAuth(request: NextRequest): Promise<AuthUser> {
  const user = await extractUser(request);
  if (!user) {
    throw new ApiError(401, 'Unauthenticated');
  }
  return user;
}

/** Require Org Admin role. Throws ApiError(403) if not admin. */
export async function requireOrgAdmin(request: NextRequest, orgId: string): Promise<AuthUser> {
  const user = await requireAuth(request);
  const supabase = createReadonlyRouteHandlerClient(request);

  const { data, error: queryError } = await supabase
    .from('user_organisations')
    .select('github_role')
    .eq('user_id', user.id)
    .eq('org_id', orgId);

  if (queryError) {
    logger.error({ err: queryError }, 'requireOrgAdmin: DB query failed');
    throw new ApiError(500, 'Internal server error');
  }

  if (!data || data.length === 0 || data[0]?.github_role !== 'admin') {
    throw new ApiError(403, 'Forbidden');
  }

  return user;
}
