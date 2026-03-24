// GET /api/assessments — list assessments scoped by RLS.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import type { NextRequest } from 'next/server';
import { requireOrgAdmin } from '@/lib/api/auth';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { createReadonlyRouteHandlerClient } from '@/lib/supabase/route-handler-readonly';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';
import type { Database } from '@/lib/supabase/types';

type AssessmentType = Database['public']['Tables']['assessments']['Row']['type'];
type AssessmentStatus = Database['public']['Tables']['assessments']['Row']['status'];
type Conclusion = Database['public']['Tables']['assessments']['Row']['conclusion'];
type RepoRow = Database['public']['Tables']['repositories']['Row'];

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
interface AssessmentListItem {
  id: string;
  type: AssessmentType;
  status: AssessmentStatus;
  repository_name: string;
  pr_number: number | null;
  feature_name: string | null;
  aggregate_score: number | null;
  conclusion: Conclusion;
  participant_count: number;
  completed_count: number;
  created_at: string;
}

interface AssessmentsResponse {
  assessments: AssessmentListItem[];
  total: number;
  page: number;
  per_page: number;
}

const VALID_TYPES = new Set<string>(['prcc', 'fcs']);
const VALID_STATUSES = new Set<string>([
  'created',
  'rubric_generation',
  'generation_failed',
  'awaiting_responses',
  'scoring',
  'completed',
  'invalidated',
  'skipped',
]);

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const orgId = searchParams.get('org_id');
    if (!orgId) {
      throw new ApiError(400, 'org_id is required');
    }

    const typeRaw = searchParams.get('type');
    const statusRaw = searchParams.get('status');

    if (typeRaw && !VALID_TYPES.has(typeRaw)) {
      throw new ApiError(400, `Invalid type filter. Allowed values: ${[...VALID_TYPES].join(', ')}`);
    }
    if (statusRaw && !VALID_STATUSES.has(statusRaw)) {
      throw new ApiError(400, `Invalid status filter. Allowed values: ${[...VALID_STATUSES].join(', ')}`);
    }

    const typeFilter = typeRaw as AssessmentType | null;
    const statusFilter = statusRaw as AssessmentStatus | null;

    const page = Math.max(1, parseInt(searchParams.get('page') ?? String(DEFAULT_PAGE), 10) || DEFAULT_PAGE);
    const perPage = Math.min(
      MAX_PER_PAGE,
      Math.max(1, parseInt(searchParams.get('per_page') ?? String(DEFAULT_PER_PAGE), 10) || DEFAULT_PER_PAGE),
    );

    // requireOrgAdmin calls requireAuth internally — no separate call needed.
    // Only swallow 403 (non-admin); re-throw 401 and unexpected errors.
    try {
      await requireOrgAdmin(request, orgId);
    } catch (err) {
      if (!(err instanceof ApiError) || err.statusCode !== 403) {
        throw err;
      }
      // 403 = non-admin; RLS will scope results to participant-only assessments.
    }

    const supabase = createReadonlyRouteHandlerClient(request);

    // Build main assessments query.
    // RLS enforces org membership + participant access based on session.
    let query = supabase
      .from('assessments')
      .select('*, repositories!inner(github_repo_name)', { count: 'exact' })
      .eq('org_id', orgId);

    if (typeFilter) {
      query = query.eq('type', typeFilter);
    }

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data: rows, error, count } = await query
      .range(from, to)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('GET /api/assessments: DB query failed:', error);
      throw new ApiError(500, 'Internal server error');
    }

    const assessmentIds = (rows ?? []).map(r => r.id as string);

    // Fetch participant counts using the service client to bypass RLS.
    // assessment_participants RLS only exposes a non-admin's own row, so
    // aggregate counts must be computed outside the user session.
    const participantCounts: Record<string, { total: number; submitted: number }> = {};

    if (assessmentIds.length > 0) {
      const adminSupabase = createSecretSupabaseClient();
      const { data: participants, error: partError } = await adminSupabase
        .from('assessment_participants')
        .select('assessment_id, status')
        .in('assessment_id', assessmentIds);

      if (partError) {
        console.error('GET /api/assessments: participant counts query failed:', partError);
        throw new ApiError(500, 'Internal server error');
      }

      for (const p of participants ?? []) {
        const id = p.assessment_id as string;
        if (!participantCounts[id]) {
          participantCounts[id] = { total: 0, submitted: 0 };
        }
        participantCounts[id].total++;
        // 'submitted' is the terminal status meaning the participant completed their assessment.
        if (p.status === 'submitted') {
          participantCounts[id].submitted++;
        }
      }
    }

    const assessments = (rows ?? []).map(a => ({
      id: a.id,
      type: a.type,
      status: a.status,
      repository_name: (a.repositories as unknown as Pick<RepoRow, 'github_repo_name'>).github_repo_name,
      pr_number: a.pr_number,
      feature_name: a.feature_name,
      aggregate_score: a.aggregate_score,
      conclusion: a.conclusion,
      participant_count: participantCounts[a.id]?.total ?? 0,
      completed_count: participantCounts[a.id]?.submitted ?? 0,
      created_at: a.created_at,
    }));

    const body: AssessmentsResponse = {
      assessments,
      total: count ?? 0,
      page,
      per_page: perPage,
    };
    return json(body);
  } catch (error) {
    return handleApiError(error);
  }
}
