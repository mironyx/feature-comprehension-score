// DeleteableAssessmentTable — client wrapper that adds delete actions to the
// assessment overview table. Holds assessment list state, opens a confirmation
// dialog, and calls DELETE /api/assessments/[id] on confirm.
// Design reference: docs/design/lld-e3-assessment-deletion.md §3.2
// Issue: #319
'use client';

import { useState, useEffect } from 'react';
import type { AssessmentListItem } from '@/app/api/assessments/helpers';
import { AssessmentOverviewTable } from './assessment-overview-table';
import { DeleteAssessmentDialog } from './delete-assessment-dialog';

export interface DeleteableAssessmentTableProps {
  initialAssessments: AssessmentListItem[];
  showProjectColumn?: boolean;
}

export function DeleteableAssessmentTable({
  initialAssessments,
  showProjectColumn,
}: DeleteableAssessmentTableProps): React.ReactElement {
  const [assessments, setAssessments] = useState<AssessmentListItem[]>(initialAssessments);
  useEffect(() => { setAssessments(initialAssessments); }, [initialAssessments]);
  const [target, setTarget] = useState<AssessmentListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onDelete(a: AssessmentListItem) {
    setTarget(a);
    setError(null);
  }

  function onCancel() {
    setTarget(null);
    setError(null);
  }

  async function onConfirm() {
    if (!target) return;
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessments/${target.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError('Failed to delete assessment. Please try again.');
        return;
      }
      setAssessments((prev) => prev.filter((a) => a.id !== target.id));
      setTarget(null);
    } catch {
      // Discarding the underlying error is intentional — fetch rejects only on network
      // failure, and we surface a single generic message. HTTP errors are handled via !res.ok above.
      setError('Network error. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <AssessmentOverviewTable assessments={assessments} onDelete={onDelete} showProjectColumn={showProjectColumn} />
      <DeleteAssessmentDialog
        assessment={target}
        isDeleting={isDeleting}
        error={error}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </>
  );
}
