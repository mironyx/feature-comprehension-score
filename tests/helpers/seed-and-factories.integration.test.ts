import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY } from './supabase-env';
import {
  createTestOrg,
  createTestRepo,
  createTestAssessment,
  createTestQuestion,
  createTestParticipant,
  createTestAnswer,
} from './factories';
import { resetDatabase } from './db';

// ---------------------------------------------------------------------------
// Fixed seed UUIDs (set in supabase/seed.sql)
// ---------------------------------------------------------------------------

const SEED_ACME_ORG_ID = '00000000-0000-0000-0000-000000000001';
const SEED_BETA_ORG_ID = '00000000-0000-0000-0000-000000000002';
// Auth users use a distinct prefix (a0000000-*) to avoid confusion with org UUIDs
const SEED_ALICE_ID = 'a0000000-0000-0000-0000-000000000001';
const SEED_BOB_ID = 'a0000000-0000-0000-0000-000000000002';
const SEED_CAROL_ID = 'a0000000-0000-0000-0000-000000000003';
const SEED_REPO_API_ID = '00000000-0000-0000-0001-000000000001';
const SEED_REPO_WEB_ID = '00000000-0000-0000-0001-000000000002';
const SEED_REPO_PLATFORM_ID = '00000000-0000-0000-0001-000000000003';

function secretClient() {
  return createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY);
}

// ---------------------------------------------------------------------------
// describe('Seed data')
// Verifies specific seed rows exist after `npx supabase db reset`.
// Queries by fixed UUID so results are stable regardless of other test data.
// ---------------------------------------------------------------------------

describe('Seed data', () => {
  // Re-insert seed rows before each run so these tests are idempotent.
  // The resetDatabase test (below) clears all org data; without this beforeAll
  // a second local run would find empty tables.
  // Auth users (Alice/Bob/Carol) are not cleared by resetDatabase so they
  // always exist after the initial `supabase db reset` or `supabase start`.
  beforeAll(async () => {
    const svc = secretClient();

    await svc.from('organisations').upsert(
      [
        {
          id: SEED_ACME_ORG_ID,
          github_org_id: 1001,
          github_org_name: 'acme-corp',
          installation_id: 9001,
          status: 'active',
        },
        {
          id: SEED_BETA_ORG_ID,
          github_org_id: 1002,
          github_org_name: 'beta-inc',
          installation_id: 9002,
          status: 'active',
        },
      ],
      { onConflict: 'id' },
    );

    await svc.from('org_config').upsert(
      [
        {
          org_id: SEED_ACME_ORG_ID,
          enforcement_mode: 'soft',
          score_threshold: 70,
          prcc_question_count: 3,
          fcs_question_count: 5,
        },
        {
          org_id: SEED_BETA_ORG_ID,
          enforcement_mode: 'hard',
          score_threshold: 80,
          prcc_question_count: 4,
          fcs_question_count: 5,
        },
      ],
      { onConflict: 'org_id' },
    );

    await svc.from('repositories').upsert(
      [
        {
          id: SEED_REPO_API_ID,
          org_id: SEED_ACME_ORG_ID,
          github_repo_id: 2001,
          github_repo_name: 'api',
          status: 'active',
        },
        {
          id: SEED_REPO_WEB_ID,
          org_id: SEED_ACME_ORG_ID,
          github_repo_id: 2002,
          github_repo_name: 'web',
          status: 'active',
        },
        {
          id: SEED_REPO_PLATFORM_ID,
          org_id: SEED_BETA_ORG_ID,
          github_repo_id: 2003,
          github_repo_name: 'platform',
          status: 'active',
        },
      ],
      { onConflict: 'id' },
    );

    await svc.from('user_organisations').upsert(
      [
        {
          user_id: SEED_ALICE_ID,
          org_id: SEED_ACME_ORG_ID,
          github_user_id: 10001,
          github_username: 'alice',
          github_role: 'admin',
        },
        {
          user_id: SEED_BOB_ID,
          org_id: SEED_ACME_ORG_ID,
          github_user_id: 10002,
          github_username: 'bob',
          github_role: 'member',
        },
        {
          user_id: SEED_CAROL_ID,
          org_id: SEED_BETA_ORG_ID,
          github_user_id: 10003,
          github_username: 'carol',
          github_role: 'admin',
        },
      ],
      { onConflict: 'user_id,org_id' },
    );
  });

  describe('Given seed data exists', () => {
    it('then 2 organisations exist', async () => {
      const svc = secretClient();
      const { data, error } = await svc
        .from('organisations')
        .select('id')
        .in('id', [SEED_ACME_ORG_ID, SEED_BETA_ORG_ID]);
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
    });

    it('then 3 repositories exist', async () => {
      const svc = secretClient();
      const { data, error } = await svc
        .from('repositories')
        .select('id')
        .in('id', [SEED_REPO_API_ID, SEED_REPO_WEB_ID, SEED_REPO_PLATFORM_ID]);
      expect(error).toBeNull();
      expect(data).toHaveLength(3);
    });

    it('then user_organisations link users to their orgs', async () => {
      const svc = secretClient();
      const { data, error } = await svc
        .from('user_organisations')
        .select('user_id, org_id, github_role')
        .in('user_id', [SEED_ALICE_ID, SEED_BOB_ID, SEED_CAROL_ID]);
      expect(error).toBeNull();
      // alice → acme (admin), bob → acme (member), carol → beta (admin)
      expect(data).toHaveLength(3);
      expect(data?.some((r) => r.org_id === SEED_ACME_ORG_ID && r.github_role === 'admin')).toBe(
        true,
      );
      expect(data?.some((r) => r.org_id === SEED_ACME_ORG_ID && r.github_role === 'member')).toBe(
        true,
      );
      expect(data?.some((r) => r.org_id === SEED_BETA_ORG_ID && r.github_role === 'admin')).toBe(
        true,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// describe('Test factories')
// ---------------------------------------------------------------------------

describe('Test factories', () => {
  describe('Given createOrg with default options', () => {
    it('then it creates an active organisation', async () => {
      const svc = secretClient();
      const orgId = await createTestOrg(svc);

      const { data, error } = await svc
        .from('organisations')
        .select('status')
        .eq('id', orgId)
        .single();

      expect(error).toBeNull();
      expect(data?.status).toBe('active');

      await svc.from('organisations').delete().eq('id', orgId);
    });
  });

  describe('Given createAssessment with required fields', () => {
    it('then it creates an assessment with correct defaults', async () => {
      const svc = secretClient();
      const orgId = await createTestOrg(svc);
      const repoId = await createTestRepo(svc, orgId);
      const assessmentId = await createTestAssessment(svc, orgId, repoId);

      const { data, error } = await svc
        .from('assessments')
        .select('type, status')
        .eq('id', assessmentId)
        .single();

      expect(error).toBeNull();
      expect(data?.type).toBe('prcc');
      expect(data?.status).toBe('awaiting_responses');

      await svc.from('organisations').delete().eq('id', orgId);
    });
  });

  describe('Given createAnswer with required fields', () => {
    it('then it creates a participant answer with correct defaults', async () => {
      const svc = secretClient();
      const orgId = await createTestOrg(svc);
      const repoId = await createTestRepo(svc, orgId);
      const assessmentId = await createTestAssessment(svc, orgId, repoId);
      const questionId = await createTestQuestion(svc, orgId, assessmentId);
      const participantId = await createTestParticipant(svc, orgId, assessmentId);

      const answerId = await createTestAnswer(svc, {
        orgId,
        assessmentId,
        participantId,
        questionId,
      });

      const { data, error } = await svc
        .from('participant_answers')
        .select('answer_text, attempt_number, is_reassessment')
        .eq('id', answerId)
        .single();

      expect(error).toBeNull();
      expect(data?.answer_text).toBeTruthy();
      expect(data?.attempt_number).toBe(1);
      expect(data?.is_reassessment).toBe(false);

      await svc.from('organisations').delete().eq('id', orgId);
    });
  });

  // WARNING: this test MUST run last in this file — it clears all tables including
  // seed data. The 'Seed data' describe above depends on seed rows being present.
  // fileParallelism: false in vitest.config.ts ensures files run serially, and
  // tests within a file always run in declaration order, so this ordering is stable.
  describe('Given resetDatabase', () => {
    it('then all tables are empty', async () => {
      const svc = secretClient();

      // Create some data first
      const orgId = await createTestOrg(svc);
      await createTestRepo(svc, orgId);

      // Reset
      await resetDatabase(svc);

      // Verify core tables are empty
      const { data: orgs } = await svc.from('organisations').select('id');
      const { data: repos } = await svc.from('repositories').select('id');

      expect(orgs).toHaveLength(0);
      expect(repos).toHaveLength(0);
    });
  });
});
