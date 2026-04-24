
  create policy "assessments_delete_admin"
  on "public"."assessments"
  as permissive
  for delete
  to public
using (public.is_org_admin(org_id));



