// Helpers for GET /api/assessments — extracted to reduce file-level complexity in route.ts.

import type { NextRequest } from 'next/server';
import { requireOrgAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';
import type { Database } from '@/lib/supabase/types';

type AssessmentType = Database['public']['Tables']['assessments']['Row']['type'];
type AssessmentStatus = Database['public']['Tables']['assessments']['Row']['status'];
type Conclusion = Database['public']['Tables']['assessments']['Row']['conclusion'];
type ComprehensionDepth = Database['public']['Tables']['assessments']['Row']['config_comprehension_depth'];
type RepoRow = Database['public']['Tables']['repositories']['Row'];

export type ParticipantCounts = Record<string, { total: number; submitted: number }>;

export interface QueryParams {
  orgId: string;
  typeFilter: AssessmentType | null;
  statusFilter: AssessmentStatus | null;
  page: number;
  perPage: number;
}

export interface AssessmentListItem {
  id: string;
  type: AssessmentType;
  status: AssessmentStatus;
  repository_name: string;
  pr_number: number | null;
  feature_name: string | null;
  aggregate_score: number | null;
  conclusion: Conclusion;
  config_comprehension_depth: ComprehensionDepth;
  participant_count: number;
  completed_count: number;
  created_at: string;
}

export const VALID_TYPES = new Set<string>(['prcc', 'fcs']);
export const VALID_STATUSES = new Set<string>([
  'created',
  'rubric_generation',
  'generation_failed',
  'rubric_failed',
  'awaiting_responses',
  'scoring',
  'completed',
  'invalidated',
  'skipped',
]);

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

/** Maps a raw Supabase assessments row + participant counts to the list response shape. */
export function toListItem(
  row: { id: string; type: AssessmentType; status: AssessmentStatus; repositories: unknown;
         pr_number: number | null; feature_name: string | null; aggregate_score: number | null;
         conclusion: Conclusion; config_comprehension_depth: ComprehensionDepth;
         created_at: string },
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
    config_comprehension_depth: row.config_comprehension_depth,
    participant_count: counts[row.id]?.total ?? 0,
    completed_count: counts[row.id]?.submitted ?? 0,
    created_at: row.created_at,
  };
}

/** Throws ApiError(400) if value is present but not in the allowed set. No-op when null. */
export function validateEnumParam(value: string | null, allowed: Set<string>, paramName: string): void {
  if (value !== null && !allowed.has(value)) {
    throw new ApiError(400, `Invalid ${paramName}. Allowed values: ${[...allowed].join(', ')}`);
  }
}

/** Parses a positive integer query param, falling back to defaultVal and clamping to [1, max]. */
function parseIntParam(raw: string | null, defaultVal: number, max: number): number {
  const parsed = Number.parseInt(raw ?? String(defaultVal), 10) || defaultVal;
  return Math.min(max, Math.max(1, parsed));
}

/** Parses, validates, and normalises all query parameters for GET /api/assessments. */
export function parseQueryParams(searchParams: URLSearchParams): QueryParams {
  const orgId = searchParams.get('org_id');
  if (!orgId) throw new ApiError(400, 'org_id is required');

  const typeRaw = searchParams.get('type');
  const statusRaw = searchParams.get('status');
  validateEnumParam(typeRaw, VALID_TYPES, 'type filter');
  validateEnumParam(statusRaw, VALID_STATUSES, 'status filter');

  return {
    orgId,
    typeFilter: typeRaw as AssessmentType | null,
    statusFilter: statusRaw as AssessmentStatus | null,
    page: parseIntParam(searchParams.get('page'), DEFAULT_PAGE, Number.MAX_SAFE_INTEGER),
    perPage: parseIntParam(searchParams.get('per_page'), DEFAULT_PER_PAGE, MAX_PER_PAGE),
  };
}

/**
 * Fetches participant counts for a set of assessments.
 *
 * Uses the service client (bypasses RLS) because the RLS policy on
 * assessment_participants only lets a non-admin user read their own row.
 * Querying through a user session would return a count of 1 (themselves),
 * not the real total. Participant counts are non-sensitive aggregate metadata,
 * so the service client is appropriate here.
 */
export async function fetchParticipantCounts(assessmentIds: string[]): Promise<ParticipantCounts> {
  if (assessmentIds.length === 0) return {};

  const adminSupabase = createSecretSupabaseClient();
  const { data: participants, error } = await adminSupabase
    .from('assessment_participants')
    .select('assessment_id, status')
    .in('assessment_id', assessmentIds);

  if (error) {
    logger.error({ err: error }, 'GET /api/assessments: participant counts query failed');
    throw new ApiError(500, 'Internal server error');
  }

  const counts: ParticipantCounts = {};
  for (const p of participants ?? []) {
    const id = p.assessment_id;
    counts[id] ??= { total: 0, submitted: 0 };
    counts[id].total++;
    if (p.status === 'submitted') counts[id].submitted++;
  }
  return counts;
}

/**
 * Attempts org-admin auth, swallowing 403 (non-admin) so RLS handles scoping.
 * Re-throws 401 and any unexpected errors.
 */
export async function assertAuthOrParticipant(request: NextRequest, orgId: string): Promise<void> {
  try {
    await requireOrgAdmin(request, orgId);
  } catch (err) {
    if (!(err instanceof ApiError) || err.statusCode !== 403) throw err;
    // 403 = non-admin; RLS scopes results to participant-only assessments.
  }
}
