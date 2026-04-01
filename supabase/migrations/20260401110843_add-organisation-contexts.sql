-- Issue: #140
-- Design reference: docs/design/lld-organisation-context.md §2
-- ADR: docs/adr/0017-organisation-contexts-separate-table.md

  create table "public"."organisation_contexts" (
    "id" uuid not null default gen_random_uuid(),
    "org_id" uuid not null,
    "project_id" uuid,
    "context" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."organisation_contexts" enable row level security;

CREATE INDEX idx_org_contexts_org ON public.organisation_contexts USING btree (org_id);

CREATE UNIQUE INDEX organisation_contexts_org_id_project_id_key ON public.organisation_contexts USING btree (org_id, project_id) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX organisation_contexts_pkey ON public.organisation_contexts USING btree (id);

alter table "public"."organisation_contexts" add constraint "organisation_contexts_pkey" PRIMARY KEY using index "organisation_contexts_pkey";

alter table "public"."organisation_contexts" add constraint "organisation_contexts_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organisations(id) ON DELETE CASCADE not valid;

alter table "public"."organisation_contexts" validate constraint "organisation_contexts_org_id_fkey";

alter table "public"."organisation_contexts" add constraint "organisation_contexts_org_id_project_id_key" UNIQUE using index "organisation_contexts_org_id_project_id_key";

grant delete on table "public"."organisation_contexts" to "anon";

grant insert on table "public"."organisation_contexts" to "anon";

grant references on table "public"."organisation_contexts" to "anon";

grant select on table "public"."organisation_contexts" to "anon";

grant trigger on table "public"."organisation_contexts" to "anon";

grant truncate on table "public"."organisation_contexts" to "anon";

grant update on table "public"."organisation_contexts" to "anon";

grant delete on table "public"."organisation_contexts" to "authenticated";

grant insert on table "public"."organisation_contexts" to "authenticated";

grant references on table "public"."organisation_contexts" to "authenticated";

grant select on table "public"."organisation_contexts" to "authenticated";

grant trigger on table "public"."organisation_contexts" to "authenticated";

grant truncate on table "public"."organisation_contexts" to "authenticated";

grant update on table "public"."organisation_contexts" to "authenticated";

grant delete on table "public"."organisation_contexts" to "service_role";

grant insert on table "public"."organisation_contexts" to "service_role";

grant references on table "public"."organisation_contexts" to "service_role";

grant select on table "public"."organisation_contexts" to "service_role";

grant trigger on table "public"."organisation_contexts" to "service_role";

grant truncate on table "public"."organisation_contexts" to "service_role";

grant update on table "public"."organisation_contexts" to "service_role";


  create policy "org_contexts_delete_admin"
  on "public"."organisation_contexts"
  as permissive
  for delete
  to public
using (public.is_org_admin(org_id));



  create policy "org_contexts_insert_admin"
  on "public"."organisation_contexts"
  as permissive
  for insert
  to public
with check (public.is_org_admin(org_id));



  create policy "org_contexts_select_member"
  on "public"."organisation_contexts"
  as permissive
  for select
  to public
using ((org_id IN ( SELECT public.get_user_org_ids() AS get_user_org_ids)));



  create policy "org_contexts_update_admin"
  on "public"."organisation_contexts"
  as permissive
  for update
  to public
using (public.is_org_admin(org_id));



