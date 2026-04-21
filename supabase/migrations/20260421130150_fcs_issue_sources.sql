drop function if exists "public"."create_fcs_assessment"(p_id uuid, p_org_id uuid, p_repository_id uuid, p_feature_name text, p_feature_description text, p_config_enforcement_mode text, p_config_score_threshold integer, p_config_question_count integer, p_config_min_pr_size integer, p_merged_prs jsonb, p_participants jsonb, p_config_comprehension_depth text);


  create table "public"."fcs_issue_sources" (
    "id" uuid not null default gen_random_uuid(),
    "org_id" uuid not null,
    "assessment_id" uuid not null,
    "issue_number" integer not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."fcs_issue_sources" enable row level security;

CREATE UNIQUE INDEX fcs_issue_sources_pkey ON public.fcs_issue_sources USING btree (id);

CREATE INDEX idx_fcs_issues_assessment ON public.fcs_issue_sources USING btree (assessment_id);

alter table "public"."fcs_issue_sources" add constraint "fcs_issue_sources_pkey" PRIMARY KEY using index "fcs_issue_sources_pkey";

alter table "public"."fcs_issue_sources" add constraint "fcs_issue_sources_assessment_id_fkey" FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE not valid;

alter table "public"."fcs_issue_sources" validate constraint "fcs_issue_sources_assessment_id_fkey";

alter table "public"."fcs_issue_sources" add constraint "fcs_issue_sources_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organisations(id) ON DELETE CASCADE not valid;

alter table "public"."fcs_issue_sources" validate constraint "fcs_issue_sources_org_id_fkey";

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

  INSERT INTO fcs_issue_sources (org_id, assessment_id, issue_number)
  SELECT p_org_id, p_id, (iss->>'issue_number')::integer
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

grant delete on table "public"."fcs_issue_sources" to "anon";

grant insert on table "public"."fcs_issue_sources" to "anon";

grant references on table "public"."fcs_issue_sources" to "anon";

grant select on table "public"."fcs_issue_sources" to "anon";

grant trigger on table "public"."fcs_issue_sources" to "anon";

grant truncate on table "public"."fcs_issue_sources" to "anon";

grant update on table "public"."fcs_issue_sources" to "anon";

grant delete on table "public"."fcs_issue_sources" to "authenticated";

grant insert on table "public"."fcs_issue_sources" to "authenticated";

grant references on table "public"."fcs_issue_sources" to "authenticated";

grant select on table "public"."fcs_issue_sources" to "authenticated";

grant trigger on table "public"."fcs_issue_sources" to "authenticated";

grant truncate on table "public"."fcs_issue_sources" to "authenticated";

grant update on table "public"."fcs_issue_sources" to "authenticated";

grant delete on table "public"."fcs_issue_sources" to "service_role";

grant insert on table "public"."fcs_issue_sources" to "service_role";

grant references on table "public"."fcs_issue_sources" to "service_role";

grant select on table "public"."fcs_issue_sources" to "service_role";

grant trigger on table "public"."fcs_issue_sources" to "service_role";

grant truncate on table "public"."fcs_issue_sources" to "service_role";

grant update on table "public"."fcs_issue_sources" to "service_role";


  create policy "fcs_issues_select_member"
  on "public"."fcs_issue_sources"
  as permissive
  for select
  to public
using ((org_id IN ( SELECT public.get_user_org_ids() AS get_user_org_ids)));



