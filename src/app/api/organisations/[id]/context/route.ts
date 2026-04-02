// GET/PATCH /api/organisations/[id]/context — org prompt context.
// Design reference: docs/requirements/v1-prompt-changes.md §Change 2

import type { NextRequest } from 'next/server';
import { createApiContext } from '@/lib/api/context';
import { handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { validateBody } from '@/lib/api/validation';
import { OrganisationContextSchema } from '@/lib/engine/prompts';
import { loadContext, upsertContext } from './service';
import type { OrgContextRow } from '@/lib/supabase/org-prompt-context';

// ---------------------------------------------------------------------------
// Contract types — ADR-0014
// ---------------------------------------------------------------------------

/**
 * GET /api/organisations/{id}/context
 *
 * Path parameters:
 *   id  (string, required) — organisation UUID
 *
 * Returns 200 OrgContextRow | 401 | 403
 */

/**
 * PATCH /api/organisations/{id}/context
 *
 * Path parameters:
 *   id  (string, required) — organisation UUID
 *
 * Request body (JSON, all fields optional):
 *   domain_vocabulary  (Array<{ term: string; definition: string }>) — domain terms
 *   focus_areas        (string[], max 5) — areas to emphasise
 *   exclusions         (string[], max 5) — areas to exclude
 *   domain_notes       (string, max 500) — free-text domain context
 *
 * Returns 200 OrgContextResponse | 401 unauthenticated | 403 forbidden | 422 validation
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Response shape when no context row exists yet. */
const EMPTY_CONTEXT_RESPONSE = { context: {} };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: orgId } = await params;
    const ctx = await createApiContext(request);
    const row = await loadContext(ctx, orgId);
    return json(row ?? EMPTY_CONTEXT_RESPONSE);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: orgId } = await params;
    const ctx = await createApiContext(request);
    const body = await validateBody(request, OrganisationContextSchema);
    const row: OrgContextRow = await upsertContext(ctx, orgId, body);
    return json(row);
  } catch (error) {
    return handleApiError(error);
  }
}
