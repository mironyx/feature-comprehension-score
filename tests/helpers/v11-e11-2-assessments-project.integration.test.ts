// Integration tests for V11 E11.2 T2.1 schema changes.
// Covers: assessments.project_id column, assessments_fcs_requires_project CHECK constraint,
// and ON DELETE SET NULL FK behaviour.
// Issue: #410

import { describe, it, expect, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY } from './supabase-env';
import { createTestOrg, deleteTestOrg, createTestRepo } from './factories';

function secretClient() {
  return createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY);
}

async function insertProject(
  svc: ReturnType<typeof secretClient>,
  orgId: string,
  name = 'Test Project',
): Promise<string> {
  const { data, error } = await svc
    .from('projects')
    .insert({ org_id: orgId, name })
    .select('id')
    .single();
  if (error || !data) throw new Error(`insertProject failed: ${error?.message}`);
  return data.id;
}

async function insertFcsAssessment(
  svc: ReturnType<typeof secretClient>,
  orgId: string,
  repoId: string,
  projectId: string | null,
): Promise<{ id: string; error: { code?: string; message: string } | null }> {
  const { data, error } = await svc
    .from('assessments')
    .insert({
      org_id: orgId,
      repository_id: repoId,
      type: 'fcs',
      status: 'awaiting_responses',
      config_enforcement_mode: 'soft',
      config_score_threshold: 70,
      config_question_count: 5,
      config_min_pr_size: 20,
      feature_name: 'Test feature',
      project_id: projectId,
    })
    .select('id')
    .single();
  return { id: data?.id ?? '', error };
}

async function insertPrccAssessment(
  svc: ReturnType<typeof secretClient>,
  orgId: string,
  repoId: string,
): Promise<{ id: string; error: { code?: string; message: string } | null }> {
  const { data, error } = await svc
    .from('assessments')
    .insert({
      org_id: orgId,
      repository_id: repoId,
      type: 'prcc',
      status: 'awaiting_responses',
      config_enforcement_mode: 'soft',
      config_score_threshold: 70,
      config_question_count: 3,
      config_min_pr_size: 20,
      pr_number: 1,
      pr_head_sha: 'abc123',
      project_id: null,
    })
    .select('id')
    .single();
  return { id: data?.id ?? '', error };
}

describe('schema: assessments.project_id', () => {
  let orgId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
    orgId = '';
  });

  // Property 1 [lld §B.1, invariant I1]:
  // FCS rows must have a non-null project_id; the CHECK rejects NULL.
  it('inserts an FCS row with project_id = <uuid> successfully', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const repoId = await createTestRepo(svc, orgId);
    const projectId = await insertProject(svc, orgId);

    const { error } = await insertFcsAssessment(svc, orgId, repoId, projectId);

    expect(error).toBeNull();
  });

  // Property 2 [lld §B.1, invariant I1]:
  // CHECK constraint assessments_fcs_requires_project rejects FCS rows with NULL project_id.
  it('rejects an FCS row with project_id NULL via the CHECK constraint', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const repoId = await createTestRepo(svc, orgId);

    const { error } = await insertFcsAssessment(svc, orgId, repoId, null);

    expect(error).not.toBeNull();
    expect(error!.code).toBe('23514'); // check_violation
    expect(error!.message).toContain('assessments_fcs_requires_project');
  });

  // Property 3 [lld §B.1, invariant I2]:
  // PRCC rows may have project_id NULL — the CHECK only gates type='fcs'.
  it('inserts a PRCC row with project_id NULL successfully', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const repoId = await createTestRepo(svc, orgId);

    const { error } = await insertPrccAssessment(svc, orgId, repoId);

    expect(error).toBeNull();
  });

  // Property 4 [lld §B.1, story 1.5]:
  // ON DELETE SET NULL: deleting a project nullifies project_id on a PRCC row that had
  // one set. FCS rows are protected by the application layer (Story 1.5 returns 409 on
  // non-empty project delete), so SET NULL applies in practice only to PRCC rows.
  it('cascades to project_id NULL when a referenced project is deleted', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const repoId = await createTestRepo(svc, orgId);
    const projectId = await insertProject(svc, orgId, 'Deletable');

    // Use a PRCC row with project_id set — CHECK constraint permits NULL for PRCC.
    const { data: prcc, error: insErr } = await svc
      .from('assessments')
      .insert({
        org_id: orgId,
        repository_id: repoId,
        type: 'prcc',
        status: 'awaiting_responses',
        config_enforcement_mode: 'soft',
        config_score_threshold: 70,
        config_question_count: 3,
        config_min_pr_size: 20,
        pr_number: 99,
        pr_head_sha: 'deadbeef',
        project_id: projectId,
      })
      .select('id')
      .single();
    expect(insErr).toBeNull();
    expect(prcc).not.toBeNull();
    const assessmentId = prcc!.id;

    const { error: delErr } = await svc.from('projects').delete().eq('id', projectId);
    expect(delErr).toBeNull();

    const { data: row } = await svc
      .from('assessments')
      .select('id, project_id')
      .eq('id', assessmentId)
      .single();

    expect(row?.id).toBe(assessmentId);
    expect(row?.project_id).toBeNull();
  });
});
