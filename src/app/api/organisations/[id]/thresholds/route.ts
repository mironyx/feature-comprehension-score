// GET/PATCH /api/organisations/[id]/thresholds — artefact-quality + FCS thresholds.
// Design reference: docs/requirements/v2-requirements.md §Epic 11 Story 11.2
// Issue: #237

import type { NextRequest } from 'next/server';
import { createApiContext } from '@/lib/api/context';
import { handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { validateBody } from '@/lib/api/validation';
import { OrgThresholdsSchema } from '@/lib/engine/org-thresholds';
import { loadThresholds, updateThresholds } from './service';

// ---------------------------------------------------------------------------
// Contract types — ADR-0014
// ---------------------------------------------------------------------------

/**
 * GET /api/organisations/{id}/thresholds
 *
 * Path parameters:
 *   id  (string, required) — organisation UUID
 *
 * Returns 200 OrgThresholds | 401 | 403
 */

/**
 * PATCH /api/organisations/{id}/thresholds
 *
 * Path parameters:
 *   id  (string, required) — organisation UUID
 *
 * Request body (JSON, both fields required):
 *   artefact_quality_threshold  (number, 0..1) — artefact quality low threshold
 *   fcs_low_threshold           (integer, 0..100) — FCS low threshold
 *
 * Returns 200 OrgThresholds | 401 | 403 | 422
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: orgId } = await params;
    const ctx = await createApiContext(request);
    const row = await loadThresholds(ctx, orgId);
    return json(row);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: orgId } = await params;
    const ctx = await createApiContext(request);
    const body = await validateBody(request, OrgThresholdsSchema);
    const row = await updateThresholds(ctx, orgId, body);
    return json(row);
  } catch (error) {
    return handleApiError(error);
  }
}
