// RelevanceWarning — shown on a question card when an answer needs to be re-submitted.
// Two variants: 'irrelevant' (LLM judged the answer not relevant) and 'evaluation_failed'
// (LLM call itself failed, e.g. 429). See issue #335.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.5

interface RelevanceWarningProps {
  readonly variant: 'irrelevant' | 'evaluation_failed';
  readonly explanation: string | null;
  readonly attemptsRemaining: number;
}

const HEADLINE: Record<RelevanceWarningProps['variant'], string> = {
  irrelevant: 'Your answer was flagged as not relevant to the question.',
  evaluation_failed: 'We could not evaluate your answer — please try again.',
};

export default function RelevanceWarning({ variant, explanation, attemptsRemaining }: RelevanceWarningProps) {
  const attemptText = attemptsRemaining === 1 ? '1 attempt remaining' : `${attemptsRemaining} attempts remaining`;

  return (
    <div role="alert" aria-label="Relevance warning" className="rounded-md border border-destructive bg-destructive-muted p-card-pad space-y-1">
      <p className="text-body text-destructive font-medium">{HEADLINE[variant]}</p>
      {explanation && <p className="text-body text-text-secondary">{explanation}</p>}
      <p className="text-caption text-text-secondary">{attemptText}</p>
    </div>
  );
}
