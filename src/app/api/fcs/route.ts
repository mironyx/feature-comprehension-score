// POST /api/fcs — create an FCS assessment.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4 POST /api/fcs

import type { NextRequest } from 'next/server';
import { createApiContext } from '@/lib/api/context';
import { handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { validateBody } from '@/lib/api/validation';
import { createFcs, FcsCreateBodySchema } from './service';
export type { CreateFcsResponse } from './service';

// ---------------------------------------------------------------------------
// Contract types — request body and response shape. Convention: ADR-0014.
// ---------------------------------------------------------------------------

/**
 * POST /api/fcs
 *
 * Request body:
 *   { org_id, repository_id, feature_name, feature_description?, merged_pr_numbers, participants }
 *
 * Returns 201 CreateFcsResponse | 401 unauthenticated | 403 not Org Admin |
 *         422 invalid body / unmerged PR / unknown participant username
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await createApiContext(request);
    const body = await validateBody(request, FcsCreateBodySchema);
    return json(await createFcs(ctx, body), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
