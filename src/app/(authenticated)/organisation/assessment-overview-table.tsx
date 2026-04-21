// Presentational table of assessments for the Organisation page.
// Columns: feature/PR, repository, type, status, score, completion, date.
// Each row links to /assessments/[id]/results. Empty state renders a short
// prompt to create the first assessment.
// Design reference: docs/design/lld-nav-results.md §2
// Issue: #296

import Link from 'next/link';
import { StatusBadge } from '@/components/ui/status-badge';
import type { AssessmentListItem } from '@/app/api/assessments/helpers';

interface AssessmentOverviewTableProps {
  assessments: AssessmentListItem[];
}

const HEADERS = ['Feature / PR', 'Repository', 'Type', 'Status', 'Score', 'Completion', 'Date'];
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

function renderRow(a: AssessmentListItem) {
  return (
    <tr key={a.id} className="border-t border-border hover:bg-surface-hover">
      <td className="px-3 py-2">
        <Link href={`/assessments/${a.id}/results`} className="text-text-primary hover:text-accent">
          {formatFeature(a)}
        </Link>
      </td>
      <td className={TD}>{a.repository_name}</td>
      <td className={`${TD} uppercase`}>{a.type}</td>
      <td className="px-3 py-2"><StatusBadge status={a.status} /></td>
      <td className={TD}>{formatScore(a.aggregate_score)}</td>
      <td className={TD}>{a.completed_count}/{a.participant_count}</td>
      <td className={TD}>{formatDate(a.created_at)}</td>
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

export function AssessmentOverviewTable({ assessments }: AssessmentOverviewTableProps) {
  if (assessments.length === 0) return renderEmptyState();

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <table className="w-full text-label">
        <thead className="text-text-secondary text-left">
          <tr>{HEADERS.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>{assessments.map(renderRow)}</tbody>
      </table>
    </div>
  );
}
