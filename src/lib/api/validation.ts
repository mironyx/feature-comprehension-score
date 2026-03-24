// Request body and parameter validation utilities.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import type { NextRequest } from 'next/server';
import type { ZodType } from 'zod';
import { ApiError } from './errors';

/** Parse and validate the JSON request body against a Zod schema. Throws ApiError(422) on failure. */
export async function validateBody<T>(
  request: NextRequest,
  schema: ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(422, 'Invalid JSON body');
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(422, 'Validation failed', {
      issues: result.error.issues.map(i => ({ path: i.path, message: i.message })),
    });
  }

  return result.data;
}
