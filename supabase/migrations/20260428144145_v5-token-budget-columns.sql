drop function if exists "public"."finalise_rubric"(p_assessment_id uuid, p_org_id uuid, p_questions jsonb, p_rubric_input_tokens integer, p_rubric_output_tokens integer, p_rubric_tool_call_count integer, p_rubric_tool_calls jsonb, p_rubric_duration_ms integer);

alter table "public"."assessments" add column "token_budget_applied" boolean;

alter table "public"."assessments" add column "truncation_notes" jsonb;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.finalise_rubric(p_assessment_id uuid, p_org_id uuid, p_questions jsonb, p_rubric_input_tokens integer, p_rubric_output_tokens integer, p_rubric_tool_call_count integer, p_rubric_tool_calls jsonb, p_rubric_duration_ms integer, p_token_budget_applied boolean DEFAULT NULL::boolean, p_truncation_notes jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;


