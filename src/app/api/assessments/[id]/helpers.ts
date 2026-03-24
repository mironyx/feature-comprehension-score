// Pure helpers for GET /api/assessments/[id].
// Extracted from route.ts so they can be unit-tested without exporting from a Next.js route file.

import type { Database } from '@/lib/supabase/types';

type AssessmentStatus = Database['public']['Tables']['assessments']['Row']['status'];
type NaurLayer = Database['public']['Tables']['assessment_questions']['Row']['naur_layer'];
type QuestionRow = Database['public']['Tables']['assessment_questions']['Row'];

export interface FilteredQuestion {
  id: string;
  question_number: number;
  naur_layer: NaurLayer;
  question_text: string;
  weight: number;
  aggregate_score: number | null;
  reference_answer: string | null;
}

/**
 * Filter reference_answer from questions based on assessment type, caller role, and status.
 * Reference answers are only shown to Org Admins viewing a completed FCS assessment.
 * ADR-0005: never shown in participant self-view to prevent gaming on re-assessment.
 */
export function filterQuestionFields(
  questions: QuestionRow[],
  assessmentType: 'prcc' | 'fcs',
  callerRole: 'admin' | 'participant',
  assessmentStatus: AssessmentStatus,
): FilteredQuestion[] {
  const showReference =
    assessmentType === 'fcs' && callerRole === 'admin' && assessmentStatus === 'completed';

  return questions.map(q => ({
    id: q.id,
    question_number: q.question_number,
    naur_layer: q.naur_layer,
    question_text: q.question_text,
    weight: q.weight,
    aggregate_score: q.aggregate_score,
    reference_answer: showReference ? q.reference_answer : null,
  }));
}
