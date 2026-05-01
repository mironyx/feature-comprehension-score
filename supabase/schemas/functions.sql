-- Declarative schema: functions
-- Consolidated from migrations: functions, get_effective_config_context_patterns.
-- Design reference: docs/design/lld-phase-2-web-auth-db.md §2.1 Declarative schema adoption
-- Issue: #65

-- get_user_org_ids: returns all org IDs the current user belongs to.
-- SECURITY DEFINER avoids circular RLS dependency on user_organisations.
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id
  FROM user_organisations
  WHERE user_id = auth.uid()
$$;

-- is_org_admin: checks whether the current user is an admin/owner of a given org.
CREATE OR REPLACE FUNCTION is_org_admin(check_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_organisations
    WHERE user_id = auth.uid()
      AND org_id = check_org_id
      AND github_role IN ('admin', 'owner')
  )
$$;

-- is_assessment_participant: checks whether the current user is an active participant
-- on a given assessment.
CREATE OR REPLACE FUNCTION is_assessment_participant(check_assessment_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM assessment_participants
    WHERE assessment_id = check_assessment_id
      AND user_id = auth.uid()
      AND status != 'removed'
  )
$$;

-- link_participant: links a Supabase user to their assessment_participants record
-- when they first access an assessment. SECURITY DEFINER bypasses RLS because the
-- participant record has no user_id yet. Safe: only links auth.uid() to a record
-- matching the provided github_user_id — cannot impersonate another user.
CREATE OR REPLACE FUNCTION link_participant(
  p_assessment_id  uuid,
  p_github_user_id bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_id uuid;
BEGIN
  UPDATE assessment_participants
  SET user_id = auth.uid(), updated_at = now()
  WHERE assessment_id = p_assessment_id
    AND github_user_id = p_github_user_id
    AND user_id IS NULL
  RETURNING id INTO p_id;

  RETURN p_id;
END;
$$;

-- link_all_participants: bulk-links all unlinked assessment_participants rows
-- for a given user at login time. Resolves the chicken-and-egg problem where
-- participants added by GitHub username cannot discover their assessments
-- until visiting the direct link. Called from the auth callback.
-- Issue: #206
CREATE OR REPLACE FUNCTION link_all_participants(
  p_user_id        uuid,
  p_github_user_id bigint
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE assessment_participants
  SET user_id = p_user_id, updated_at = now()
  WHERE github_user_id = p_github_user_id
    AND user_id IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- get_effective_config: resolves effective repository configuration by coalescing
-- per-repo overrides with org-level defaults (section 3.4).
-- Includes context_file_patterns (added in migration context_file_patterns, issue #45).
CREATE OR REPLACE FUNCTION get_effective_config(repo_id uuid)
RETURNS TABLE (
  prcc_enabled             boolean,
  fcs_enabled              boolean,
  enforcement_mode         text,
  score_threshold          integer,
  prcc_question_count      integer,
  fcs_question_count       integer,
  min_pr_size              integer,
  trivial_commit_threshold integer,
  exempt_file_patterns     text[],
  context_file_patterns    text[]
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(rc.prcc_enabled, oc.prcc_enabled),
    COALESCE(rc.fcs_enabled, oc.fcs_enabled),
    COALESCE(rc.enforcement_mode, oc.enforcement_mode),
    COALESCE(rc.score_threshold, oc.score_threshold),
    COALESCE(rc.prcc_question_count, oc.prcc_question_count),
    COALESCE(rc.fcs_question_count, oc.fcs_question_count),
    COALESCE(rc.min_pr_size, oc.min_pr_size),
    COALESCE(rc.trivial_commit_threshold, oc.trivial_commit_threshold),
    COALESCE(rc.exempt_file_patterns, oc.exempt_file_patterns),
    COALESCE(rc.context_file_patterns, oc.context_file_patterns)
  FROM repositories r
  JOIN org_config oc ON oc.org_id = r.org_id
  LEFT JOIN repository_config rc ON rc.repository_id = r.id
  WHERE r.id = repo_id
$$;

-- ---------------------------------------------------------------------------
-- Transactional write functions (issue #118)
-- Wrap multi-step DB writes in atomic operations so partial failure
-- cannot leave the database in an inconsistent state.
-- ---------------------------------------------------------------------------

-- handle_installation_created: atomically upserts organisation, org_config,
-- and repositories when a GitHub App installation is created.
CREATE OR REPLACE FUNCTION handle_installation_created(
  p_github_org_id   bigint,
  p_github_org_name text,
  p_installation_id bigint,
  p_repos           jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_now    timestamptz := now();
BEGIN
  INSERT INTO organisations (github_org_id, github_org_name, installation_id, status, updated_at)
  VALUES (p_github_org_id, p_github_org_name, p_installation_id, 'active', v_now)
  ON CONFLICT (github_org_id) DO UPDATE SET
    github_org_name = EXCLUDED.github_org_name,
    installation_id = EXCLUDED.installation_id,
    status          = EXCLUDED.status,
    updated_at      = EXCLUDED.updated_at
  RETURNING id INTO v_org_id;

  INSERT INTO org_config (org_id, updated_at)
  VALUES (v_org_id, v_now)
  ON CONFLICT (org_id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  IF jsonb_array_length(p_repos) > 0 THEN
    INSERT INTO repositories (org_id, github_repo_id, github_repo_name, status, updated_at)
    SELECT v_org_id, (r->>'id')::bigint, r->>'full_name', 'active', v_now
    FROM jsonb_array_elements(p_repos) AS r
    ON CONFLICT (org_id, github_repo_id) DO UPDATE SET
      github_repo_name = EXCLUDED.github_repo_name,
      status           = EXCLUDED.status,
      updated_at       = EXCLUDED.updated_at;
  END IF;

  RETURN v_org_id;
END;
$$;

-- handle_repositories_added: atomically looks up org by installation_id
-- and upserts repositories. Raises if installation not found.
CREATE OR REPLACE FUNCTION handle_repositories_added(
  p_installation_id bigint,
  p_repos           jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_now    timestamptz := now();
BEGIN
  SELECT id INTO v_org_id
  FROM organisations
  WHERE installation_id = p_installation_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No org found for installation %', p_installation_id;
  END IF;

  INSERT INTO repositories (org_id, github_repo_id, github_repo_name, status, updated_at)
  SELECT v_org_id, (r->>'id')::bigint, r->>'full_name', 'active', v_now
  FROM jsonb_array_elements(p_repos) AS r
  ON CONFLICT (org_id, github_repo_id) DO UPDATE SET
    github_repo_name = EXCLUDED.github_repo_name,
    status           = EXCLUDED.status,
    updated_at       = EXCLUDED.updated_at;
END;
$$;

-- create_fcs_assessment: atomically creates an FCS assessment with its
-- merged PRs, issue sources, and participants in a single transaction.
CREATE OR REPLACE FUNCTION create_fcs_assessment(
  p_id                          uuid,
  p_org_id                      uuid,
  p_repository_id               uuid,
  p_feature_name                text,
  p_feature_description         text,
  p_config_enforcement_mode     text,
  p_config_score_threshold      integer,
  p_config_question_count       integer,
  p_config_min_pr_size          integer,
  p_merged_prs                  jsonb,
  p_participants                jsonb,
  p_config_comprehension_depth  text DEFAULT 'conceptual',
  p_issue_sources               jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO assessments (
    id, org_id, repository_id, type, status,
    feature_name, feature_description,
    config_enforcement_mode, config_score_threshold,
    config_question_count, config_min_pr_size,
    config_comprehension_depth
  ) VALUES (
    p_id, p_org_id, p_repository_id, 'fcs', 'rubric_generation',
    p_feature_name, p_feature_description,
    p_config_enforcement_mode, p_config_score_threshold,
    p_config_question_count, p_config_min_pr_size,
    p_config_comprehension_depth
  );

  INSERT INTO fcs_merged_prs (org_id, assessment_id, pr_number, pr_title)
  SELECT p_org_id, p_id, (pr->>'pr_number')::integer, pr->>'pr_title'
  FROM jsonb_array_elements(p_merged_prs) AS pr;

  INSERT INTO fcs_issue_sources (org_id, assessment_id, issue_number, issue_title)
  SELECT p_org_id, p_id, (iss->>'issue_number')::integer, iss->>'issue_title'
  FROM jsonb_array_elements(p_issue_sources) AS iss;

  INSERT INTO assessment_participants (
    org_id, assessment_id, github_user_id, github_username, contextual_role
  )
  SELECT p_org_id, p_id,
    (pt->>'github_user_id')::bigint, pt->>'github_username', 'participant'
  FROM jsonb_array_elements(p_participants) AS pt;

  RETURN p_id;
END;
$$;

-- finalise_rubric: atomically stores generated rubric questions and
-- transitions the assessment to awaiting_responses.
CREATE OR REPLACE FUNCTION finalise_rubric(
  p_assessment_id uuid,
  p_org_id        uuid,
  p_questions     jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- ADR-0025: verify ownership before any writes so the function is atomic.
  IF NOT EXISTS (SELECT 1 FROM assessments WHERE id = p_assessment_id AND org_id = p_org_id) THEN
    RAISE EXCEPTION 'assessment % does not belong to org %', p_assessment_id, p_org_id;
  END IF;

  INSERT INTO assessment_questions (
    org_id, assessment_id, question_number,
    naur_layer, question_text, weight, reference_answer, hint
  )
  SELECT p_org_id, p_assessment_id,
    (q->>'question_number')::integer, q->>'naur_layer',
    q->>'question_text', (q->>'weight')::integer, q->>'reference_answer',
    q->>'hint'
  FROM jsonb_array_elements(p_questions) AS q;

  UPDATE assessments
  SET status = 'awaiting_responses', updated_at = now()
  WHERE id = p_assessment_id
    AND org_id = p_org_id;
END;
$$;

-- finalise_rubric (observability overload): inserts questions, updates status,
-- and persists rubric-generation observability fields in a single transaction.
-- V2 Epic 17. See docs/design/lld-v2-e17-agentic-retrieval.md §17.1d.
-- V5 Epic 1 Story 1.3: adds p_token_budget_applied and p_truncation_notes (#330).
CREATE OR REPLACE FUNCTION finalise_rubric(
  p_assessment_id          uuid,
  p_org_id                 uuid,
  p_questions              jsonb,
  p_rubric_input_tokens    integer,
  p_rubric_output_tokens   integer,
  p_rubric_tool_call_count integer,
  p_rubric_tool_calls      jsonb,
  p_rubric_duration_ms     integer,
  p_token_budget_applied   boolean DEFAULT NULL,
  p_truncation_notes       jsonb   DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- ADR-0025: verify ownership before any writes so the function is atomic.
  IF NOT EXISTS (SELECT 1 FROM assessments WHERE id = p_assessment_id AND org_id = p_org_id) THEN
    RAISE EXCEPTION 'assessment % does not belong to org %', p_assessment_id, p_org_id;
  END IF;

  INSERT INTO assessment_questions (
    org_id, assessment_id, question_number,
    naur_layer, question_text, weight, reference_answer, hint
  )
  SELECT p_org_id, p_assessment_id,
    (q->>'question_number')::integer, q->>'naur_layer',
    q->>'question_text', (q->>'weight')::integer, q->>'reference_answer',
    q->>'hint'
  FROM jsonb_array_elements(p_questions) AS q;

  UPDATE assessments
  SET status                     = 'awaiting_responses',
      rubric_input_tokens        = p_rubric_input_tokens,
      rubric_output_tokens       = p_rubric_output_tokens,
      rubric_tool_call_count     = p_rubric_tool_call_count,
      rubric_tool_calls          = p_rubric_tool_calls,
      rubric_duration_ms         = p_rubric_duration_ms,
      rubric_progress            = NULL,
      rubric_progress_updated_at = NULL,
      token_budget_applied       = p_token_budget_applied,
      truncation_notes           = p_truncation_notes,
      updated_at                 = now()
  WHERE id = p_assessment_id
    AND org_id = p_org_id;
END;
$$;

-- persist_scoring_results: atomically updates the assessment aggregate score
-- and individual answer scores after scoring completes.
CREATE OR REPLACE FUNCTION persist_scoring_results(
  p_assessment_id     uuid,
  p_aggregate_score   numeric,
  p_scoring_incomplete boolean,
  p_scored            jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE assessments
  SET aggregate_score   = p_aggregate_score,
      scoring_incomplete = p_scoring_incomplete,
      status            = 'completed',
      updated_at        = now()
  WHERE id = p_assessment_id;

  UPDATE participant_answers pa
  SET score          = (s->>'score')::numeric,
      score_rationale = s->>'rationale'
  FROM jsonb_array_elements(p_scored) AS s
  WHERE pa.participant_id = (s->>'participant_id')::uuid
    AND pa.question_id    = (s->>'question_id')::uuid
    AND pa.is_reassessment = false;
END;
$$;

-- patch_project: atomically updates project name/description and/or context fields
-- for a project owned by p_org_id. Raises 'project_not_found' if the project does
-- not exist in that org (covers both 404 and cross-org access — callers cannot
-- distinguish which). The context merge uses jsonb || so existing keys not present
-- in p_context_fields are preserved (Invariant I7).
-- Issue: #397
CREATE OR REPLACE FUNCTION patch_project(
  p_project_id     uuid,
  p_org_id         uuid,
  p_project_fields jsonb,
  p_context_fields jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_row projects%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id AND org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'project_not_found';
  END IF;

  IF p_project_fields IS NOT NULL AND p_project_fields != '{}'::jsonb THEN
    UPDATE projects
    SET
      name        = COALESCE(p_project_fields->>'name', name),
      description = COALESCE(p_project_fields->>'description', description),
      updated_at  = now()
    WHERE id = p_project_id
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM projects WHERE id = p_project_id;
  END IF;

  IF p_context_fields IS NOT NULL AND p_context_fields != '{}'::jsonb THEN
    INSERT INTO organisation_contexts (org_id, project_id, context)
    VALUES (p_org_id, p_project_id, p_context_fields)
    ON CONFLICT (org_id, project_id) DO UPDATE
      SET context    = organisation_contexts.context || EXCLUDED.context,
          updated_at = now();
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- handle_installation_deleted: atomically deactivates the organisation and
-- deletes all user_organisations rows for the affected installation.
-- Issue #180, design: docs/design/lld-onboarding-auth-webhooks.md §3.1
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_installation_deleted(
  p_installation_id bigint
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_now    timestamptz := now();
BEGIN
  SELECT id INTO v_org_id
  FROM organisations
  WHERE installation_id = p_installation_id;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE organisations
    SET status = 'inactive', updated_at = v_now
    WHERE id = v_org_id;

  DELETE FROM user_organisations
    WHERE org_id = v_org_id;
END;
$$;
