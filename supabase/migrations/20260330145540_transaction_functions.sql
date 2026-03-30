set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.create_fcs_assessment(p_id uuid, p_org_id uuid, p_repository_id uuid, p_feature_name text, p_feature_description text, p_config_enforcement_mode text, p_config_score_threshold integer, p_config_question_count integer, p_config_min_pr_size integer, p_merged_prs jsonb, p_participants jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO assessments (
    id, org_id, repository_id, type, status,
    feature_name, feature_description,
    config_enforcement_mode, config_score_threshold,
    config_question_count, config_min_pr_size
  ) VALUES (
    p_id, p_org_id, p_repository_id, 'fcs', 'rubric_generation',
    p_feature_name, p_feature_description,
    p_config_enforcement_mode, p_config_score_threshold,
    p_config_question_count, p_config_min_pr_size
  );

  INSERT INTO fcs_merged_prs (org_id, assessment_id, pr_number, pr_title)
  SELECT p_org_id, p_id, (pr->>'pr_number')::integer, pr->>'pr_title'
  FROM jsonb_array_elements(p_merged_prs) AS pr;

  INSERT INTO assessment_participants (
    org_id, assessment_id, github_user_id, github_username, contextual_role
  )
  SELECT p_org_id, p_id,
    (pt->>'github_user_id')::bigint, pt->>'github_username', 'participant'
  FROM jsonb_array_elements(p_participants) AS pt;

  RETURN p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.finalise_rubric(p_assessment_id uuid, p_org_id uuid, p_questions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO assessment_questions (
    org_id, assessment_id, question_number,
    naur_layer, question_text, weight, reference_answer
  )
  SELECT p_org_id, p_assessment_id,
    (q->>'question_number')::integer, q->>'naur_layer',
    q->>'question_text', (q->>'weight')::integer, q->>'reference_answer'
  FROM jsonb_array_elements(p_questions) AS q;

  UPDATE assessments
  SET status = 'awaiting_responses', updated_at = now()
  WHERE id = p_assessment_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_installation_created(p_github_org_id bigint, p_github_org_name text, p_installation_id bigint, p_repos jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_repositories_added(p_installation_id bigint, p_repos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.persist_scoring_results(p_assessment_id uuid, p_aggregate_score numeric, p_scoring_incomplete boolean, p_scored jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;


