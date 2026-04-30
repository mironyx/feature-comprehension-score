
  create table "public"."projects" (
    "id" uuid not null default gen_random_uuid(),
    "org_id" uuid not null,
    "name" text not null,
    "description" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."projects" enable row level security;

alter table "public"."user_organisations" add column "admin_repo_github_ids" bigint[] not null default '{}'::bigint[];

CREATE INDEX idx_projects_org ON public.projects USING btree (org_id);

CREATE UNIQUE INDEX projects_pkey ON public.projects USING btree (id);

CREATE UNIQUE INDEX uq_projects_org_lower_name ON public.projects USING btree (org_id, lower(name));

alter table "public"."projects" add constraint "projects_pkey" PRIMARY KEY using index "projects_pkey";

alter table "public"."organisation_contexts" add constraint "organisation_contexts_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."organisation_contexts" validate constraint "organisation_contexts_project_id_fkey";

alter table "public"."projects" add constraint "projects_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 200))) not valid;

alter table "public"."projects" validate constraint "projects_name_check";

alter table "public"."projects" add constraint "projects_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organisations(id) ON DELETE CASCADE not valid;

alter table "public"."projects" validate constraint "projects_org_id_fkey";

grant delete on table "public"."projects" to "anon";

grant insert on table "public"."projects" to "anon";

grant references on table "public"."projects" to "anon";

grant select on table "public"."projects" to "anon";

grant trigger on table "public"."projects" to "anon";

grant truncate on table "public"."projects" to "anon";

grant update on table "public"."projects" to "anon";

grant delete on table "public"."projects" to "authenticated";

grant insert on table "public"."projects" to "authenticated";

grant references on table "public"."projects" to "authenticated";

grant select on table "public"."projects" to "authenticated";

grant trigger on table "public"."projects" to "authenticated";

grant truncate on table "public"."projects" to "authenticated";

grant update on table "public"."projects" to "authenticated";

grant delete on table "public"."projects" to "service_role";

grant insert on table "public"."projects" to "service_role";

grant references on table "public"."projects" to "service_role";

grant select on table "public"."projects" to "service_role";

grant trigger on table "public"."projects" to "service_role";

grant truncate on table "public"."projects" to "service_role";

grant update on table "public"."projects" to "service_role";


  create policy "projects_select_member"
  on "public"."projects"
  as permissive
  for select
  to public
using ((org_id IN ( SELECT public.get_user_org_ids() AS get_user_org_ids)));



