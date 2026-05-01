// POST /api/projects/[id]/assessments — create a project-scoped FCS assessment.
// Design reference: docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.2

import type { NextRequest } from 'next/server';
import { createApiContext } from '@/lib/api/context';
import { handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { validateBody } from '@/lib/api/validation';
import { CreateFcsBodySchema } from './validation';
import { createFcsForProject } from './service';
export type { CreateFcsResponse } from './service';

/**
 * POST /api/projects/{id}/assessments
 *
 * Path parameters:
 *   id  (string, required) — project UUID
 *
 * Request body:
 *   { repository_id, feature_name, feature_description?, merged_pr_numbers?,
 *     issue_numbers?, participants[], comprehension_depth? }
 *
 * Returns 201 CreateFcsResponse | 400 invalid body | 401 unauthenticated |
 *         403 Forbidden (Org Member or wrong repo for Repo Admin) |
 *         404 project not found | 422 validation error
 */

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await createApiContext(request);
    const { id: projectId } = await params;
    const body = await validateBody(request, CreateFcsBodySchema);
    return json(await createFcsForProject(ctx, projectId, body), 201);
  } catch (e) { return handleApiError(e); }
}
