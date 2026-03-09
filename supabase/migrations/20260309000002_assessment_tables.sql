-- Migration: assessment tables
-- Creates the assessment lifecycle, questions, participants, answers, and ancillary tables.
-- Design reference: v1-design.md section 4.1

-- assessments: one row per PRCC or FCS assessment.
-- Stores type, lifecycle state, results, and a config snapshot at creation time (Story 1.3).
CREATE TABLE assessments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL
                              REFERENCES organisations(id) ON DELETE CASCADE,
  repository_id            uuid NOT NULL
                              REFERENCES repositories(id) ON DELETE CASCADE,
  type                     text NOT NULL CHECK (type IN ('prcc', 'fcs')),
  status                   text NOT NULL DEFAULT 'created'
                              CHECK (status IN (
                                'created', 'rubric_generation',
                                'generation_failed', 'awaiting_responses',
                                'scoring', 'completed',
                                'invalidated', 'skipped'
                              )),

  -- PR context (PRCC only; null for FCS)
  pr_number                integer,
  pr_head_sha              text,

  -- Feature context (FCS only; null for PRCC)
  feature_name             text,
  feature_description      text,

  -- GitHub Check Run (PRCC only; null for FCS)
  check_run_id             bigint,

  -- Results
  aggregate_score          numeric(5,4),
  scoring_incomplete       boolean NOT NULL DEFAULT false,
  artefact_quality         text,
  conclusion               text CHECK (conclusion IN (
                              'success', 'failure', 'neutral'
                           )),

  -- Config snapshot (captured at creation)
  config_enforcement_mode  text NOT NULL,
  config_score_threshold   integer NOT NULL,
  config_question_count    integer NOT NULL,
  config_min_pr_size       integer NOT NULL,

  -- Skip tracking (Story 2.7)
  skip_reason              text,
  skipped_by               uuid REFERENCES auth.users(id),
  skipped_at               timestamptz,

  -- Invalidation chain (Story 2.8)
  superseded_by            uuid REFERENCES assessments(id),

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_assessments_org_repo
  ON assessments (org_id, repository_id);
CREATE INDEX idx_assessments_repo_pr
  ON assessments (repository_id, pr_number)
  WHERE pr_number IS NOT NULL;
CREATE INDEX idx_assessments_org_status
  ON assessments (org_id, status);

-- assessment_questions: rubric questions generated for an assessment.
-- Immutable after creation. aggregate_score populated during scoring.
CREATE TABLE assessment_questions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL
                      REFERENCES organisations(id) ON DELETE CASCADE,
  assessment_id    uuid NOT NULL
                      REFERENCES assessments(id) ON DELETE CASCADE,
  question_number  integer NOT NULL,
  naur_layer       text NOT NULL CHECK (naur_layer IN (
                      'world_to_program', 'design_justification',
                      'modification_capacity'
                   )),
  question_text    text NOT NULL,
  weight           integer NOT NULL CHECK (weight BETWEEN 1 AND 3),
  reference_answer text NOT NULL,
  aggregate_score  numeric(5,4),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, question_number)
);

CREATE INDEX idx_questions_org ON assessment_questions (org_id);

-- assessment_participants: participant list with contextual role and completion status.
-- user_id is nullable — linked to Supabase user when they authenticate (link_participant()).
CREATE TABLE assessment_participants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL
                      REFERENCES organisations(id) ON DELETE CASCADE,
  assessment_id    uuid NOT NULL
                      REFERENCES assessments(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES auth.users(id),
  github_user_id   bigint NOT NULL,
  github_username  text NOT NULL,
  contextual_role  text NOT NULL CHECK (contextual_role IN (
                      'author', 'reviewer', 'participant'
                   )),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN (
                      'pending', 'submitted', 'removed',
                      'did_not_participate'
                   )),
  submitted_at     timestamptz,
  removed_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, github_user_id)
);

CREATE INDEX idx_participants_user
  ON assessment_participants (user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_participants_org
  ON assessment_participants (org_id);

-- participant_answers: submitted answers.
-- No individual score column — scores are calculated transiently (ADR-0005).
-- Multiple attempts per question stored for re-answer flow (Story 2.5).
CREATE TABLE participant_answers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL
                           REFERENCES organisations(id) ON DELETE CASCADE,
  assessment_id         uuid NOT NULL
                           REFERENCES assessments(id) ON DELETE CASCADE,
  participant_id        uuid NOT NULL
                           REFERENCES assessment_participants(id)
                           ON DELETE CASCADE,
  question_id           uuid NOT NULL
                           REFERENCES assessment_questions(id)
                           ON DELETE CASCADE,
  answer_text           text NOT NULL,
  is_relevant           boolean,
  relevance_explanation text,
  attempt_number        integer NOT NULL DEFAULT 1
                           CHECK (attempt_number BETWEEN 1 AND 3),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, question_id, attempt_number)
);

CREATE INDEX idx_answers_assessment ON participant_answers (assessment_id);
CREATE INDEX idx_answers_org ON participant_answers (org_id);

-- fcs_merged_prs: links FCS assessments to the merged PRs they were created from (Story 3.1).
CREATE TABLE fcs_merged_prs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL
                   REFERENCES organisations(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL
                   REFERENCES assessments(id) ON DELETE CASCADE,
  pr_number     integer NOT NULL,
  pr_title      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fcs_prs_assessment ON fcs_merged_prs (assessment_id);

-- sync_debounce: tracks pending synchronize webhook events during the 60-second debounce window
-- (Story 2.8). Partial unique index ensures only one active record exists per PR.
CREATE TABLE sync_debounce (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL
                   REFERENCES organisations(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL
                   REFERENCES repositories(id) ON DELETE CASCADE,
  pr_number     integer NOT NULL,
  latest_sha    text NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  process_after timestamptz NOT NULL,
  processed     boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX idx_debounce_active
  ON sync_debounce (repository_id, pr_number)
  WHERE NOT processed;
