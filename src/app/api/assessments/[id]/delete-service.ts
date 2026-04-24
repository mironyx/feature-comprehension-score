// DELETE /api/assessments/[id] — service function.
// Design reference: docs/design/lld-e3-assessment-deletion.md §3.1

import { ApiError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import type { ApiContext } from '@/lib/api/context';

/** Deletes an assessment. RLS enforces admin authorisation + org scoping. Throws 404 on not-found or denied. */
export async function deleteAssessment(
  ctx: ApiContext,
  assessmentId: string,
): Promise<void> {
  // Use user-scoped client so RLS enforces org membership + admin role.
  // .select('id').single() returns the deleted row, letting us distinguish
  // a successful delete (1 row) from RLS-denied / not-found (0 rows).
  const { data, error } = await ctx.supabase
    .from('assessments')
    .delete()
    .eq('id', assessmentId)
    .select('id')
    .single();

  if (error || !data) {
    logger.warn({ assessmentId, err: error }, 'DELETE /api/assessments/[id]: not found or denied');
    throw new ApiError(404, 'Assessment not found');
  }
}
