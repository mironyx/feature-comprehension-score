// POST /api/assessments/[id]/retry-rubric — admin retry for failed rubric generation.
// Issue: #132

import type { NextRequest } from 'next/server';
import { createApiContext } from '@/lib/api/context';
import { handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { retryRubricGeneration } from './service';

// ---------------------------------------------------------------------------
// Contract types — ADR-0014
// ---------------------------------------------------------------------------

/**
 * POST /api/assessments/{id}/retry-rubric
 *
 * Path parameters:
 *   id  (string, required) — assessment UUID
 *
 * Returns 200 RetryRubricResponse | 400 not in rubric_failed status |
 *         401 unauthenticated | 403 forbidden | 404 not found
 */
export interface RetryRubricResponse {
  assessment_id: string;
  status: 'rubric_generation';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await createApiContext(request);
    const result = await retryRubricGeneration(ctx, id);
    const body: RetryRubricResponse = result;
    return json(body);
  } catch (error) {
    return handleApiError(error);
  }
}
