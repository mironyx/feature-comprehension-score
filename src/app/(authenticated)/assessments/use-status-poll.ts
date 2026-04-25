// useStatusPoll — React hook wrapping poll-status for rubric_generation.
// Issue: #207 (progress fields added for V2 Epic 18, Story 18.3).
// Error fields added for #333.
'use client';

import { useState, useEffect } from 'react';
import { startStatusPoll, type PollSnapshot } from './poll-status';

export interface PollResult {
  status: string;
  rubricProgress: string | null;
  rubricProgressUpdatedAt: string | null;
  rubricErrorCode: string | null;
  rubricRetryCount: number;
  rubricErrorRetryable: boolean | null;
  timedOut: boolean;
}

export function useStatusPoll(
  assessmentId: string,
  initialStatus: string,
): PollResult {
  const [snapshot, setSnapshot] = useState<PollSnapshot>({
    status: initialStatus,
    rubricProgress: null,
    rubricProgressUpdatedAt: null,
    rubricErrorCode: null,
    rubricRetryCount: 0,
    rubricErrorRetryable: null,
  });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (initialStatus !== 'rubric_generation') return;

    return startStatusPoll(assessmentId, {
      onStatusChange: setSnapshot,
      onTimeout: () => setTimedOut(true),
    });
  }, [assessmentId, initialStatus]);

  return {
    status: snapshot.status,
    rubricProgress: snapshot.rubricProgress,
    rubricProgressUpdatedAt: snapshot.rubricProgressUpdatedAt,
    rubricErrorCode: snapshot.rubricErrorCode,
    rubricRetryCount: snapshot.rubricRetryCount,
    rubricErrorRetryable: snapshot.rubricErrorRetryable,
    timedOut,
  };
}
