// POST /api/assessments/[id]/answers — answer submission endpoint.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { validateBody } from '@/lib/api/validation';
import { createReadonlyRouteHandlerClient } from '@/lib/supabase/route-handler-readonly';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';
import { submitAnswers, SubmitBodySchema } from './service';
export type { SubmitResponse } from './service';

// ---------------------------------------------------------------------------
// Contract types — path params and response shape. Convention: ADR-0014.
// ---------------------------------------------------------------------------

/**
 * POST /api/assessments/[id]/answers
 *
 * Path parameters:
 *   id    (string) — assessment UUID
 *
 * Request body:
 *   { answers: { question_id: string; answer_text: string }[] }
 *
 * Returns 200 SubmitResponse | 401 unauthenticated | 403 not participant |
 *         422 already submitted / missing answers / invalid question IDs
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: assessmentId } = await params;
    const user = await requireAuth(request);
    const body = await validateBody(request, SubmitBodySchema);
    const supabase = createReadonlyRouteHandlerClient(request);
    const adminSupabase = createSecretSupabaseClient();

    const result = await submitAnswers(supabase, adminSupabase, assessmentId, user.id, body);
    return json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
