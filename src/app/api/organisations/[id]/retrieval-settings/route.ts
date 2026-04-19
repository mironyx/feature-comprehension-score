// GET/PATCH /api/organisations/[id]/retrieval-settings — org_config retrieval fields.
// Design reference: docs/design/lld-v2-e17-agentic-retrieval.md §17.2a
// Issue: #251

import type { NextRequest } from 'next/server';
import { createApiContext } from '@/lib/api/context';
import { handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { validateBody } from '@/lib/api/validation';
import {
  RetrievalSettingsSchema,
  loadRetrievalSettings,
  updateRetrievalSettings,
} from './service';

// ---------------------------------------------------------------------------
// Contract types — ADR-0014
// ---------------------------------------------------------------------------

/**
 * GET /api/organisations/{id}/retrieval-settings
 *
 * Path parameters:
 *   id  (string, required) — organisation UUID
 *
 * Returns 200 RetrievalSettings | 401 | 403
 */

/**
 * PATCH /api/organisations/{id}/retrieval-settings
 *
 * Path parameters:
 *   id  (string, required) — organisation UUID
 *
 * Request body (JSON, all fields required):
 *   tool_use_enabled          (boolean)
 *   rubric_cost_cap_cents     (integer, 0..500)
 *   retrieval_timeout_seconds (integer, 10..600)
 *
 * Returns 200 RetrievalSettings | 401 | 403 | 422
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: orgId } = await params;
    const ctx = await createApiContext(request);
    const settings = await loadRetrievalSettings(ctx, orgId);
    return json(settings);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: orgId } = await params;
    const ctx = await createApiContext(request);
    const body = await validateBody(request, RetrievalSettingsSchema);
    const settings = await updateRetrievalSettings(ctx, orgId, body);
    return json(settings);
  } catch (error) {
    return handleApiError(error);
  }
}
