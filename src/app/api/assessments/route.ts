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

/** Maps a raw Supabase assessments row + participant counts to the list response shape. */
function toListItem(
  row: { id: string; type: AssessmentType; status: AssessmentStatus; repositories: unknown;
         pr_number: number | null; feature_name: string | null; aggregate_score: number | null;
         conclusion: Conclusion; created_at: string },
  counts: ParticipantCounts,
): AssessmentListItem {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    repository_name: (row.repositories as Pick<RepoRow, 'github_repo_name'>).github_repo_name,
    pr_number: row.pr_number,
    feature_name: row.feature_name,
    aggregate_score: row.aggregate_score,
    conclusion: row.conclusion,
    participant_count: counts[row.id]?.total ?? 0,
    completed_count: counts[row.id]?.submitted ?? 0,
    created_at: row.created_at,
  };
}

/** Throws ApiError(400) if value is present but not in the allowed set. No-op when null. */
function validateEnumParam(value: string | null, allowed: Set<string>, paramName: string): void {
  if (value !== null && !allowed.has(value)) {
    throw new ApiError(400, `Invalid ${paramName}. Allowed values: ${[...allowed].join(', ')}`);
  }
}

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

type ParticipantCounts = Record<string, { total: number; submitted: number }>;

/**
 * Fetches participant counts for a set of assessments using the service client
 * (bypasses RLS — assessment_participants only exposes a non-admin's own row).
 */
async function fetchParticipantCounts(assessmentIds: string[]): Promise<ParticipantCounts> {
  if (assessmentIds.length === 0) return {};

  const adminSupabase = createSecretSupabaseClient();
  const { data: participants, error } = await adminSupabase
    .from('assessment_participants')
    .select('assessment_id, status')
    .in('assessment_id', assessmentIds);

  if (error) {
    console.error('GET /api/assessments: participant counts query failed:', error);
    throw new ApiError(500, 'Internal server error');
  }

  const counts: ParticipantCounts = {};
  for (const p of participants ?? []) {
    const id = p.assessment_id as string;
    if (!counts[id]) counts[id] = { total: 0, submitted: 0 };
    counts[id].total++;
    // 'submitted' is the terminal status meaning the participant completed their assessment.
    if (p.status === 'submitted') counts[id].submitted++;
  }
  return counts;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const orgId = searchParams.get('org_id');
    if (!orgId) {
      throw new ApiError(400, 'org_id is required');
    }

    const typeRaw = searchParams.get('type');
    const statusRaw = searchParams.get('status');

    validateEnumParam(typeRaw, VALID_TYPES, 'type filter');
    validateEnumParam(statusRaw, VALID_STATUSES, 'status filter');

    const typeFilter = typeRaw as AssessmentType | null;
    const statusFilter = statusRaw as AssessmentStatus | null;

    const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? String(DEFAULT_PAGE), 10) || DEFAULT_PAGE);
    const perPage = Math.min(
      MAX_PER_PAGE,
      Math.max(1, Number.parseInt(searchParams.get('per_page') ?? String(DEFAULT_PER_PAGE), 10) || DEFAULT_PER_PAGE),
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
    const participantCounts = await fetchParticipantCounts(assessmentIds);
    const assessments = (rows ?? []).map(r => toListItem(r, participantCounts));

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
