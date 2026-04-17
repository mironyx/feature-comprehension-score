// Integration tests for org_config threshold columns and RLS.
// Verifies DB-level defaults, CHECK constraints, and admin-only update policy.
// Design reference: docs/requirements/v2-requirements.md §Epic 11 Story 11.2
// Issue: #237
//
// Requires a running local Supabase instance (`npx supabase start`).
// Skip with `npx vitest run --reporter=verbose` when no DB is available.

import { describe, it, expect, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import {
  SUPABASE_LOCAL_URL,
  SUPABASE_LOCAL_SECRET_KEY,
  SUPABASE_LOCAL_PUBLISHABLE_KEY,
} from '../../helpers/supabase-env';
import {
  createTestOrg,
  createTestUserOrg,
  deleteTestOrg,
} from '../../helpers/factories';

// ---------------------------------------------------------------------------
// Client helpers
// ---------------------------------------------------------------------------

function secretClient() {
  return createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY);
}

function publishableClient() {
  return createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_LOCAL_PUBLISHABLE_KEY);
}

function authedClient(accessToken: string) {
  return createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_LOCAL_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createUser(email: string, password = 'Password123!') {
  const svc = secretClient();
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

async function signIn(email: string, password = 'Password123!') {
  const client = publishableClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signIn failed: ${error?.message}`);
  return data.session.access_token;
}

async function deleteUser(userId: string) {
  const svc = secretClient();
  await svc.auth.admin.deleteUser(userId);
}

// ---------------------------------------------------------------------------
// DB-level defaults
// ---------------------------------------------------------------------------

describe('org_config threshold columns — DB defaults', () => {
  const createdOrgIds: string[] = [];

  afterEach(async () => {
    const svc = secretClient();
    for (const id of createdOrgIds) {
      await deleteTestOrg(svc, id);
    }
    createdOrgIds.length = 0;
  });

  it('defaults artefact_quality_threshold to 0.4 when org_config row is created', async () => {
    // LLD §Invariant 9: default artefact_quality_low = 40 (= 0.40 on [0,1] scale).
    const svc = secretClient();
    const orgId = await createTestOrg(svc);
    createdOrgIds.push(orgId);

    const { data, error } = await svc
      .from('org_config')
      .select('artefact_quality_threshold')
      .eq('org_id', orgId)
      .single();

    expect(error).toBeNull();
    expect(Number(data?.artefact_quality_threshold)).toBeCloseTo(0.4);
  });

  it('defaults fcs_low_threshold to 60 when org_config row is created', async () => {
    const svc = secretClient();
    const orgId = await createTestOrg(svc);
    createdOrgIds.push(orgId);

    const { data, error } = await svc
      .from('org_config')
      .select('fcs_low_threshold')
      .eq('org_id', orgId)
      .single();

    expect(error).toBeNull();
    expect(data?.fcs_low_threshold).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// DB-level CHECK constraints
// ---------------------------------------------------------------------------

describe('org_config threshold columns — CHECK constraints', () => {
  let orgId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  it('rejects artefact_quality_threshold below 0', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ artefact_quality_threshold: -0.01 } as never)
      .eq('org_id', orgId);

    expect(error).not.toBeNull();
  });

  it('rejects artefact_quality_threshold above 1', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ artefact_quality_threshold: 1.01 } as never)
      .eq('org_id', orgId);

    expect(error).not.toBeNull();
  });

  it('accepts artefact_quality_threshold at boundary 0', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ artefact_quality_threshold: 0 } as never)
      .eq('org_id', orgId);

    expect(error).toBeNull();
  });

  it('accepts artefact_quality_threshold at boundary 1', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ artefact_quality_threshold: 1 } as never)
      .eq('org_id', orgId);

    expect(error).toBeNull();
  });

  it('rejects fcs_low_threshold below 0', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ fcs_low_threshold: -1 } as never)
      .eq('org_id', orgId);

    expect(error).not.toBeNull();
  });

  it('rejects fcs_low_threshold above 100', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ fcs_low_threshold: 101 } as never)
      .eq('org_id', orgId);

    expect(error).not.toBeNull();
  });

  it('accepts fcs_low_threshold at boundary 0', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ fcs_low_threshold: 0 } as never)
      .eq('org_id', orgId);

    expect(error).toBeNull();
  });

  it('accepts fcs_low_threshold at boundary 100', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ fcs_low_threshold: 100 } as never)
      .eq('org_id', orgId);

    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Persistence — updated thresholds reflected on subsequent reads
// ---------------------------------------------------------------------------

describe('org_config threshold columns — persistence', () => {
  let orgId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  it('persists updated artefact_quality_threshold and reflects it on subsequent read', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error: updateError } = await svc
      .from('org_config')
      .update({ artefact_quality_threshold: 0.8 } as never)
      .eq('org_id', orgId);

    expect(updateError).toBeNull();

    const { data, error } = await svc
      .from('org_config')
      .select('artefact_quality_threshold')
      .eq('org_id', orgId)
      .single();

    expect(error).toBeNull();
    expect(Number(data?.artefact_quality_threshold)).toBeCloseTo(0.8);
  });

  it('persists updated fcs_low_threshold and reflects it on subsequent read', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error: updateError } = await svc
      .from('org_config')
      .update({ fcs_low_threshold: 75 } as never)
      .eq('org_id', orgId);

    expect(updateError).toBeNull();

    const { data, error } = await svc
      .from('org_config')
      .select('fcs_low_threshold')
      .eq('org_id', orgId)
      .single();

    expect(error).toBeNull();
    expect(data?.fcs_low_threshold).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// RLS — only org admins can update thresholds
// ---------------------------------------------------------------------------

describe('org_config threshold columns — RLS', () => {
  let orgId: string;
  let adminUserId: string;
  let memberUserId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
    if (adminUserId) await deleteUser(adminUserId);
    if (memberUserId) await deleteUser(memberUserId);
  });

  it('allows an org admin to update thresholds', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const adminEmail = `admin-rls-${crypto.randomUUID()}@example.com`;
    adminUserId = await createUser(adminEmail);
    await createTestUserOrg(svc, adminUserId, orgId, { github_role: 'admin' });
    const adminToken = await signIn(adminEmail);

    const adminClient = authedClient(adminToken);
    const { error } = await adminClient
      .from('org_config')
      .update({ artefact_quality_threshold: 0.7 } as never)
      .eq('org_id', orgId);

    expect(error).toBeNull();

    // Verify the change was persisted
    const { data } = await svc
      .from('org_config')
      .select('artefact_quality_threshold')
      .eq('org_id', orgId)
      .single();
    expect(Number(data?.artefact_quality_threshold)).toBeCloseTo(0.7);
  });

  it('prevents a non-admin org member from updating thresholds', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const memberEmail = `member-rls-${crypto.randomUUID()}@example.com`;
    memberUserId = await createUser(memberEmail);
    await createTestUserOrg(svc, memberUserId, orgId, { github_role: 'member' });
    const memberToken = await signIn(memberEmail);

    const memberClient = authedClient(memberToken);
    const { error } = await memberClient
      .from('org_config')
      .update({ artefact_quality_threshold: 0.9 } as never)
      .eq('org_id', orgId);

    // RLS should block the update — either an error or zero rows affected
    const original = await svc
      .from('org_config')
      .select('artefact_quality_threshold')
      .eq('org_id', orgId)
      .single();

    const wasBlocked =
      error !== null || Number(original.data?.artefact_quality_threshold) !== 0.9;
    expect(wasBlocked).toBe(true);
  });
});
