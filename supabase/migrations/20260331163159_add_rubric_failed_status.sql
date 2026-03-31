-- Issue: #132 — Add rubric_failed status for admin retry on failed rubric generation.
alter table "public"."assessments" drop constraint "assessments_status_check";

alter table "public"."assessments" add constraint "assessments_status_check" CHECK ((status = ANY (ARRAY['created'::text, 'rubric_generation'::text, 'generation_failed'::text, 'rubric_failed'::text, 'awaiting_responses'::text, 'scoring'::text, 'completed'::text, 'invalidated'::text, 'skipped'::text]))) not valid;

alter table "public"."assessments" validate constraint "assessments_status_check";


