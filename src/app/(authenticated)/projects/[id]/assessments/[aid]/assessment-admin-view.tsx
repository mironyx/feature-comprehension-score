// AssessmentAdminView — admin-facing detail view for an assessment.
// Shown when caller_role === 'admin'. Never shown to participants.
// Design reference: docs/design/lld-v8-assessment-detail.md §T2
// Issue: #364

import type { AssessmentDetailResponse, ParticipantDetail } from '@/app/api/assessments/[id]/route';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { PollingStatusBadge } from '@/app/(authenticated)/assessments/polling-status-badge';
import { AssessmentSourceList } from './assessment-source-list';

interface AdminViewProps {
  readonly assessment: AssessmentDetailResponse;
}

export function AssessmentAdminView({ assessment }: AdminViewProps) {
  const participants = Array.isArray(assessment.participants)
    ? (assessment.participants as ParticipantDetail[])
    : [];

  return (
    <div className="space-y-section-gap">
      <a href="/organisation" className="text-caption text-accent hover:text-accent-hover">
        ← Back to Organisation
      </a>
      <PageHeader
        title={assessment.feature_name ?? `PR #${assessment.pr_number}`}
        subtitle={assessment.feature_description ?? undefined}
      />
      <Card>
        <dl className="space-y-2">
          <div>
            <dt className="text-caption text-text-secondary">Repository</dt>
            <dd className="text-body">{assessment.repository_full_name}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Status</dt>
            <dd>
              {assessment.status === 'rubric_generation'
                ? <PollingStatusBadge assessmentId={assessment.id} initialStatus="rubric_generation" />
                : <StatusBadge status={assessment.status} />}
            </dd>
          </div>
        </dl>
      </Card>
      {assessment.type === 'fcs' && (
        <AssessmentSourceList prs={assessment.fcs_prs} issues={assessment.fcs_issues} />
      )}
      <Card>
        <h2 className="text-heading-sm font-display mb-3">Participants</h2>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-1 text-caption text-text-secondary font-normal">Login</th>
              <th className="text-left py-1 text-caption text-text-secondary font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {participants.map(p => (
              <tr key={p.github_login}>
                <td className="py-1 text-body">{p.github_login}</td>
                <td className="py-1"><StatusBadge status={p.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
