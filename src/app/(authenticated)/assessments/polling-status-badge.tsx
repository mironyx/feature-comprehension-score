// PollingStatusBadge — wraps StatusBadge with auto-refresh for rubric_generation.
// Displays pipeline progress label and stale warning (V2 Epic 18, Story 18.3).
// Renders retry button client-side after polling detects rubric_failed (#333).
// Issue: #207, #274, #333
'use client';

import { StatusBadge } from '@/components/ui/status-badge';
import { RetryButton } from './retry-button';
import { useStatusPoll } from './use-status-poll';
import { isTerminalStatus } from './poll-status';
import { getProgressLabel, isProgressStale } from './progress-labels';

interface Props {
  assessmentId: string;
  initialStatus: string;
  admin: boolean;
  maxRetries: number;
}

export function PollingStatusBadge({ assessmentId, initialStatus, admin, maxRetries }: Props) {
  const { status, rubricProgress, rubricProgressUpdatedAt,
          rubricErrorCode, rubricRetryCount, rubricErrorRetryable, timedOut } =
    useStatusPoll(assessmentId, initialStatus);

  const progressLabel = getProgressLabel(rubricProgress);
  const showStale =
    !isTerminalStatus(status) && isProgressStale(rubricProgressUpdatedAt);

  return (
    <>
      <StatusBadge status={status} />
      {progressLabel && !showStale && (
        <span style={{ fontSize: '0.8em', color: '#9ca3af', marginLeft: '0.5em' }}>
          {progressLabel}
        </span>
      )}
      {showStale && (
        <span role="alert" style={{ fontSize: '0.8em', color: '#f59e0b', marginLeft: '0.5em' }}>
          Generation may be stalled — consider retrying
        </span>
      )}
      {timedOut && (
        <span role="alert" style={{ fontSize: '0.8em', color: '#f59e0b' }}>
          {' '}(refresh page to check status)
        </span>
      )}
      {admin && status === 'rubric_failed' && (
        <>
          {rubricErrorCode && (
            <span className="text-caption text-text-secondary">{rubricErrorCode}</span>
          )}
          <RetryButton
            assessmentId={assessmentId}
            retryCount={rubricRetryCount}
            maxRetries={maxRetries}
            errorRetryable={rubricErrorRetryable}
          />
        </>
      )}
    </>
  );
}
