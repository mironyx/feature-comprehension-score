// Evaluation tests for E17 observability schema — issue #243
// Adversarial tests covering schema CHECK constraints that the migration
// (20260417104145_e17_observability_tool_use.sql) declaratively promises
// but the test-author's 18 tests do not exercise.
//
// These are spec-gap tests: the LLD §17.1d BDD specs enumerate happy-path
// and null-field coverage but do not list the constraint violation paths.
// The constraint themselves are structural promises in tables.sql.

import { describe, it, expect, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY } from '../helpers/supabase-env';
import { createTestOrg, createTestRepo, deleteTestOrg } from '../helpers/factories';

function secretClient() {
  return createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY);
}

// ---------------------------------------------------------------------------
// CHECK constraint — assessments.rubric_input_tokens >= 0
//
// tables.sql declares: rubric_input_tokens integer CHECK (rubric_input_tokens IS NULL OR rubric_input_tokens >= 0)
// The migration adds the same constraint with NOT VALID + VALIDATE.
// A negative value inserted directly must be rejected.
// ---------------------------------------------------------------------------

describe('schema check constraints — E17 observability columns', () => {
  let orgId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  it('rejects a negative rubric_input_tokens value (CHECK constraint)', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const repoId = await createTestRepo(svc, orgId);

    const { error } = await svc.from('assessments').insert({
      org_id: orgId,
      repository_id: repoId,
      type: 'fcs',
      status: 'rubric_generation',
      config_enforcement_mode: 'soft',
      config_score_threshold: 70,
      config_question_count: 3,
      config_min_pr_size: 20,
      rubric_input_tokens: -1,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/check/i);
  });

  it('rejects a negative rubric_cost_cap_cents value on org_config (CHECK constraint)', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    // org_config row was created by createTestOrg; attempt to UPDATE with a negative cap.
    const { error } = await svc
      .from('org_config')
      .update({ rubric_cost_cap_cents: -1 })
      .eq('org_id', orgId);

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/check/i);
  });
});
