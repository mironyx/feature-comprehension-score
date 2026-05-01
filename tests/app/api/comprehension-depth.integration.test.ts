// Integration tests for Story 2.1: create_fcs_assessment RPC with comprehension_depth.
// Issue: #222 — feat: add comprehension depth to assessment configuration
// LLD: docs/design/lld-v3-e2-comprehension-depth.md §Story 2.1
//
// Requires a running Supabase instance (npx supabase start). Split from
// comprehension-depth.test.ts so the unit-test job (which excludes
// *.integration.test.ts) does not attempt the DB-backed cases in CI.

import { describe, it, expect, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY } from '../../helpers/supabase-env';
import { createTestOrg, createTestRepo, deleteTestOrg } from '../../helpers/factories';

function secretClient() {
  return createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY);
}

const RPC_SKIP = !SUPABASE_LOCAL_SECRET_KEY;

describe('create_fcs_assessment RPC', () => {
  let orgId: string;

  afterEach(async () => {
    if (!RPC_SKIP && orgId) {
      const svc = secretClient();
      await deleteTestOrg(svc, orgId);
    }
  });

  // Property 13 [lld §Story 2.1 BDD]:
  // When p_config_comprehension_depth is 'detailed', the stored row reflects that value.
  it(
    'stores config_comprehension_depth when provided',
    { skip: RPC_SKIP },
    async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const repoId = await createTestRepo(svc, orgId);
      const { data: proj } = await svc.from('projects').insert({ org_id: orgId, name: 'Depth test project' }).select('id').single();
      const assessmentId = crypto.randomUUID();

      const { error } = await svc.rpc('create_fcs_assessment', {
        p_id: assessmentId,
        p_org_id: orgId,
        p_repository_id: repoId,
        p_feature_name: 'Depth-provided test',
        p_feature_description: 'Integration test for depth storage',
        p_config_enforcement_mode: 'soft',
        p_config_score_threshold: 70,
        p_config_question_count: 5,
        p_config_min_pr_size: 20,
        p_config_comprehension_depth: 'detailed',
        p_merged_prs: [{ pr_number: 1, pr_title: 'PR one' }],
        p_participants: [{ github_user_id: 2001, github_username: 'carol' }],
        p_project_id: proj!.id,
      });

      expect(error).toBeNull();

      const { data: assessment } = await svc
        .from('assessments')
        .select('config_comprehension_depth')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.config_comprehension_depth).toBe('detailed');
    },
  );

  // Property 14 [lld §Story 2.1 BDD, Invariant 2]:
  // When p_config_comprehension_depth is omitted, the stored row defaults to 'conceptual'.
  it(
    'defaults config_comprehension_depth to "conceptual" when omitted',
    { skip: RPC_SKIP },
    async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const repoId2 = await createTestRepo(svc, orgId);
      const { data: proj2 } = await svc.from('projects').insert({ org_id: orgId, name: 'Depth default project' }).select('id').single();
      const assessmentId = crypto.randomUUID();

      const { error } = await svc.rpc('create_fcs_assessment', {
        p_id: assessmentId,
        p_org_id: orgId,
        p_repository_id: repoId2,
        p_feature_name: 'Depth-default test',
        p_feature_description: 'Integration test for depth default',
        p_config_enforcement_mode: 'soft',
        p_config_score_threshold: 70,
        p_config_question_count: 5,
        p_config_min_pr_size: 20,
        // p_config_comprehension_depth intentionally omitted — RPC default applies
        p_merged_prs: [{ pr_number: 2, pr_title: 'PR two' }],
        p_participants: [{ github_user_id: 2002, github_username: 'dan' }],
        p_project_id: proj2!.id,
      });

      expect(error).toBeNull();

      const { data: assessment } = await svc
        .from('assessments')
        .select('config_comprehension_depth')
        .eq('id', assessmentId)
        .single();

      // DB column default is 'conceptual'; RPC parameter default is also 'conceptual'.
      expect(assessment?.config_comprehension_depth).toBe('conceptual');
    },
  );
});
