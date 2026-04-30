// Integration tests for V11 E11.1 T1.1 schema changes.
// Covers: projects table constraints, organisation_contexts FK cascade,
// and user_organisations.admin_repo_github_ids column.
// Issue: #394

import { describe, it, expect, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY } from './supabase-env';
import { createTestOrg, deleteTestOrg, createTestUserOrg } from './factories';

function secretClient() {
  return createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY);
}

async function createUser(email: string, password = 'Password123!') {
  const svc = secretClient();
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

async function deleteUser(userId: string) {
  await secretClient().auth.admin.deleteUser(userId);
}

async function insertProject(
  svc: ReturnType<typeof secretClient>,
  orgId: string,
  name: string,
): Promise<string> {
  const { data, error } = await svc
    .from('projects')
    .insert({ org_id: orgId, name })
    .select('id')
    .single();
  if (error || !data) throw new Error(`insertProject failed: ${error?.message}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// describe('schema: projects')
// ---------------------------------------------------------------------------

describe('schema: projects', () => {
  let orgId: string;
  let orgId2: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
    if (orgId2) await deleteTestOrg(svc, orgId2);
    orgId2 = '';
  });

  // Property 1 [lld §B.1]: unique index rejects duplicate lower(name) within same org
  it('rejects two projects with same lower(name) within one org', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    await insertProject(svc, orgId, 'Alpha');
    const { error } = await svc.from('projects').insert({ org_id: orgId, name: 'alpha' });

    expect(error).toBeTruthy();
    expect(error!.code).toBe('23505'); // unique_violation
  });

  // Property 2 [lld §B.1]: same name is allowed across different orgs
  it('allows two projects with same name across different orgs', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    orgId2 = await createTestOrg(svc);

    await insertProject(svc, orgId, 'Shared');
    const { error } = await svc.from('projects').insert({ org_id: orgId2, name: 'Shared' });

    expect(error).toBeNull();
  });

  // Property 3 [lld §B.1, invariant I4]: deleting an org cascades to projects rows
  it('cascades delete from organisations to projects', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const projectId = await insertProject(svc, orgId, 'ToDelete');

    await deleteTestOrg(svc, orgId);
    orgId = ''; // prevent double-delete in afterEach

    const { data } = await svc.from('projects').select('id').eq('id', projectId);
    expect(data).toHaveLength(0);
  });

  // Property 4 [lld §B.1, invariant I4, ADR-0028]: deleting a project cascades to
  // organisation_contexts rows that reference it
  it('cascades delete from projects to organisation_contexts when project_id matches', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const projectId = await insertProject(svc, orgId, 'ContextProject');

    const { error: ctxErr } = await svc
      .from('organisation_contexts')
      .insert({ org_id: orgId, project_id: projectId, context: { notes: 'test' } });
    expect(ctxErr).toBeNull();

    // Delete the project — should cascade to organisation_contexts
    const { error: delErr } = await svc.from('projects').delete().eq('id', projectId);
    expect(delErr).toBeNull();

    const { data: ctxRows } = await svc
      .from('organisation_contexts')
      .select('id')
      .eq('project_id', projectId);
    expect(ctxRows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// describe('schema: user_organisations.admin_repo_github_ids')
// ---------------------------------------------------------------------------

describe('schema: user_organisations.admin_repo_github_ids', () => {
  let orgId: string;
  let userId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
    if (userId) await deleteUser(userId);
  });

  // Property 5 [lld §B.1, ADR-0029]: column defaults to empty array on new rows
  it('defaults to empty array on existing rows after migration', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    userId = await createUser(`admin-repo-default-${Date.now()}@example.com`);
    await createTestUserOrg(svc, userId, orgId);

    const { data, error } = await svc
      .from('user_organisations')
      .select('admin_repo_github_ids')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .single();

    expect(error).toBeNull();
    expect(data?.admin_repo_github_ids).toEqual([]);
  });

  // Property 6 [lld §B.1, ADR-0029]: column accepts a bigint[] update via service role
  it('accepts a bigint[] update via service role', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    userId = await createUser(`admin-repo-update-${Date.now()}@example.com`);
    await createTestUserOrg(svc, userId, orgId);

    const repoIds = [123456789, 987654321];
    const { error } = await svc
      .from('user_organisations')
      .update({ admin_repo_github_ids: repoIds })
      .eq('user_id', userId)
      .eq('org_id', orgId);

    expect(error).toBeNull();

    const { data } = await svc
      .from('user_organisations')
      .select('admin_repo_github_ids')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .single();

    expect(data?.admin_repo_github_ids).toEqual(repoIds);
  });
});
