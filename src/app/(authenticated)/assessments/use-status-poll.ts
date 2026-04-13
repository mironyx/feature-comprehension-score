// useStatusPoll — React hook wrapping poll-status for rubric_generation.
// Issue: #207
'use client';

import { useState, useEffect } from 'react';
import { startStatusPoll } from './poll-status';

export interface PollResult {
  status: string;
  timedOut: boolean;
}

export function useStatusPoll(
  assessmentId: string,
  initialStatus: string,
): PollResult {
  const [status, setStatus] = useState(initialStatus);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (initialStatus !== 'rubric_generation') return;

    return startStatusPoll(assessmentId, {
      onStatusChange: setStatus,
      onTimeout: () => setTimedOut(true),
    });
  }, [assessmentId, initialStatus]);

  return { status, timedOut };
}
