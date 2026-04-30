// POST + GET /api/projects — controller.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.3

import type { NextRequest } from 'next/server';
import { createApiContext } from '@/lib/api/context';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { validateBody } from '@/lib/api/validation';
import { CreateProjectSchema } from './validation';
import { createProject, listProjects } from './service';
import type { ProjectResponse } from '@/types/projects';

// ---------------------------------------------------------------------------
// Contract types — ADR-0014: declared inline so reading this file is sufficient.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- ADR-0014: contract doc
interface CreateProjectRequest {
  org_id: string;
  name: string;
  description?: string;
  glob_patterns?: string[];
  domain_notes?: string;
  question_count?: number;
}

/** GET /api/projects — response body */
interface ProjectsListResponse { projects: ProjectResponse[] }

export async function POST(request: NextRequest) {
  try {
    const ctx = await createApiContext(request);
    const body = await validateBody(request, CreateProjectSchema);
    const project = await createProject(ctx, body);
    return json(project, 201);
  } catch (e) { return handleApiError(e); }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await createApiContext(request);
    const orgId = new URL(request.url).searchParams.get('org_id');
    if (!orgId) throw new ApiError(400, 'org_id required');
    const projects = await listProjects(ctx, orgId);
    const body: ProjectsListResponse = { projects };
    return json(body);
  } catch (e) { return handleApiError(e); }
}
