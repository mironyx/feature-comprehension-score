alter table "public"."assessments" add column "rubric_duration_ms" integer;

alter table "public"."assessments" add column "rubric_input_tokens" integer;

alter table "public"."assessments" add column "rubric_output_tokens" integer;

alter table "public"."assessments" add column "rubric_tool_call_count" integer;

alter table "public"."assessments" add column "rubric_tool_calls" jsonb;

alter table "public"."org_config" add column "rubric_cost_cap_cents" integer not null default 20;

alter table "public"."org_config" add column "tool_use_enabled" boolean not null default false;

alter table "public"."assessments" add constraint "assessments_rubric_duration_ms_check" CHECK (((rubric_duration_ms IS NULL) OR (rubric_duration_ms >= 0))) not valid;

alter table "public"."assessments" validate constraint "assessments_rubric_duration_ms_check";

alter table "public"."assessments" add constraint "assessments_rubric_input_tokens_check" CHECK (((rubric_input_tokens IS NULL) OR (rubric_input_tokens >= 0))) not valid;

alter table "public"."assessments" validate constraint "assessments_rubric_input_tokens_check";

alter table "public"."assessments" add constraint "assessments_rubric_output_tokens_check" CHECK (((rubric_output_tokens IS NULL) OR (rubric_output_tokens >= 0))) not valid;

alter table "public"."assessments" validate constraint "assessments_rubric_output_tokens_check";

alter table "public"."assessments" add constraint "assessments_rubric_tool_call_count_check" CHECK (((rubric_tool_call_count IS NULL) OR (rubric_tool_call_count >= 0))) not valid;

alter table "public"."assessments" validate constraint "assessments_rubric_tool_call_count_check";

alter table "public"."org_config" add constraint "org_config_rubric_cost_cap_cents_check" CHECK ((rubric_cost_cap_cents >= 0)) not valid;

alter table "public"."org_config" validate constraint "org_config_rubric_cost_cap_cents_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.finalise_rubric_v3(p_assessment_id uuid, p_org_id uuid, p_questions jsonb, p_quality_score integer, p_quality_status text, p_quality_dimensions jsonb, p_rubric_input_tokens integer, p_rubric_output_tokens integer, p_rubric_tool_call_count integer, p_rubric_tool_calls jsonb, p_rubric_duration_ms integer)
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
      rubric_input_tokens         = p_rubric_input_tokens,
      rubric_output_tokens        = p_rubric_output_tokens,
      rubric_tool_call_count      = p_rubric_tool_call_count,
      rubric_tool_calls           = p_rubric_tool_calls,
      rubric_duration_ms          = p_rubric_duration_ms,
      updated_at                  = now()
  WHERE id = p_assessment_id;
END;
$function$
;


