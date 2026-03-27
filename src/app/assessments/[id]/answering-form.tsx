'use client';

// AnsweringForm — client component handling form state, submission, and relevance re-answer flow.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.5
// Issue: #61

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import QuestionCard from '@/components/question-card';
import type { AnswerResult, SubmitResponse } from '@/app/api/assessments/[id]/answers/route';
import type { NaurLayer } from '@/lib/engine/llm/schemas';

interface Question {
  id: string;
  question_number: number;
  naur_layer: NaurLayer;
  question_text: string;
}

interface AssessmentInfo {
  id: string;
  type: 'prcc' | 'fcs';
  feature_name: string | null;
  pr_number: number | null;
  repositories: { github_repo_name: string };
  organisations: { github_org_name: string };
}

interface AnsweringFormProps {
  readonly assessment: AssessmentInfo;
  readonly questions: Question[];
}

interface QuestionListProps {
  readonly questions: Question[];
  readonly answers: Record<string, string>;
  readonly relevanceResults: AnswerResult[] | null;
  readonly onChange: (questionId: string, value: string) => void;
}

function buildAnswerPayload(
  questions: Question[],
  answers: Record<string, string>,
  relevanceResults: AnswerResult[] | null,
): { question_id: string; answer_text: string }[] {
  if (!relevanceResults) {
    return questions.map(q => ({ question_id: q.id, answer_text: answers[q.id] ?? '' }));
  }
  const flaggedIds = new Set(relevanceResults.filter(r => !r.is_relevant).map(r => r.question_id));
  return questions
    .filter(q => flaggedIds.has(q.id))
    .map(q => ({ question_id: q.id, answer_text: answers[q.id] ?? '' }));
}

function isSubmitReady(
  questions: Question[],
  answers: Record<string, string>,
  relevanceResults: AnswerResult[] | null,
): boolean {
  const requiredIds = relevanceResults
    ? relevanceResults.filter(r => !r.is_relevant).map(r => r.question_id)
    : questions.map(q => q.id);
  return requiredIds.every(id => (answers[id] ?? '').trim().length > 0);
}

/**
 * Returns true when the answer field should be read-only.
 * On a re-attempt, only questions flagged as irrelevant remain editable;
 * questions that passed (is_relevant: true) or were not in the relevance batch
 * (result === undefined — not flagged this round) are locked.
 */
function isAnswerLocked(
  questionId: string,
  relevanceResults: AnswerResult[] | null,
): boolean {
  if (!relevanceResults) return false;
  const result = relevanceResults.find(r => r.question_id === questionId);
  // undefined means this question was not flagged — lock it on re-attempt
  return result === undefined || result.is_relevant;
}

/** Sends answers to the API and returns the parsed response. Throws on HTTP or network error. */
async function postAnswers(
  assessmentId: string,
  payload: { question_id: string; answer_text: string }[],
): Promise<SubmitResponse> {
  const res = await fetch(`/api/assessments/${assessmentId}/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((err['message'] as string | undefined) ?? 'Submission failed. Please try again.');
  }
  return res.json() as Promise<SubmitResponse>;
}

function QuestionList({ questions, answers, relevanceResults, onChange }: QuestionListProps) {
  return (
    <ol>
      {questions.map(q => (
        <li key={q.id}>
          <QuestionCard
            questionId={q.id}
            questionNumber={q.question_number}
            naurLayer={q.naur_layer}
            questionText={q.question_text}
            answer={answers[q.id] ?? ''}
            locked={isAnswerLocked(q.id, relevanceResults)}
            relevanceResult={relevanceResults?.find(r => r.question_id === q.id)}
            onChange={onChange}
          />
        </li>
      ))}
    </ol>
  );
}

function useAnsweringForm(assessmentId: string, questions: Question[]) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map(q => [q.id, ''])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [relevanceResults, setRelevanceResults] = useState<AnswerResult[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleChange = useCallback((questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = buildAnswerPayload(questions, answers, relevanceResults);
      const data = await postAnswers(assessmentId, payload);
      if (data.status === 'accepted') {
        router.push(`/assessments/${assessmentId}/submitted`);
      } else {
        setRelevanceResults(data.results);
      }
    } catch (err) {
      console.error('Answer submission failed:', err);
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [assessmentId, answers, questions, relevanceResults, router, submitting]);

  return { answers, submitting, relevanceResults, submitError, handleChange, handleSubmit };
}

export default function AnsweringForm({ assessment, questions }: AnsweringFormProps) {
  const { answers, submitting, relevanceResults, submitError, handleChange, handleSubmit } =
    useAnsweringForm(assessment.id, questions);

  const ready = isSubmitReady(questions, answers, relevanceResults);
  const isReAnswer = relevanceResults !== null;
  const submitLabel = isReAnswer ? 'Resubmit flagged answers' : 'Submit answers';
  const repoName = `${assessment.organisations.github_org_name}/${assessment.repositories.github_repo_name}`;

  return (
    <main>
      <header>
        <span aria-label="Assessment type">{assessment.type.toUpperCase()}</span>
        <h1>{assessment.feature_name ?? `PR #${assessment.pr_number}`}</h1>
        <p>{repoName}</p>
      </header>

      {assessment.type === 'prcc' && (
        <div role="note">
          <p>Complete your PR review before submitting your answers.</p>
        </div>
      )}

      {submitError && (
        <div role="alert">
          <p>{submitError}</p>
          <button type="button" disabled={submitting} onClick={handleSubmit}>Retry</button>
        </div>
      )}

      <QuestionList
        questions={questions}
        answers={answers}
        relevanceResults={relevanceResults}
        onChange={handleChange}
      />

      <button
        type="button"
        disabled={!ready || submitting}
        onClick={handleSubmit}
      >
        {submitting ? 'Submitting…' : submitLabel}
      </button>
    </main>
  );
}
