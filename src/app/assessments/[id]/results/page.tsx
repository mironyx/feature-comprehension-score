// FCS results page — aggregate comprehension score, per-question breakdown, reference answers.
// Accessible to Org Admins and all participants. Reference answers revealed only once all
// participants have submitted and scoring is complete. Issue: #104, #109

import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';
import { shouldRevealReferenceAnswers } from '@/lib/engine/results';
import type { Database } from '@/lib/supabase/types';

type AssessmentRow = Database['public']['Tables']['assessments']['Row'];
type QuestionRow = Database['public']['Tables']['assessment_questions']['Row'];
type NaurLayer = QuestionRow['naur_layer'];

interface AssessmentWithRelations extends AssessmentRow {
  repositories: { github_repo_name: string };
  organisations: { github_org_name: string };
}

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

interface ResultsPageProps {
  readonly params: Promise<{ id: string }>;
}

interface ScoredQuestion {
  id: string;
  question_number: number;
  naur_layer: NaurLayer;
  question_text: string;
  aggregate_score: number | null;
  reference_answer: string;
}

interface ResultsData {
  assessment: AssessmentWithRelations;
  questions: ScoredQuestion[];
  participantTotal: number;
  participantCompleted: number;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchResultsData(assessmentId: string, userId: string): Promise<ResultsData> {
  const adminSupabase = createSecretSupabaseClient();

  const { data: rawAssessment, error: assessmentError } = await adminSupabase
    .from('assessments')
    .select('*, repositories!inner(github_repo_name), organisations!inner(github_org_name)')
    .eq('id', assessmentId)
    .single();

  if (assessmentError || !rawAssessment) notFound();

  const assessment = rawAssessment as unknown as AssessmentWithRelations;

  if (assessment.type !== 'fcs') notFound();

  const [orgMembershipResult, participationResult, questionsResult, participantsResult] =
    await Promise.all([
      adminSupabase
        .from('user_organisations')
        .select('github_role')
        .eq('user_id', userId)
        .eq('org_id', assessment.org_id)
        .maybeSingle(),
      adminSupabase
        .from('assessment_participants')
        .select('id')
        .eq('assessment_id', assessmentId)
        .eq('user_id', userId)
        .maybeSingle(),
      adminSupabase
        .from('assessment_questions')
        .select('id, question_number, naur_layer, question_text, aggregate_score, reference_answer')
        .eq('assessment_id', assessmentId)
        .order('question_number', { ascending: true }),
      adminSupabase
        .from('assessment_participants')
        .select('id, status')
        .eq('assessment_id', assessmentId),
    ]);

  if (orgMembershipResult.error) {
    console.error('results page: org membership query failed:', orgMembershipResult.error);
  }
  if (participationResult.error) {
    console.error('results page: participation query failed:', participationResult.error);
  }

  const isAdmin = (orgMembershipResult.data as { github_role: string } | null)?.github_role === 'admin';
  const isParticipant = !!participationResult.data;

  if (!isAdmin && !isParticipant) notFound();

  const questions = (questionsResult.data ?? []) as ScoredQuestion[];
  const allParticipants = (participantsResult.data ?? []) as { id: string; status: string }[];

  return {
    assessment,
    questions,
    participantTotal: allParticipants.length,
    participantCompleted: allParticipants.filter(p => p.status === 'submitted').length,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPercent(score: number | null): string {
  if (score === null) return '—';
  return `${Math.round(score * 100)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const NAUR_LABELS: Record<NaurLayer, string> = {
  world_to_program: 'World to Program',
  design_justification: 'Design Justification',
  modification_capacity: 'Modification Capacity',
};

const ANSWERS_WITHHELD_MESSAGE =
  'Reference answers will be visible once all participants have submitted and scoring is complete.';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ResultsPage({ params }: ResultsPageProps) {
  const { id: assessmentId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { assessment, questions, participantTotal, participantCompleted } =
    await fetchResultsData(assessmentId, user.id);

  const repoFullName = `${assessment.organisations.github_org_name}/${assessment.repositories.github_repo_name}`;
  const revealAnswers = shouldRevealReferenceAnswers({
    participantCompleted,
    participantTotal,
    aggregateScore: assessment.aggregate_score,
    scoringIncomplete: assessment.scoring_incomplete ?? false,
  });

  return (
    <main>
      <h1>Assessment Results</h1>

      <section>
        <h2>{assessment.feature_name ?? 'Unnamed Feature'}</h2>
        <p>Repository: {repoFullName}</p>
        <p>Date: {formatDate(assessment.created_at)}</p>
        <p>
          Participants: {participantCompleted} of {participantTotal} completed
        </p>
      </section>

      <section>
        <h2>Comprehension Score</h2>
        <p aria-label="Aggregate comprehension score">
          {toPercent(assessment.aggregate_score)}
        </p>
        {assessment.scoring_incomplete && (
          <p>Note: scoring incomplete — some answers could not be scored.</p>
        )}
      </section>

      <section>
        <h2>Question Breakdown</h2>
        {!revealAnswers && <p>{ANSWERS_WITHHELD_MESSAGE}</p>}
        <ol>
          {questions.map(q => (
            <li key={q.id}>
              <p>
                <strong>Q{q.question_number}.</strong> {q.question_text}
              </p>
              <p>Layer: {NAUR_LABELS[q.naur_layer]}</p>
              <p>Aggregate score: {toPercent(q.aggregate_score)}</p>
              {revealAnswers && (
                <details>
                  <summary>Reference answer</summary>
                  <p>{q.reference_answer}</p>
                </details>
              )}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
