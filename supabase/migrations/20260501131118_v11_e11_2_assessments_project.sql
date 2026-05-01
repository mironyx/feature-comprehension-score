alter table "public"."assessments" add column "project_id" uuid;

CREATE INDEX idx_assessments_project ON public.assessments USING btree (project_id);

alter table "public"."assessments" add constraint "assessments_fcs_requires_project" CHECK (((type <> 'fcs'::text) OR (project_id IS NOT NULL))) not valid;

alter table "public"."assessments" validate constraint "assessments_fcs_requires_project";

alter table "public"."assessments" add constraint "assessments_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL not valid;

alter table "public"."assessments" validate constraint "assessments_project_id_fkey";


