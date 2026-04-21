// FCS results page — role-based view separation (LLD §3, ADR-0005, Stories 3.4 / 6.2).
// Admin-only viewers see the aggregate comprehension score, per-question aggregates, and
// reference answers (gated). Participant-only viewers see a self-directed view with their
// own per-question scores, Naur layer labels, and submitted answers. Combined viewers see
// the admin aggregate view plus a "My Scores" section. Issue: #104, #109, #297

import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';
import { shouldRevealReferenceAnswers } from '@/lib/engine/results';
import type { Database } from '@/lib/supabase/types';
import type { ToolCallLogEntry } from '@/lib/engine/llm/tools';
import { logger } from '@/lib/logger';
import RetrievalDetailsCard from '@/components/assessment/RetrievalDetailsCard';

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
  hint: string | null;
  aggregate_score: number | null;
  reference_answer: string;
}

interface MyAnswer {
  question_id: string;
  answer_text: string;
  score: number | null;
  score_rationale: string | null;
}

interface ResultsData {
  assessment: AssessmentWithRelations;
  questions: ScoredQuestion[];
  participantTotal: number;
  participantCompleted: number;
  isAdmin: boolean;
  isParticipant: boolean;
  myAnswers: MyAnswer[];
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
        .select('id, question_number, naur_layer, question_text, hint, aggregate_score, reference_answer')
        .eq('assessment_id', assessmentId)
        .order('question_number', { ascending: true }),
      adminSupabase
        .from('assessment_participants')
        .select('id, status')
        .eq('assessment_id', assessmentId),
    ]);

  if (orgMembershipResult.error) {
    logger.error({ err: orgMembershipResult.error }, 'results page: org membership query failed');
  }
  if (participationResult.error) {
    logger.error({ err: participationResult.error }, 'results page: participation query failed');
  }

  const isAdmin = (orgMembershipResult.data as { github_role: string } | null)?.github_role === 'admin';
  const isParticipant = !!participationResult.data;

  if (!isAdmin && !isParticipant) notFound();

  const questions = (questionsResult.data ?? []) as ScoredQuestion[];
  const allParticipants = (participantsResult.data ?? []) as { id: string; status: string }[];
  const myAnswers = isParticipant ? await fetchMyAnswers(assessmentId) : [];

  return {
    assessment,
    questions,
    participantTotal: allParticipants.length,
    participantCompleted: allParticipants.filter(p => p.status === 'submitted').length,
    isAdmin,
    isParticipant,
    myAnswers,
  };
}

// Invariant I4: query the participant's own answers via the user-scoped client so RLS
// restricts the result set to the authenticated user. Never use the admin/secret client.
async function fetchMyAnswers(assessmentId: string): Promise<MyAnswer[]> {
  const userSupabase = await createServerSupabaseClient();
  const { data, error } = await userSupabase
    .from('participant_answers')
    .select('question_id, answer_text, score, score_rationale')
    .eq('assessment_id', assessmentId)
    .eq('is_reassessment', false)
    .order('created_at', { ascending: true });
  if (error) {
    logger.error({ err: error }, 'results page: my answers query failed');
    return [];
  }
  return (data ?? []) as MyAnswer[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPercent(score: number | null): string {
  if (score === null) return '—';
  return `${Math.round(score * 100)}%`;
}

function toDecimalScore(score: number | null): string {
  if (score === null) return '—';
  return score.toFixed(2);
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

const DEPTH_LABELS: Record<'conceptual' | 'detailed', string> = {
  conceptual: 'Conceptual',
  detailed: 'Detailed',
};

const DEPTH_NOTES: Record<'conceptual' | 'detailed', string> = {
  conceptual:
    'This assessment measured reasoning and design understanding. Participants were not expected to recall specific code identifiers.',
  detailed:
    'This assessment measured detailed implementation knowledge including specific types, files, and function signatures.',
};

const ANSWERS_WITHHELD_MESSAGE =
  'Reference answers will be visible once all participants have submitted and scoring is complete.';

// ---------------------------------------------------------------------------
// View components
// ---------------------------------------------------------------------------

interface HeaderSectionProps {
  assessment: AssessmentWithRelations;
  repoFullName: string;
  participantTotal: number;
  participantCompleted: number;
}

function HeaderSection(props: HeaderSectionProps) {
  const { assessment, repoFullName, participantTotal, participantCompleted } = props;
  const depth = assessment.config_comprehension_depth ?? 'conceptual';
  return (
    <section>
      <h2>{assessment.feature_name ?? 'Unnamed Feature'}</h2>
      <p>Repository: {repoFullName}</p>
      <p>Date: {formatDate(assessment.created_at)}</p>
      <p>Participants: {participantCompleted} of {participantTotal} completed</p>
      <p>
        <span className="inline-block rounded-sm bg-surface-raised px-2 py-0.5 text-caption text-text-primary">
          Depth: {DEPTH_LABELS[depth]}
        </span>
      </p>
      <p className="text-caption text-text-secondary">{DEPTH_NOTES[depth]}</p>
    </section>
  );
}

interface AdminAggregateViewProps {
  assessment: AssessmentWithRelations;
  questions: ScoredQuestion[];
  revealAnswers: boolean;
}

function AdminAggregateView({ assessment, questions, revealAnswers }: AdminAggregateViewProps) {
  return (
    <>
      <section>
        <h2>Comprehension Score</h2>
        <p aria-label="Aggregate comprehension score">{toPercent(assessment.aggregate_score)}</p>
        {assessment.scoring_incomplete && (
          <p>Note: scoring incomplete — some answers could not be scored.</p>
        )}
      </section>

      <RetrievalDetailsCard
        rubric_tool_call_count={assessment.rubric_tool_call_count}
        rubric_tool_calls={assessment.rubric_tool_calls as readonly ToolCallLogEntry[] | null}
        rubric_input_tokens={assessment.rubric_input_tokens}
        rubric_output_tokens={assessment.rubric_output_tokens}
        rubric_duration_ms={assessment.rubric_duration_ms}
      />

      <section>
        <h2>Question Breakdown</h2>
        {!revealAnswers && <p>{ANSWERS_WITHHELD_MESSAGE}</p>}
        <ol>
          {questions.map(q => (
            <li key={q.id}>
              <p><strong>Q{q.question_number}.</strong> {q.question_text}</p>
              {q.hint && <p className="text-caption text-text-secondary italic">{q.hint}</p>}
              <p>Layer: {NAUR_LABELS[q.naur_layer]}</p>
              <p>Aggregate score: {toPercent(q.aggregate_score)}</p>
              {assessment.scoring_incomplete && q.aggregate_score === null && (
                <p>Unable to score</p>
              )}
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
    </>
  );
}

interface SelfDirectedViewProps {
  questions: ScoredQuestion[];
  myAnswers: MyAnswer[];
}

function SelfDirectedView({ questions, myAnswers }: SelfDirectedViewProps) {
  return (
    <section>
      <h2>Question Breakdown</h2>
      <ol>
        {questions.map(q => {
          const mine = myAnswers.find(a => a.question_id === q.id);
          return (
            <li key={q.id}>
              <p><strong>Q{q.question_number}.</strong> {q.question_text}</p>
              {q.hint && <p className="text-caption text-text-secondary italic">{q.hint}</p>}
              <p>Layer: {NAUR_LABELS[q.naur_layer]}</p>
              <p>Your score: {toDecimalScore(mine?.score ?? null)}</p>
              {mine && <p>Your answer: {mine.answer_text}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function MyScoresSection({ questions, myAnswers }: SelfDirectedViewProps) {
  return (
    <section>
      <h2>My Scores</h2>
      <ol>
        {questions.map(q => {
          const mine = myAnswers.find(a => a.question_id === q.id);
          return (
            <li key={q.id}>
              <p><strong>Q{q.question_number}.</strong> {q.question_text}</p>
              <p>Your score: {toDecimalScore(mine?.score ?? null)}</p>
              {mine && <p>Your answer: {mine.answer_text}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ResultsPage({ params }: ResultsPageProps) {
  const { id: assessmentId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const data = await fetchResultsData(assessmentId, user.id);
  const { assessment, questions, participantTotal, participantCompleted, isAdmin, isParticipant, myAnswers } = data;

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

      <HeaderSection
        assessment={assessment}
        repoFullName={repoFullName}
        participantTotal={participantTotal}
        participantCompleted={participantCompleted}
      />

      {isAdmin && (
        <AdminAggregateView
          assessment={assessment}
          questions={questions}
          revealAnswers={revealAnswers}
        />
      )}

      {!isAdmin && isParticipant && (
        <SelfDirectedView questions={questions} myAnswers={myAnswers} />
      )}

      {isAdmin && isParticipant && (
        <MyScoresSection questions={questions} myAnswers={myAnswers} />
      )}
    </main>
  );
}
