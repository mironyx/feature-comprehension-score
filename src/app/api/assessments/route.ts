// GET /api/assessments — list assessments scoped by RLS.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import type { NextRequest } from 'next/server';
import { requireOrgAdmin } from '@/lib/api/auth';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { createReadonlyRouteHandlerClient } from '@/lib/supabase/route-handler-readonly';
import type { Database } from '@/lib/supabase/types';

type RepoRow = Database['public']['Tables']['repositories']['Row'];

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

    const typeFilter = searchParams.get('type');
    const statusFilter = searchParams.get('status');
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
      query = query.eq('type', typeFilter as 'prcc' | 'fcs');
    }

    if (statusFilter) {
      query = query.eq(
        'status',
        statusFilter as
          | 'created'
          | 'rubric_generation'
          | 'generation_failed'
          | 'awaiting_responses'
          | 'scoring'
          | 'completed'
          | 'invalidated'
          | 'skipped',
      );
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

    // Fetch participant counts for the current page of assessments.
    const participantCounts: Record<string, { total: number; submitted: number }> = {};

    if (assessmentIds.length > 0) {
      const { data: participants, error: partError } = await supabase
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

    return json({
      assessments,
      total: count ?? 0,
      page,
      per_page: perPage,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
