// GET /api/organisations/[id]/repositories — list registered + GitHub-accessible repos.
// Design reference: docs/design/lld-v8-repository-management.md §T1
// Issue: #365

import type { NextRequest } from 'next/server';
import { createApiContext } from '@/lib/api/context';
import { handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { listRepositories } from './service';

// ---------------------------------------------------------------------------
// Contract types — ADR-0014
// ---------------------------------------------------------------------------

/**
 * GET /api/organisations/{id}/repositories
 *
 * Path parameters:
 *   id  (string, required) — organisation UUID
 *
 * Returns 200 RepositoryListResponse | 401 unauthenticated | 403 forbidden
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: orgId } = await params;
    const ctx = await createApiContext(request);
    return json(await listRepositories(ctx, orgId));
  } catch (error) {
    return handleApiError(error);
  }
}
