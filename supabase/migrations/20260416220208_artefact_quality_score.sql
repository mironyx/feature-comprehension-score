alter table "public"."assessments" add column "artefact_quality_dimensions" jsonb;

alter table "public"."assessments" add column "artefact_quality_score" integer;

alter table "public"."assessments" add column "artefact_quality_status" text not null default 'pending'::text;

alter table "public"."assessments" add constraint "assessments_artefact_quality_score_check" CHECK (((artefact_quality_score IS NULL) OR ((artefact_quality_score >= 0) AND (artefact_quality_score <= 100)))) not valid;

alter table "public"."assessments" validate constraint "assessments_artefact_quality_score_check";

alter table "public"."assessments" add constraint "assessments_artefact_quality_status_check" CHECK ((artefact_quality_status = ANY (ARRAY['pending'::text, 'success'::text, 'unavailable'::text]))) not valid;

alter table "public"."assessments" validate constraint "assessments_artefact_quality_status_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.finalise_rubric_v2(p_assessment_id uuid, p_org_id uuid, p_questions jsonb, p_quality_score integer, p_quality_status text, p_quality_dimensions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
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
  SET status                      = 'awaiting_responses',
      artefact_quality_score      = p_quality_score,
      artefact_quality_status     = p_quality_status,
      artefact_quality_dimensions = p_quality_dimensions,
      updated_at                  = now()
  WHERE id = p_assessment_id;
END;
$function$
;


