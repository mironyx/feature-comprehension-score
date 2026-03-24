// JSON response helpers for API route handlers.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import { NextResponse } from 'next/server';

/** Return a JSON success response with an optional status code (default 200). */
export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
  };
}

/** Return a paginated JSON response. */
export function paginated<T>(
  data: T[],
  page: number,
  perPage: number,
  total: number,
): NextResponse {
  const body: PaginatedResponse<T> = {
    data,
    pagination: { page, perPage, total },
  };
  return NextResponse.json(body, { status: 200 });
}
