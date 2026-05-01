-- Declarative schema: tables
-- Consolidated from migrations: core_tables, assessment_tables,
-- context_file_patterns, participant_answers_v08.
-- Design reference: docs/design/lld-phase-2-web-auth-db.md §2.1 Declarative schema adoption
-- Issue: #65

-- organisations: tenant registry. One row per GitHub App installation (Story 1.1).
CREATE TABLE organisations (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_org_id              bigint UNIQUE NOT NULL,
  github_org_name            text NOT NULL,
  installation_id            bigint UNIQUE NOT NULL,
  status                     text NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'inactive')),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- org_config: organisation-level default settings (Story 1.4).
-- One row per organisation; created alongside the organisation on app installation.
CREATE TABLE org_config (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL UNIQUE
                              REFERENCES organisations(id) ON DELETE CASCADE,
  prcc_enabled             boolean NOT NULL DEFAULT true,
  fcs_enabled              boolean NOT NULL DEFAULT true,
  enforcement_mode         text NOT NULL DEFAULT 'soft'
                              CHECK (enforcement_mode IN ('soft', 'hard')),
  score_threshold          integer NOT NULL DEFAULT 70
                              CHECK (score_threshold BETWEEN 0 AND 100),
  prcc_question_count      integer NOT NULL DEFAULT 3
                              CHECK (prcc_question_count BETWEEN 3 AND 8),
  fcs_question_count       integer NOT NULL DEFAULT 5
                              CHECK (fcs_question_count BETWEEN 3 AND 8),
  min_pr_size              integer NOT NULL DEFAULT 20
                              CHECK (min_pr_size > 0),
  trivial_commit_threshold integer NOT NULL DEFAULT 5
                              CHECK (trivial_commit_threshold > 0),
  exempt_file_patterns     text[] NOT NULL DEFAULT '{}',
  context_file_patterns    text[] NOT NULL DEFAULT '{}',
  -- Agentic retrieval (V2 Epic 17). See docs/design/lld-v2-e17-agentic-retrieval.md §17.1d.
  tool_use_enabled         boolean NOT NULL DEFAULT false,
  rubric_cost_cap_cents    integer NOT NULL DEFAULT 20
                              CHECK (rubric_cost_cap_cents BETWEEN 0 AND 500),
  retrieval_timeout_seconds integer NOT NULL DEFAULT 120
                              CHECK (retrieval_timeout_seconds BETWEEN 10 AND 600),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- repositories: registered repositories (Story 1.1).
CREATE TABLE repositories (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL
                      REFERENCES organisations(id) ON DELETE CASCADE,
  github_repo_id   bigint NOT NULL,
  github_repo_name text NOT NULL,
  status           text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'inactive')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, github_repo_id)
);

CREATE INDEX idx_repositories_org ON repositories (org_id);

-- repository_config: per-repository settings (Story 1.3).
-- All config columns nullable — null means inherit from org_config.
-- The get_effective_config() function resolves the cascade.
CREATE TABLE repository_config (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL
                              REFERENCES organisations(id) ON DELETE CASCADE,
  repository_id            uuid NOT NULL UNIQUE
                              REFERENCES repositories(id) ON DELETE CASCADE,
  prcc_enabled             boolean,
  fcs_enabled              boolean,
  enforcement_mode         text CHECK (enforcement_mode IN ('soft', 'hard')),
  score_threshold          integer CHECK (score_threshold BETWEEN 0 AND 100),
  prcc_question_count      integer CHECK (prcc_question_count BETWEEN 3 AND 8),
  fcs_question_count       integer CHECK (fcs_question_count BETWEEN 3 AND 8),
  min_pr_size              integer CHECK (min_pr_size > 0),
  trivial_commit_threshold integer CHECK (trivial_commit_threshold > 0),
  exempt_file_patterns     text[],
  context_file_patterns    text[],
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- user_organisations: user <-> org membership junction table (ADR-0004).
-- Populated at login from GitHub API, refreshed on each sign-in.
CREATE TABLE user_organisations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id                  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  github_user_id          bigint NOT NULL,
  github_username         text NOT NULL,
  github_role             text NOT NULL,
  admin_repo_github_ids   bigint[] NOT NULL DEFAULT '{}',  -- ADR-0029 sign-in snapshot
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

CREATE INDEX idx_user_orgs_user ON user_organisations (user_id);
CREATE INDEX idx_user_orgs_org ON user_organisations (org_id);

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
                                'generation_failed', 'rubric_failed',
                                'awaiting_responses',
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
  config_comprehension_depth text NOT NULL DEFAULT 'conceptual'
                              CHECK (config_comprehension_depth IN ('conceptual', 'detailed')),

  -- Skip tracking (Story 2.7)
  skip_reason              text,
  skipped_by               uuid REFERENCES auth.users(id),
  skipped_at               timestamptz,

  -- Invalidation chain (Story 2.8)
  superseded_by            uuid REFERENCES assessments(id),

  -- Rubric-generation observability (V2 Epic 17). Populated on every rubric
  -- generation, regardless of tool-use flag. See docs/design/lld-v2-e17-agentic-retrieval.md §17.1d.
  rubric_input_tokens      integer,
  rubric_output_tokens     integer,
  rubric_tool_call_count   integer,
  rubric_tool_calls        jsonb,
  rubric_duration_ms       integer,

  -- Pipeline error capture (V2 Epic 18). Populated on rubric_failed status.
  -- See docs/design/lld-e18.md §18.1.
  rubric_error_code        text,
  rubric_error_message     text,
  rubric_error_retryable   boolean,

  -- Retry tracking (V2 Epic 18). Incremented server-side on each retry; capped at 3.
  -- See docs/design/lld-e18.md §18.2.
  rubric_retry_count       integer NOT NULL DEFAULT 0,

  -- Pipeline progress tracking (V2 Epic 18). Updated during rubric generation.
  -- See docs/design/lld-e18.md §18.3.
  rubric_progress            text,
  rubric_progress_updated_at timestamptz,

  -- Token budget enforcement (V5 Epic 1). Populated on rubric generation.
  -- See docs/design/lld-v5-e1-token-budget.md §1.3.
  token_budget_applied     boolean,
  truncation_notes         jsonb,

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
  hint             text,
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

-- participant_answers: submitted answers with scoring columns (ADR-0005 Option 4).
-- Multiple attempts per question stored for re-answer flow (Story 2.5).
-- is_reassessment distinguishes original vs reassessment attempts.
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
  attempt_number        integer NOT NULL DEFAULT 1,
  score                 numeric(3,2) CHECK (score IS NULL OR score BETWEEN 0.0 AND 1.0),
  score_rationale       text,
  is_reassessment       boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_answers_attempt_number CHECK (
    attempt_number >= 1
    AND (
      (NOT is_reassessment AND attempt_number <= 3)
      OR is_reassessment
    )
  ),
  CONSTRAINT uq_answers_participant_question_reassessment
    UNIQUE (participant_id, question_id, is_reassessment, attempt_number)
);

CREATE INDEX idx_answers_assessment ON participant_answers (assessment_id);
CREATE INDEX idx_answers_org ON participant_answers (org_id);
CREATE INDEX idx_answers_participant ON participant_answers (participant_id);

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

-- fcs_issue_sources: links FCS assessments to the GitHub issue numbers provided
-- at creation time. Separate from fcs_merged_prs so the retry path can distinguish
-- explicitly provided issues from PRs. Story 19.1 (#287).
CREATE TABLE fcs_issue_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL
                   REFERENCES organisations(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL
                   REFERENCES assessments(id) ON DELETE CASCADE,
  issue_number  integer NOT NULL,
  issue_title   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fcs_issues_assessment ON fcs_issue_sources (assessment_id);

-- projects: V11 organising layer within an org. ADR-0027.
CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_projects_org_lower_name ON projects (org_id, lower(name));
CREATE INDEX idx_projects_org ON projects (org_id);

-- V11 E11.2 T2.1: wire assessments.project_id → projects
-- Must appear after projects is defined; assessments table is earlier in this file.
ALTER TABLE assessments
  ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE assessments
  ADD CONSTRAINT assessments_fcs_requires_project
  CHECK (type <> 'fcs' OR project_id IS NOT NULL);
CREATE INDEX idx_assessments_project ON assessments (project_id);

-- organisation_contexts: per-org (Phase 2) or per-project (V2) prompt customisation.
-- project_id is NULL in Phase 2. V2 adds project-level rows without a data migration.
-- Design reference: docs/design/lld-organisation-context.md §2
-- ADR: docs/adr/0017-organisation-contexts-separate-table.md
-- Issue: #140
CREATE TABLE organisation_contexts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,  -- ADR-0028
  context     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (org_id, project_id)
);

CREATE INDEX idx_org_contexts_org ON organisation_contexts (org_id);

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
