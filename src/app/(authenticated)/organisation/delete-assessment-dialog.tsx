// DeleteAssessmentDialog — modal that confirms permanent deletion of an assessment.
// Design reference: docs/design/lld-e3-assessment-deletion.md §3.2
// Issue: #319
'use client';

import type { AssessmentListItem } from '@/app/api/assessments/helpers';
import { Button } from '@/components/ui/button';

export interface DeleteAssessmentDialogProps {
  assessment: AssessmentListItem | null;
  isDeleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function formatAssessmentLabel(assessment: AssessmentListItem): string {
  if (assessment.feature_name) return assessment.feature_name;
  return assessment.pr_number !== null ? `PR #${assessment.pr_number}` : 'this assessment';
}

export function DeleteAssessmentDialog({
  assessment,
  isDeleting,
  error,
  onConfirm,
  onCancel,
}: DeleteAssessmentDialogProps): React.ReactElement | null {
  if (assessment === null) return null;

  const label = formatAssessmentLabel(assessment);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="bg-surface border border-border rounded-md p-card-pad max-w-md w-full space-y-3">
        <p className="text-body text-text-primary font-medium">
          Delete {label}?
        </p>
        <p className="text-body text-text-secondary">
          This action is permanent and cannot be undone.
        </p>
        {error && (
          <p role="alert" className="text-caption text-destructive">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}
