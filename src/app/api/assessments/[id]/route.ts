// GET /api/assessments/[id] — assessment detail with field-level visibility rules.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import type { NextRequest } from 'next/server';
import { createApiContext } from '@/lib/api/context';
import { handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { deleteAssessment } from './delete-service';
import { NextResponse } from 'next/server';
import {
  resolveAssessment,
  fetchParallelData,
  buildResponse,
} from './assessment-detail-queries';

// ---------------------------------------------------------------------------
// Contract types — re-exported so importers continue to use this module path.
// ---------------------------------------------------------------------------

export type {
  MyParticipation,
  FcsPr,
  FcsIssue,
  ParticipantStatus,
  ParticipantDetail,
  AssessmentDetailResponse,
} from './assessment-detail-queries';

// ---------------------------------------------------------------------------
// Route context
// ---------------------------------------------------------------------------

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/assessments/[id]
 *
 * Path parameters:
 *   id    (string) — assessment UUID
 *
 * Returns 200 AssessmentDetailResponse | 401 unauthenticated | 404 not found
 *
 * Scores for FCS participants are served by GET /api/assessments/[id]/scores.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: assessmentId } = await params;
    const { user, supabase, adminSupabase } = await createApiContext(request);

    const { data: rawAssessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('*, repositories!inner(github_repo_name), organisations!inner(github_org_name)')
      .eq('id', assessmentId)
      .single();

    const assessment = resolveAssessment(rawAssessment, assessmentError);
    const parallelData = await fetchParallelData({
      supabase,
      adminSupabase,
      assessmentId,
      userId: user.id,
      orgId: assessment.org_id,
      assessmentType: assessment.type,
    });

    return json(buildResponse(assessment, parallelData));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/assessments/[id]
 *
 * Path parameters:
 *   id  (string, required) — assessment UUID
 *
 * Returns 204 No Content | 401 unauthenticated | 404 not found (RLS hides)
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: assessmentId } = await params;
    const ctx = await createApiContext(request);
    await deleteAssessment(ctx, assessmentId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
