// PollingStatusBadge — wraps StatusBadge with auto-refresh for rubric_generation.
// Issue: #207
'use client';

import { StatusBadge } from '@/components/ui/status-badge';
import { useStatusPoll } from './use-status-poll';

interface Props {
  assessmentId: string;
  initialStatus: string;
}

export function PollingStatusBadge({ assessmentId, initialStatus }: Props) {
  const { status, timedOut } = useStatusPoll(assessmentId, initialStatus);

  return (
    <>
      <StatusBadge status={status} />
      {timedOut && (
        <span role="alert" style={{ fontSize: '0.8em', color: '#f59e0b' }}>
          {' '}(refresh page to check status)
        </span>
      )}
    </>
  );
}
