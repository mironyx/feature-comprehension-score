// GET /api/assessments — list assessments scoped by RLS.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import type { NextRequest } from 'next/server';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { json } from '@/lib/api/response';
import { createReadonlyRouteHandlerClient } from '@/lib/supabase/route-handler-readonly';
import {
  assertAuthOrParticipant,
  fetchParticipantCounts,
  parseQueryParams,
  toListItem,
  type AssessmentListItem,
} from './helpers';

// ---------------------------------------------------------------------------
// Contract types — query params and response shape for this endpoint.
// Reading this block is sufficient to understand what the API accepts and
// returns without opening the design doc.
// Convention: ADR-0014.
// ---------------------------------------------------------------------------

/**
 * GET /api/assessments
 *
 * Query parameters:
 *   org_id    (string, required) — scope to this organisation
 *   type      ('prcc'|'fcs', optional) — filter by assessment type
 *   status    (AssessmentStatus, optional) — filter by status
 *   page      (integer ≥ 1, default 1)
 *   per_page  (integer 1–100, default 20)
 *
 * Returns 200 AssessmentsResponse | 400 on invalid params | 401 unauthenticated
 */
interface AssessmentsResponse {
  assessments: AssessmentListItem[];
  total: number;
  page: number;
  per_page: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { orgId, typeFilter, statusFilter, page, perPage } = parseQueryParams(searchParams);
    await assertAuthOrParticipant(request, orgId);

    const supabase = createReadonlyRouteHandlerClient(request);

    // RLS enforces org membership + participant access based on session.
    let query = supabase
      .from('assessments')
      .select(
        'id, type, status, pr_number, feature_name, aggregate_score, conclusion, config_comprehension_depth, created_at, repositories!inner(github_repo_name)',
        { count: 'exact' },
      )
      .eq('org_id', orgId);

    if (typeFilter) query = query.eq('type', typeFilter);
    if (statusFilter) query = query.eq('status', statusFilter);

    const from = (page - 1) * perPage;
    const { data: rows, error, count } = await query
      .range(from, from + perPage - 1)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ err: error }, 'GET /api/assessments: DB query failed');
      throw new ApiError(500, 'Internal server error');
    }

    const assessmentIds = (rows ?? []).map(r => r.id);
    const participantCounts = await fetchParticipantCounts(assessmentIds);
    const body: AssessmentsResponse = {
      assessments: (rows ?? []).map(r => toListItem(r, participantCounts)),
      total: count ?? 0,
      page,
      per_page: perPage,
    };
    return json(body);
  } catch (error) {
    return handleApiError(error);
  }
}
