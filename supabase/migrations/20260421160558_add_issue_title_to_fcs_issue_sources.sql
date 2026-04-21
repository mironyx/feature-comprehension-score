alter table "public"."fcs_issue_sources" add column "issue_title" text not null;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.create_fcs_assessment(p_id uuid, p_org_id uuid, p_repository_id uuid, p_feature_name text, p_feature_description text, p_config_enforcement_mode text, p_config_score_threshold integer, p_config_question_count integer, p_config_min_pr_size integer, p_merged_prs jsonb, p_participants jsonb, p_config_comprehension_depth text DEFAULT 'conceptual'::text, p_issue_sources jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;


