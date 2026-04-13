// Integration tests for participant discovery before link_participant fires.
// Verifies that RLS policies allow unlinked participants (user_id IS NULL)
// to see their assessments and participant records via github_user_id lookup.
// Issue: #206

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import {
  SUPABASE_LOCAL_URL,
  SUPABASE_LOCAL_SECRET_KEY,
  SUPABASE_LOCAL_PUBLISHABLE_KEY,
} from './supabase-env';
import {
  createTestOrg,
  createTestRepo,
  createTestAssessment,
  createTestParticipant,
  createTestUserOrg,
  deleteTestOrg,
} from './factories';

// ---------------------------------------------------------------------------
// Helpers
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
// Test data
// ---------------------------------------------------------------------------

const GITHUB_USER_ID = 55555;
const emailSuffix = Date.now();

describe('Participant discovery before link_participant', () => {
  let orgId: string;
  let repoId: string;
  let assessmentId: string;
  let userId: string;
  let token: string;

  const email = `discovery-user-${emailSuffix}@example.com`;

  beforeAll(async () => {
    const svc = secretClient();

    orgId = await createTestOrg(svc);
    repoId = await createTestRepo(svc, orgId);
    assessmentId = await createTestAssessment(svc, orgId, repoId);

    userId = await createUser(email);

    // Register user in org with a specific github_user_id
    await createTestUserOrg(svc, userId, orgId, {
      github_user_id: GITHUB_USER_ID,
      github_username: 'discovery-user',
      github_role: 'member',
    });

    // Create participant with matching github_user_id but NO user_id (unlinked)
    await createTestParticipant(svc, orgId, assessmentId, {
      github_user_id: GITHUB_USER_ID,
      github_username: 'discovery-user',
    });

    token = await signIn(email);
  });

  afterAll(async () => {
    const svc = secretClient();
    await deleteTestOrg(svc, orgId);
    await deleteUser(userId);
  });

  describe('Given a participant added by GitHub username with user_id NULL', () => {
    it('then the participant can see their assessment via RLS', async () => {
      const client = authedClient(token);

      const { data, error } = await client
        .from('assessments')
        .select('id')
        .eq('id', assessmentId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0]!.id).toBe(assessmentId);
    });

    it('then the participant can see their own participant record via RLS', async () => {
      const client = authedClient(token);

      const { data, error } = await client
        .from('assessment_participants')
        .select('id, github_username')
        .eq('assessment_id', assessmentId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0]!.github_username).toBe('discovery-user');
    });

    it('then is_assessment_participant returns true for unlinked participant', async () => {
      const client = authedClient(token);

      const { data, error } = await client
        .rpc('is_assessment_participant', { check_assessment_id: assessmentId });

      expect(error).toBeNull();
      expect(data).toBe(true);
    });
  });

  describe('Given link_participant is called after discovery', () => {
    it('then link_participant still works and links the user', async () => {
      const client = authedClient(token);

      const { data, error } = await client
        .rpc('link_participant', {
          p_assessment_id: assessmentId,
          p_github_user_id: GITHUB_USER_ID,
        });

      expect(error).toBeNull();
      expect(data).toBeTruthy();

      // Verify user_id is now set
      const svc = secretClient();
      const { data: participant } = await svc
        .from('assessment_participants')
        .select('user_id')
        .eq('assessment_id', assessmentId)
        .eq('github_user_id', GITHUB_USER_ID)
        .single();

      expect(participant?.user_id).toBe(userId);
    });

    it('then the participant can still see the assessment after linking', async () => {
      const client = authedClient(token);

      const { data, error } = await client
        .from('assessments')
        .select('id')
        .eq('id', assessmentId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  });
});
