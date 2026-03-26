// RelevanceWarning — shown on a question card when the answer was flagged as irrelevant.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.5
// Issue: #61

interface RelevanceWarningProps {
  readonly explanation: string | null;
  readonly attemptsRemaining: number;
}

export default function RelevanceWarning({ explanation, attemptsRemaining }: RelevanceWarningProps) {
  const attemptText = attemptsRemaining === 1 ? '1 attempt remaining' : `${attemptsRemaining} attempts remaining`;

  return (
    <div role="alert" aria-label="Relevance warning">
      <p>Your answer was flagged as not relevant to the question.</p>
      {explanation && <p>{explanation}</p>}
      <p>{attemptText}</p>
    </div>
  );
}
