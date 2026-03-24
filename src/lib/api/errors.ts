// Shared API error class and error response helper.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import { NextResponse } from 'next/server';

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Maps ApiError instances to their status codes; unknown errors to 500. */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    const body: Record<string, unknown> = { error: error.message };
    if (error.details !== undefined) {
      body.details = error.details;
    }
    return NextResponse.json(body, { status: error.statusCode });
  }

  console.error('Unhandled error in API route:', error);
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 },
  );
}
