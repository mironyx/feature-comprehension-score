// QuestionCard — displays a single assessment question with an answer text area.
// Shows a Naur layer badge and an optional relevance warning on re-attempts.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.5
// Issue: #61

import type { NaurLayer } from '@/lib/engine/llm/schemas';
import type { AnswerResult } from '@/app/api/assessments/[id]/answers/route';
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
  answer,
  locked,
  relevanceResult,
  onChange,
}: QuestionCardProps) {
  const isFlagged = relevanceResult !== undefined && !relevanceResult.is_relevant;

  return (
    <div aria-label={`Question ${questionNumber}`}>
      <div>
        <span>Q{questionNumber}.</span>
        <span aria-label="Naur layer">{NAUR_LABELS[naurLayer]}</span>
      </div>
      <p>{questionText}</p>
      {isFlagged && (
        <RelevanceWarning
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
      />
    </div>
  );
}
