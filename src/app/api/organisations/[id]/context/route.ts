// PATCH /api/organisations/[id]/context — upsert org prompt context.
// Design reference: docs/requirements/v1-prompt-changes.md §Change 2

import type { NextRequest } from 'next/server';
import { requireOrgAdmin } from '@/lib/api/auth';
import { handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { validateBody } from '@/lib/api/validation';
import { OrganisationContextSchema } from '@/lib/engine/prompts';
import { upsertOrgContext } from '@/lib/supabase/org-prompt-context';

// ---------------------------------------------------------------------------
// Contract types — ADR-0014
// ---------------------------------------------------------------------------

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
interface OrgContextResponse {
  id: string;
  org_id: string;
  project_id: string | null;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: orgId } = await params;
    await requireOrgAdmin(request, orgId);
    const body = await validateBody(request, OrganisationContextSchema);
    const row = await upsertOrgContext(orgId, body);
    const response: OrgContextResponse = row;
    return json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
