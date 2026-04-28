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
import TruncationDetailsCard from '@/components/assessment/TruncationDetailsCard';
import { FormattedText } from '@/components/ui/formatted-text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
  const participationId = (participationResult.data as { id: string } | null)?.id ?? null;
  const isParticipant = participationId !== null;

  if (!isAdmin && !isParticipant) notFound();

  const questions = (questionsResult.data ?? []) as ScoredQuestion[];
  const allParticipants = (participantsResult.data ?? []) as { id: string; status: string }[];
  const myAnswers = participationId ? await fetchMyAnswers(assessmentId, participationId) : [];

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
// restricts the result set to the authenticated user. The explicit participant_id
// filter also defends against the OR'd admin RLS policy leaking other participants'
// rows to an admin-who-is-also-a-participant viewer.
async function fetchMyAnswers(assessmentId: string, participantId: string): Promise<MyAnswer[]> {
  const userSupabase = await createServerSupabaseClient();
  const { data, error } = await userSupabase
    .from('participant_answers')
    .select('question_id, answer_text, score, score_rationale')
    .eq('assessment_id', assessmentId)
    .eq('participant_id', participantId)
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
    <section className="space-y-2">
      <h2 className="text-heading-md">{assessment.feature_name ?? 'Unnamed Feature'}</h2>
      <p className="text-body text-text-secondary">Repository: {repoFullName}</p>
      <p className="text-body text-text-secondary">Date: {formatDate(assessment.created_at)}</p>
      <p className="text-body text-text-secondary">Participants: {participantCompleted} of {participantTotal} completed</p>
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
  myAnswers?: MyAnswer[];
}

// QuestionHeader and PersonalScoresBlock are shared between AdminQuestionCard and
// SelfDirectedView to avoid duplicating the Card/Badge/hint layout structure.

function QuestionHeader({ q }: { q: ScoredQuestion }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-label text-text-secondary">Q{q.question_number}.</span>
        <Badge className="bg-surface-raised text-text-primary">{NAUR_LABELS[q.naur_layer]}</Badge>
      </div>
      <p className="text-body text-text-primary">{q.question_text}</p>
      {q.hint && (
        <p className="border-l-2 border-accent-muted pl-3 text-body text-text-secondary italic">{q.hint}</p>
      )}
    </>
  );
}

function PersonalScoresBlock({ mine }: { mine: MyAnswer | undefined }) {
  return (
    <div className="border-t border-border pt-3 space-y-2">
      <p className="text-label text-text-secondary font-medium">My Scores</p>
      <p className="text-body">Your score: {toDecimalScore(mine?.score ?? null)}</p>
      {mine && <FormattedText content={mine.answer_text} className="text-text-secondary" />}
    </div>
  );
}

interface AdminQuestionCardProps {
  q: ScoredQuestion;
  scoringIncomplete: boolean;
  revealAnswers: boolean;
  mine?: MyAnswer;
  isPersonalised: boolean;
}

// Justification: LLD §3 specified MyScoresSection as a separate section repeating all
// question text. This component merges personal scores inline per question (issue #315
// bug fix) — see ## Design deviations in PR #316.
function AdminQuestionCard({ q, scoringIncomplete, revealAnswers, mine, isPersonalised }: AdminQuestionCardProps) {
  return (
    <Card className="space-y-3">
      <QuestionHeader q={q} />
      <p className="text-body">Aggregate score: {toPercent(q.aggregate_score)}</p>
      {scoringIncomplete && q.aggregate_score === null && (
        <p className="text-body text-text-secondary">Unable to score</p>
      )}
      {revealAnswers && (
        <details>
          <summary className="text-label cursor-pointer">Reference answer</summary>
          <FormattedText content={q.reference_answer} className="mt-2" />
        </details>
      )}
      {isPersonalised && <PersonalScoresBlock mine={mine} />}
    </Card>
  );
}

function AdminAggregateView({ assessment, questions, revealAnswers, myAnswers }: AdminAggregateViewProps) {
  return (
    <>
      <section className="space-y-3">
        <h2 className="text-heading-lg">Comprehension Score</h2>
        <p aria-label="Aggregate comprehension score" className="text-heading-xl font-display">{toPercent(assessment.aggregate_score)}</p>
        {assessment.scoring_incomplete && (
          <p className="text-body text-text-secondary">Note: scoring incomplete — some answers could not be scored.</p>
        )}
      </section>

      <TruncationDetailsCard
        token_budget_applied={assessment.token_budget_applied}
        truncation_notes={assessment.truncation_notes as readonly string[] | null}
        rubric_tool_call_count={assessment.rubric_tool_call_count}
      />
      <RetrievalDetailsCard
        rubric_tool_call_count={assessment.rubric_tool_call_count}
        rubric_tool_calls={assessment.rubric_tool_calls as readonly ToolCallLogEntry[] | null}
        rubric_input_tokens={assessment.rubric_input_tokens}
        rubric_output_tokens={assessment.rubric_output_tokens}
        rubric_duration_ms={assessment.rubric_duration_ms}
      />

      <section className="space-y-4">
        <h2 className="text-heading-lg">Question Breakdown</h2>
        {!revealAnswers && <p className="text-body text-text-secondary">{ANSWERS_WITHHELD_MESSAGE}</p>}
        <ol className="space-y-4 list-none p-0">
          {questions.map(q => (
            <li key={q.id}>
              <AdminQuestionCard
                q={q}
                scoringIncomplete={assessment.scoring_incomplete ?? false}
                revealAnswers={revealAnswers}
                mine={myAnswers?.find(a => a.question_id === q.id)}
                isPersonalised={myAnswers !== undefined}
              />
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
    <section className="space-y-4">
      <h2 className="text-heading-lg">Question Breakdown</h2>
      <ol className="space-y-4 list-none p-0">
        {questions.map(q => {
          const mine = myAnswers.find(a => a.question_id === q.id);
          return (
            <li key={q.id}>
              <Card className="space-y-3">
                <QuestionHeader q={q} />
                <p className="text-body">Your score: {toDecimalScore(mine?.score ?? null)}</p>
                {mine && <FormattedText content={mine.answer_text} className="text-text-secondary" />}
              </Card>
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
    <div className="space-y-section-gap">
      <h1 className="text-heading-xl font-display">Assessment Results</h1>

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
          myAnswers={isParticipant ? myAnswers : undefined}
        />
      )}

      {!isAdmin && isParticipant && (
        <SelfDirectedView questions={questions} myAnswers={myAnswers} />
      )}
    </div>
  );
}
