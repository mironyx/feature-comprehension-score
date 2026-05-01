// AssessmentSourceList — renders FCS linked PRs and issues above the answering form.
// Renders nothing when both arrays are empty.
// Design reference: docs/design/lld-v8-assessment-detail.md §T2
// Issue: #364

import type { FcsPr, FcsIssue } from '@/app/api/assessments/[id]/route';
import { Card } from '@/components/ui/card';

interface AssessmentSourceListProps {
  readonly prs: FcsPr[];
  readonly issues: FcsIssue[];
}

export function AssessmentSourceList({ prs, issues }: AssessmentSourceListProps) {
  if (prs.length === 0 && issues.length === 0) return null;

  return (
    <div className="space-y-4">
      {prs.length > 0 && (
        <Card>
          <h2 className="text-heading-sm font-display mb-3">Pull Requests</h2>
          <ul className="space-y-1 list-none p-0">
            {prs.map(pr => (
              <li key={pr.pr_number} className="text-body">
                #{pr.pr_number} {pr.pr_title}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {issues.length > 0 && (
        <Card>
          <h2 className="text-heading-sm font-display mb-3">Issues</h2>
          <ul className="space-y-1 list-none p-0">
            {issues.map(issue => (
              <li key={issue.issue_number} className="text-body">
                #{issue.issue_number} {issue.issue_title}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
