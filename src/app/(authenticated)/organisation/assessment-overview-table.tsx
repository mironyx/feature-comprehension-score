// Presentational table of assessments for the Organisation page.
// Columns: feature/PR, repository, type, status, score, completion, date.
// Each row links to /assessments/[id]/results. Empty state renders a short
// prompt to create the first assessment.
// When `onDelete` is provided, an Actions column is added with two icon
// actions per row: Trash2 (delete) and MoreHorizontal (link to detail page).
// Design reference: docs/design/lld-nav-results.md §2, docs/design/lld-e3-assessment-deletion.md §3.2,
// docs/design/lld-v8-assessment-detail.md §T3
// Issue: #296, #319, #362

import Link from 'next/link';
import { Trash2, MoreHorizontal } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { RetryButton } from '@/app/(authenticated)/assessments/retry-button';
import type { AssessmentListItem } from '@/app/api/assessments/helpers';

const MAX_RETRIES = 3;

interface AssessmentOverviewTableProps {
  assessments: AssessmentListItem[];
  onDelete?: (assessment: AssessmentListItem) => void;
}

const BASE_HEADERS = ['Feature / PR', 'Repository', 'Type', 'Status', 'Score', 'Completion', 'Date'];
const TD = 'px-3 py-2 text-text-secondary';

function formatFeature(item: AssessmentListItem): string {
  if (item.feature_name) return item.feature_name;
  return item.pr_number !== null ? `PR #${item.pr_number}` : '—';
}

function formatScore(score: number | null): string {
  return score === null ? '—' : `${Math.round(score * 100)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function renderActionsCell(a: AssessmentListItem, onDelete: (assessment: AssessmentListItem) => void) {
  const featureLabel = formatFeature(a);
  return (
    <td className="px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onDelete(a)}
          className="text-destructive hover:opacity-80 cursor-pointer"
          aria-label={`Delete ${featureLabel}`}
        >
          <Trash2 size={16} />
        </button>
        <a
          href={`/assessments/${a.id}`}
          className="text-text-secondary hover:text-accent"
          aria-label={`View details for ${featureLabel}`}
        >
          <MoreHorizontal size={16} />
        </a>
      </div>
    </td>
  );
}

function renderRow(a: AssessmentListItem, onDelete?: (assessment: AssessmentListItem) => void) {
  return (
    <tr key={a.id} className="border-t border-border hover:bg-surface-hover">
      <td className="px-3 py-2">
        <Link href={`/assessments/${a.id}/results`} className="text-text-primary hover:text-accent">
          {formatFeature(a)}
        </Link>
      </td>
      <td className={TD}>{a.repository_name}</td>
      <td className={`${TD} uppercase`}>{a.type}</td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-2">
          <StatusBadge status={a.status} />
          {a.status === 'rubric_failed' && (
            <RetryButton
              assessmentId={a.id}
              retryCount={a.rubric_retry_count}
              maxRetries={MAX_RETRIES}
              errorRetryable={a.rubric_error_retryable}
            />
          )}
        </span>
      </td>
      <td className={TD}>{formatScore(a.aggregate_score)}</td>
      <td className={TD}>{a.completed_count}/{a.participant_count}</td>
      <td className={TD}>{formatDate(a.created_at)}</td>
      {onDelete && renderActionsCell(a, onDelete)}
    </tr>
  );
}

function renderEmptyState() {
  return (
    <div className="bg-surface border border-border rounded-md p-card-pad text-text-secondary">
      <p className="text-body font-medium text-text-primary">No assessments yet</p>
      <p className="text-body mt-1">Create your first assessment to get started.</p>
    </div>
  );
}

export function AssessmentOverviewTable({ assessments, onDelete }: AssessmentOverviewTableProps) {
  if (assessments.length === 0) return renderEmptyState();

  const headers = onDelete ? [...BASE_HEADERS, 'Actions'] : BASE_HEADERS;

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <table className="w-full text-label">
        <thead className="text-text-secondary text-left">
          <tr>{headers.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>{assessments.map((a) => renderRow(a, onDelete))}</tbody>
      </table>
    </div>
  );
}
