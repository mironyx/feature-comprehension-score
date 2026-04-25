// QuestionCard — displays a single assessment question with an answer text area.
// Shows a Naur layer badge and an optional relevance warning on re-attempts.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.5
// Issue: #61

import type { NaurLayer } from '@/lib/engine/llm/schemas';
import type { AnswerResult } from '@/app/api/assessments/[id]/answers/route';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import RelevanceWarning from './relevance-warning';

export const NAUR_LABELS: Record<NaurLayer, string> = {
  world_to_program: 'World to Program',
  design_justification: 'Design Justification',
  modification_capacity: 'Modification Capacity',
};

interface QuestionCardProps {
  readonly questionId: string;
  readonly questionNumber: number;
  readonly naurLayer: NaurLayer;
  readonly questionText: string;
  readonly hint: string | null;
  readonly answer: string;
  readonly locked: boolean;
  readonly relevanceResult: AnswerResult | undefined;
  readonly onChange: (questionId: string, value: string) => void;
}

export default function QuestionCard({
  questionId,
  questionNumber,
  naurLayer,
  questionText,
  hint,
  answer,
  locked,
  relevanceResult,
  onChange,
}: QuestionCardProps) {
  // Distinguish LLM evaluation failure (null) from genuine irrelevance (false). Issue #335.
  const variant: 'irrelevant' | 'evaluation_failed' | null =
    relevanceResult === undefined ? null
      : relevanceResult.is_relevant === false ? 'irrelevant'
      : relevanceResult.is_relevant === null ? 'evaluation_failed'
      : null;

  const inputClasses = 'w-full rounded-sm border border-border bg-background px-3 py-1.5 text-body text-text-primary placeholder:text-text-secondary resize-y disabled:opacity-50';

  return (
    <Card aria-label={`Question ${questionNumber}`} className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-label text-text-secondary">Q{questionNumber}.</span>
        <Badge className="bg-surface-raised text-text-primary" aria-label="Naur layer">{NAUR_LABELS[naurLayer]}</Badge>
      </div>
      <p className="text-body text-text-primary">{questionText}</p>
      {hint && (
        <p className="text-caption text-text-secondary italic">{hint}</p>
      )}
      {variant !== null && relevanceResult && (
        <RelevanceWarning
          variant={variant}
          explanation={relevanceResult.explanation}
          attemptsRemaining={relevanceResult.attempts_remaining}
        />
      )}
      <textarea
        id={`answer-${questionId}`}
        aria-label={`Answer to question ${questionNumber}`}
        value={answer}
        disabled={locked}
        onChange={(e) => onChange(questionId, e.target.value)}
        rows={4}
        className={inputClasses}
      />
    </Card>
  );
}
