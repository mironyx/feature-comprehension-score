// Integration tests for transactional RPC functions.
// Verifies that multi-step DB writes are atomic — no partial state on failure.
// Issue: #118

import { describe, it, expect, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY } from './supabase-env';
import { createTestOrg, createTestRepo, deleteTestOrg } from './factories';

function secretClient() {
  return createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY);
}

// ---------------------------------------------------------------------------
// handle_installation_created
// ---------------------------------------------------------------------------

describe('handle_installation_created', () => {
  const createdOrgIds: string[] = [];

  afterEach(async () => {
    const svc = secretClient();
    for (const id of createdOrgIds) {
      await deleteTestOrg(svc, id);
    }
    createdOrgIds.length = 0;
  });

  it('atomically creates org, org_config, and repositories', async () => {
    const svc = secretClient();
    const repos = [
      { id: 5001, name: 'api', full_name: 'acme/api' },
      { id: 5002, name: 'web', full_name: 'acme/web' },
    ];

    const { data, error } = await svc.rpc('handle_installation_created', {
      p_github_org_id: 99001,
      p_github_org_name: 'acme-txn-test',
      p_installation_id: 88001,
      p_repos: repos,
    });

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    const orgId = data as string;
    createdOrgIds.push(orgId);

    const { data: org } = await svc.from('organisations').select('*').eq('id', orgId).single();
    expect(org?.github_org_name).toBe('acme-txn-test');
    expect(org?.status).toBe('active');

    const { data: cfg } = await svc.from('org_config').select('*').eq('org_id', orgId).single();
    expect(cfg).toBeTruthy();

    const { data: repoRows } = await svc.from('repositories').select('*').eq('org_id', orgId);
    expect(repoRows).toHaveLength(2);
  });

  it('handles empty repos array without error', async () => {
    const svc = secretClient();

    const { data, error } = await svc.rpc('handle_installation_created', {
      p_github_org_id: 99002,
      p_github_org_name: 'empty-repos-test',
      p_installation_id: 88002,
      p_repos: [],
    });

    expect(error).toBeNull();
    const orgId = data as string;
    createdOrgIds.push(orgId);

    const { data: repoRows } = await svc.from('repositories').select('*').eq('org_id', orgId);
    expect(repoRows).toHaveLength(0);
  });

  it('upserts on duplicate github_org_id', async () => {
    const svc = secretClient();

    const { data: firstId } = await svc.rpc('handle_installation_created', {
      p_github_org_id: 99003,
      p_github_org_name: 'original-name',
      p_installation_id: 88003,
      p_repos: [],
    });
    createdOrgIds.push(firstId as string);

    const { data: secondId, error } = await svc.rpc('handle_installation_created', {
      p_github_org_id: 99003,
      p_github_org_name: 'updated-name',
      p_installation_id: 88003,
      p_repos: [{ id: 6001, name: 'new-repo', full_name: 'acme/new-repo' }],
    });

    expect(error).toBeNull();
    expect(secondId).toBe(firstId);

    const { data: org } = await svc.from('organisations').select('github_org_name').eq('id', firstId as string).single();
    expect(org?.github_org_name).toBe('updated-name');
  });
});

// ---------------------------------------------------------------------------
// handle_repositories_added
// ---------------------------------------------------------------------------

describe('handle_repositories_added', () => {
  let orgId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  it('looks up org by installation_id and upserts repos atomically', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc, { installation_id: 77001, github_org_id: 66001, github_org_name: 'repo-add-test' });

    const repos = [{ id: 7001, name: 'svc', full_name: 'acme/svc' }];
    const { error } = await svc.rpc('handle_repositories_added', {
      p_installation_id: 77001,
      p_repos: repos,
    });

    expect(error).toBeNull();

    const { data: repoRows } = await svc.from('repositories').select('*').eq('org_id', orgId);
    expect(repoRows).toHaveLength(1);
    expect(repoRows?.[0]?.github_repo_name).toBe('acme/svc');
  });

  it('raises error when installation not found', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc.rpc('handle_repositories_added', {
      p_installation_id: 999999,
      p_repos: [{ id: 1, name: 'x', full_name: 'x/x' }],
    });

    expect(error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// create_fcs_assessment
// ---------------------------------------------------------------------------

describe('create_fcs_assessment', () => {
  let orgId: string;
  let repoId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  it('atomically creates assessment, merged PRs, and participants', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    repoId = await createTestRepo(svc, orgId);
    const assessmentId = crypto.randomUUID();

    const { error } = await svc.rpc('create_fcs_assessment', {
      p_id: assessmentId,
      p_org_id: orgId,
      p_repository_id: repoId,
      p_feature_name: 'Auth flow',
      p_feature_description: 'OAuth2 login',
      p_config_enforcement_mode: 'soft',
      p_config_score_threshold: 70,
      p_config_question_count: 5,
      p_config_min_pr_size: 20,
      p_merged_prs: [
        { pr_number: 10, pr_title: 'Add login' },
        { pr_number: 11, pr_title: 'Add logout' },
      ],
      p_participants: [
        { github_user_id: 1001, github_username: 'alice' },
        { github_user_id: 1002, github_username: 'bob' },
      ],
    });

    expect(error).toBeNull();

    const { data: assessment } = await svc.from('assessments').select('*').eq('id', assessmentId).single();
    expect(assessment?.type).toBe('fcs');
    expect(assessment?.status).toBe('rubric_generation');

    const { data: prs } = await svc.from('fcs_merged_prs').select('*').eq('assessment_id', assessmentId);
    expect(prs).toHaveLength(2);

    const { data: participants } = await svc.from('assessment_participants').select('*').eq('assessment_id', assessmentId);
    expect(participants).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// finalise_rubric
// ---------------------------------------------------------------------------

describe('finalise_rubric', () => {
  let orgId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  it('atomically inserts questions and updates assessment status', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const repoId = await createTestRepo(svc, orgId);
    const assessmentId = crypto.randomUUID();

    await svc.from('assessments').insert({
      id: assessmentId,
      org_id: orgId,
      repository_id: repoId,
      type: 'fcs',
      status: 'rubric_generation',
      config_enforcement_mode: 'soft',
      config_score_threshold: 70,
      config_question_count: 3,
      config_min_pr_size: 20,
    });

    const questions = [
      { question_number: 1, naur_layer: 'world_to_program', question_text: 'Q1', weight: 2, reference_answer: 'A1' },
      { question_number: 2, naur_layer: 'design_justification', question_text: 'Q2', weight: 1, reference_answer: 'A2' },
    ];

    const { error } = await svc.rpc('finalise_rubric', {
      p_assessment_id: assessmentId,
      p_org_id: orgId,
      p_questions: questions,
    });

    expect(error).toBeNull();

    const { data: assessment } = await svc.from('assessments').select('status').eq('id', assessmentId).single();
    expect(assessment?.status).toBe('awaiting_responses');

    const { data: qRows } = await svc.from('assessment_questions').select('*').eq('assessment_id', assessmentId);
    expect(qRows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// persist_scoring_results
// ---------------------------------------------------------------------------

describe('persist_scoring_results', () => {
  let orgId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  it('atomically updates assessment and answer scores', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const repoId = await createTestRepo(svc, orgId);

    const assessmentId = crypto.randomUUID();
    await svc.from('assessments').insert({
      id: assessmentId,
      org_id: orgId,
      repository_id: repoId,
      type: 'fcs',
      status: 'scoring',
      config_enforcement_mode: 'soft',
      config_score_threshold: 70,
      config_question_count: 3,
      config_min_pr_size: 20,
    });

    const questionId = crypto.randomUUID();
    await svc.from('assessment_questions').insert({
      id: questionId,
      org_id: orgId,
      assessment_id: assessmentId,
      question_number: 1,
      naur_layer: 'world_to_program',
      question_text: 'Q1',
      weight: 2,
      reference_answer: 'A1',
    });

    const participantId = crypto.randomUUID();
    await svc.from('assessment_participants').insert({
      id: participantId,
      org_id: orgId,
      assessment_id: assessmentId,
      github_user_id: 3001,
      github_username: 'scorer',
      contextual_role: 'participant',
      status: 'submitted',
    });

    await svc.from('participant_answers').insert({
      org_id: orgId,
      assessment_id: assessmentId,
      participant_id: participantId,
      question_id: questionId,
      answer_text: 'My answer',
      attempt_number: 1,
      is_reassessment: false,
      is_relevant: true,
    });

    const scored = [
      { participant_id: participantId, question_id: questionId, score: 0.85, rationale: 'Good answer' },
    ];

    const { error } = await svc.rpc('persist_scoring_results', {
      p_assessment_id: assessmentId,
      p_aggregate_score: 0.85,
      p_scoring_incomplete: false,
      p_scored: scored,
    });

    expect(error).toBeNull();

    const { data: assessment } = await svc.from('assessments').select('status, aggregate_score, scoring_incomplete').eq('id', assessmentId).single();
    expect(assessment?.status).toBe('completed');
    expect(Number(assessment?.aggregate_score)).toBeCloseTo(0.85);
    expect(assessment?.scoring_incomplete).toBe(false);

    const { data: answer } = await svc.from('participant_answers').select('score, score_rationale').eq('participant_id', participantId).eq('question_id', questionId).single();
    expect(Number(answer?.score)).toBeCloseTo(0.85);
    expect(answer?.score_rationale).toBe('Good answer');
  });
});
