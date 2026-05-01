// GET/PATCH/DELETE /api/projects/[id] — project read + edit + delete.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.4

import type { NextRequest } from 'next/server';
import { createApiContext } from '@/lib/api/context';
import { handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { validateBody } from '@/lib/api/validation';
import { UpdateProjectSchema } from '@/app/api/projects/validation';
import { getProject, updateProject, deleteProject } from './service';

// ---------------------------------------------------------------------------
// Contract types — ADR-0014
// ---------------------------------------------------------------------------

/**
 * GET /api/projects/{id}
 *
 * Path parameters:
 *   id  (string, required) — project UUID
 *
 * Returns 200 ProjectResponse | 401 | 403 | 404
 */

/**
 * PATCH /api/projects/{id}
 *
 * Path parameters:
 *   id  (string, required) — project UUID
 *
 * Request body (JSON, at least one field required):
 *   name            (string, 1–200 chars)
 *   description     (string, max 2000 chars)
 *   glob_patterns   (string[], max 50)
 *   domain_notes    (string, max 2000 chars)
 *   question_count  (integer, 3–5)
 *
 * Returns 200 ProjectResponse | 400 | 401 | 403 | 409 | 422
 */

/**
 * DELETE /api/projects/{id}
 *
 * Path parameters:
 *   id  (string, required) — project UUID
 *
 * Returns 204 | 401 | 403 | 404 | 409
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await createApiContext(request);
    const { id } = await params;
    return json(await getProject(ctx, id));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await createApiContext(request);
    const { id } = await params;
    const body = await validateBody(request, UpdateProjectSchema);
    return json(await updateProject(ctx, id, body));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await createApiContext(request);
    const { id } = await params;
    await deleteProject(ctx, id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return handleApiError(e);
  }
}
