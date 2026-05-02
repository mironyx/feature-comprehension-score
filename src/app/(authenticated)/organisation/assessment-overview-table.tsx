// Presentational table of assessments for the Organisation page.
// Columns: feature/PR, [project,] repository, type, status, score, completion, date.
// Each row links to /projects/[id]/assessments/[aid]/results (FCS). PRCC rows have
// no project_id and render the feature name as plain text. Empty state renders a short
// prompt to create the first assessment.
// When `onDelete` is provided, an Actions column is added with two icon
// actions per row: Trash2 (delete) and MoreHorizontal (link to detail page).
// When `showProjectColumn` is true, a Project column is added and a client-side
// project filter dropdown appears above the table (hidden when ≤ 1 distinct project).
// Design reference: docs/design/lld-nav-results.md §2, docs/design/lld-e3-assessment-deletion.md §3.2,
// docs/design/lld-v8-assessment-detail.md §T3, docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.9
// Issue: #296, #319, #362, #441
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trash2, MoreHorizontal } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { PollingStatusBadge } from '@/app/(authenticated)/assessments/polling-status-badge';
import { RetryButton } from '@/app/(authenticated)/assessments/retry-button';
import type { AssessmentListItem } from '@/app/api/assessments/helpers';

const MAX_RETRIES = 3;

interface AssessmentOverviewTableProps {
  assessments: AssessmentListItem[];
  onDelete?: (assessment: AssessmentListItem) => void;
  showProjectColumn?: boolean;
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
        {a.project_id ? (
          <a
            href={`/projects/${a.project_id}/assessments/${a.id}`}
            className="text-text-secondary hover:text-accent"
            aria-label={`View details for ${featureLabel}`}
          >
            <MoreHorizontal size={16} />
          </a>
        ) : (
          <span className="text-text-secondary opacity-40" aria-label={`View details for ${featureLabel}`}>
            <MoreHorizontal size={16} />
          </span>
        )}
      </div>
    </td>
  );
}

function renderFeatureCell(a: AssessmentListItem) {
  return (
    <td className="px-3 py-2">
      {a.project_id ? (
        <Link href={`/projects/${a.project_id}/assessments/${a.id}/results`} className="text-text-primary hover:text-accent">
          {formatFeature(a)}
        </Link>
      ) : (
        <span className="text-text-primary">{formatFeature(a)}</span>
      )}
    </td>
  );
}

function renderStatusCell(a: AssessmentListItem) {
  return (
    <td className="px-3 py-2">
      <span className="inline-flex items-center gap-2">
        {a.status === 'rubric_generation'
          ? <PollingStatusBadge assessmentId={a.id} initialStatus="rubric_generation" />
          : <StatusBadge status={a.status} />}
        {a.status === 'rubric_failed' && (
          <>
            {a.rubric_error_code && (
              <span className="text-caption text-text-secondary">{a.rubric_error_code}</span>
            )}
            <RetryButton
              assessmentId={a.id}
              retryCount={a.rubric_retry_count}
              maxRetries={MAX_RETRIES}
              errorRetryable={a.rubric_error_retryable}
            />
          </>
        )}
      </span>
    </td>
  );
}

function renderRow(a: AssessmentListItem, showProjectColumn?: boolean, onDelete?: (assessment: AssessmentListItem) => void) {
  return (
    <tr key={a.id} className="border-t border-border hover:bg-surface-hover">
      {renderFeatureCell(a)}
      <td className={TD}>{a.repository_name}</td>
      {showProjectColumn && <td className={TD}>{a.project_name ?? '—'}</td>}
      <td className={`${TD} uppercase`}>{a.type}</td>
      {renderStatusCell(a)}
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

function buildProjectList(assessments: AssessmentListItem[]): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();
  for (const a of assessments) {
    if (a.project_id !== null && a.project_name !== null && !seen.has(a.project_id)) {
      seen.set(a.project_id, a.project_name);
    }
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

function renderProjectFilter(
  projects: Array<{ id: string; name: string }>,
  selected: string | null,
  onChange: (id: string | null) => void,
) {
  if (projects.length <= 1) return null;
  return (
    <select
      value={selected ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="text-body border border-border rounded px-2 py-1"
      aria-label="Filter by project"
    >
      <option value="">All projects</option>
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

export function AssessmentOverviewTable({ assessments, onDelete, showProjectColumn }: AssessmentOverviewTableProps) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  if (assessments.length === 0) return renderEmptyState();

  const projects = showProjectColumn ? buildProjectList(assessments) : [];
  const filtered = selectedProject !== null ? assessments.filter((a) => a.project_id === selectedProject) : assessments;
  const baseHeaders = showProjectColumn
    ? ['Feature / PR', 'Project', 'Repository', 'Type', 'Status', 'Score', 'Completion', 'Date']
    : BASE_HEADERS;
  const headers = onDelete ? [...baseHeaders, 'Actions'] : baseHeaders;

  return (
    <div className="space-y-3">
      {showProjectColumn && renderProjectFilter(projects, selectedProject, setSelectedProject)}
      <div className="bg-surface border border-border rounded-md overflow-hidden">
        <table className="w-full text-label">
          <thead className="text-text-secondary text-left">
            <tr>{headers.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>{filtered.map((a) => renderRow(a, showProjectColumn, onDelete))}</tbody>
        </table>
      </div>
    </div>
  );
}
