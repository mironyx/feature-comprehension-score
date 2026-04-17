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

    const { data: repos } = await svc.from('repositories').select('github_repo_name').eq('org_id', firstId as string);
    expect(repos).toHaveLength(1);
    expect(repos?.[0]?.github_repo_name).toBe('acme/new-repo');
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

describe('finalise_rubric_v2 (legacy test migrated)', () => {
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

    const { error } = await svc.rpc('finalise_rubric_v2', {
      p_assessment_id: assessmentId,
      p_org_id: orgId,
      p_questions: questions,
      p_quality_score: null,
      p_quality_status: 'pending',
      p_quality_dimensions: null,
    });

    expect(error).toBeNull();

    const { data: assessment } = await svc.from('assessments').select('status').eq('id', assessmentId).single();
    expect(assessment?.status).toBe('awaiting_responses');

    const { data: qRows } = await svc.from('assessment_questions').select('*').eq('assessment_id', assessmentId);
    expect(qRows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// finalise_rubric_v2 — hint column (#220)
// ---------------------------------------------------------------------------

describe('finalise_rubric_v2 — hint column', () => {
  let orgId: string;

  // Shared helper: create a minimal assessment in rubric_generation status.
  async function createAssessment(svc: ReturnType<typeof secretClient>): Promise<{ assessmentId: string }> {
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
    return { assessmentId };
  }

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  // Property 1 [req §Story 1.2 AC2, lld §Story 1.2]:
  // When a question JSON includes a non-null hint string, the stored row has that hint value.
  it('stores hint value when question JSON includes a non-null hint string', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const { assessmentId } = await createAssessment(svc);

    const questions = [
      {
        question_number: 1,
        naur_layer: 'world_to_program',
        question_text: 'Q1',
        weight: 2,
        reference_answer: 'A1',
        hint: 'Describe 2–3 scenarios and explain the design rationale.',
      },
    ];

    const { error } = await svc.rpc('finalise_rubric_v2', {
      p_assessment_id: assessmentId,
      p_org_id: orgId,
      p_questions: questions,
      p_quality_score: null,
      p_quality_status: 'pending',
      p_quality_dimensions: null,
    });

    expect(error).toBeNull();

    const { data: qRows } = await svc
      .from('assessment_questions')
      .select('hint')
      .eq('assessment_id', assessmentId);

    expect(qRows).toHaveLength(1);
    expect(qRows?.[0]?.hint).toBe('Describe 2–3 scenarios and explain the design rationale.');
  });

  // Property 2 [req §Story 1.2 AC3, lld §Story 1.2]:
  // When the hint key is absent from the question JSON, the stored row has NULL for hint.
  it('stores NULL hint when the hint key is absent from question JSON', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const { assessmentId } = await createAssessment(svc);

    const questions = [
      {
        question_number: 1,
        naur_layer: 'world_to_program',
        question_text: 'Q1',
        weight: 2,
        reference_answer: 'A1',
        // hint key is deliberately absent
      },
    ];

    const { error } = await svc.rpc('finalise_rubric_v2', {
      p_assessment_id: assessmentId,
      p_org_id: orgId,
      p_questions: questions,
      p_quality_score: null,
      p_quality_status: 'pending',
      p_quality_dimensions: null,
    });

    expect(error).toBeNull();

    const { data: qRows } = await svc
      .from('assessment_questions')
      .select('hint')
      .eq('assessment_id', assessmentId);

    expect(qRows).toHaveLength(1);
    expect(qRows?.[0]?.hint).toBeNull();
  });

  // Property 3 [req §Story 1.2 AC3, req §Story 1.1 AC4]:
  // When hint is explicitly null in the question JSON, the stored row has NULL for hint.
  it('stores NULL hint when hint is explicitly null in question JSON', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const { assessmentId } = await createAssessment(svc);

    const questions = [
      {
        question_number: 1,
        naur_layer: 'world_to_program',
        question_text: 'Q1',
        weight: 2,
        reference_answer: 'A1',
        hint: null,
      },
    ];

    const { error } = await svc.rpc('finalise_rubric_v2', {
      p_assessment_id: assessmentId,
      p_org_id: orgId,
      p_questions: questions,
      p_quality_score: null,
      p_quality_status: 'pending',
      p_quality_dimensions: null,
    });

    expect(error).toBeNull();

    const { data: qRows } = await svc
      .from('assessment_questions')
      .select('hint')
      .eq('assessment_id', assessmentId);

    expect(qRows).toHaveLength(1);
    expect(qRows?.[0]?.hint).toBeNull();
  });

  // Property 4 [req §Story 1.2 AC2]:
  // When multiple questions are inserted in a single call, each question's hint is stored independently.
  it('stores each question hint independently in a multi-question call', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const { assessmentId } = await createAssessment(svc);

    const questions = [
      {
        question_number: 1,
        naur_layer: 'world_to_program',
        question_text: 'Q1',
        weight: 2,
        reference_answer: 'A1',
        hint: 'Hint for question one.',
      },
      {
        question_number: 2,
        naur_layer: 'design_justification',
        question_text: 'Q2',
        weight: 1,
        reference_answer: 'A2',
        hint: null,
      },
      {
        question_number: 3,
        naur_layer: 'modification_capacity',
        question_text: 'Q3',
        weight: 3,
        reference_answer: 'A3',
        // hint key absent
      },
    ];

    const { error } = await svc.rpc('finalise_rubric_v2', {
      p_assessment_id: assessmentId,
      p_org_id: orgId,
      p_questions: questions,
      p_quality_score: null,
      p_quality_status: 'pending',
      p_quality_dimensions: null,
    });

    expect(error).toBeNull();

    const { data: qRows } = await svc
      .from('assessment_questions')
      .select('question_number, hint')
      .eq('assessment_id', assessmentId)
      .order('question_number');

    expect(qRows).toHaveLength(3);
    expect(qRows?.[0]?.hint).toBe('Hint for question one.');
    expect(qRows?.[1]?.hint).toBeNull();
    expect(qRows?.[2]?.hint).toBeNull();
  });

  // Property 5 [req §Story 1.2 AC2, req §Story 1.2 AC1]:
  // The existing contract (question_number, naur_layer, question_text, weight, reference_answer,
  // assessment status → awaiting_responses) is unchanged when hints are also present.
  it('preserves existing column values and sets assessment status to awaiting_responses when hints are present', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const { assessmentId } = await createAssessment(svc);

    const questions = [
      {
        question_number: 1,
        naur_layer: 'world_to_program',
        question_text: 'What is the primary entry point?',
        weight: 2,
        reference_answer: 'The main function in index.ts.',
        hint: 'Name the file and describe what it does.',
      },
    ];

    const { error } = await svc.rpc('finalise_rubric_v2', {
      p_assessment_id: assessmentId,
      p_org_id: orgId,
      p_questions: questions,
      p_quality_score: null,
      p_quality_status: 'pending',
      p_quality_dimensions: null,
    });

    expect(error).toBeNull();

    const { data: assessment } = await svc
      .from('assessments')
      .select('status')
      .eq('id', assessmentId)
      .single();
    expect(assessment?.status).toBe('awaiting_responses');

    const { data: qRows } = await svc
      .from('assessment_questions')
      .select('question_number, naur_layer, question_text, weight, reference_answer, hint')
      .eq('assessment_id', assessmentId)
      .single();

    expect(qRows?.question_number).toBe(1);
    expect(qRows?.naur_layer).toBe('world_to_program');
    expect(qRows?.question_text).toBe('What is the primary entry point?');
    expect(qRows?.weight).toBe(2);
    expect(qRows?.reference_answer).toBe('The main function in index.ts.');
    expect(qRows?.hint).toBe('Name the file and describe what it does.');
  });
});

// ---------------------------------------------------------------------------
// finalise_rubric_v2 (#235)
// ---------------------------------------------------------------------------

describe('finalise_rubric_v2', () => {
  let orgId: string;

  // Shared helper: create a minimal assessment in rubric_generation status.
  async function createAssessment(svc: ReturnType<typeof secretClient>): Promise<{ assessmentId: string }> {
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
    return { assessmentId };
  }

  const sampleQuestions = [
    { question_number: 1, naur_layer: 'world_to_program', question_text: 'Q1', weight: 2, reference_answer: 'A1' },
    { question_number: 2, naur_layer: 'design_justification', question_text: 'Q2', weight: 1, reference_answer: 'A2' },
  ];

  const sampleDimensions = [
    { key: 'pr_description', sub_score: 80, category: 'detailed', rationale: 'Good PR description.' },
    { key: 'linked_issues', sub_score: 90, category: 'detailed', rationale: 'Issues linked.' },
    { key: 'design_documents', sub_score: 70, category: 'minimal', rationale: 'Some design docs.' },
    { key: 'commit_messages', sub_score: 60, category: 'minimal', rationale: 'Adequate commits.' },
    { key: 'test_coverage', sub_score: 75, category: 'detailed', rationale: 'Good coverage.' },
    { key: 'adr_references', sub_score: 85, category: 'detailed', rationale: 'ADRs referenced.' },
  ];

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  // Property 1 [lld §11.1b]: A freshly-created assessment (before any RPC call) has
  // artefact_quality_status = 'pending' due to the column DEFAULT.
  it('sets artefact_quality_status to "pending" for a freshly-created assessment', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const { assessmentId } = await createAssessment(svc);

    const { data: assessment } = await svc
      .from('assessments')
      .select('artefact_quality_status, artefact_quality_score, artefact_quality_dimensions')
      .eq('id', assessmentId)
      .single();

    expect(assessment?.artefact_quality_status).toBe('pending');
    expect(assessment?.artefact_quality_score).toBeNull();
    expect(assessment?.artefact_quality_dimensions).toBeNull();
  });

  describe('Given questions and a successful quality result', () => {
    // Property 2 [lld §11.1b]: The RPC returns no error when given valid inputs and a successful quality result.
    it('returns no error', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc);

      const { error } = await svc.rpc('finalise_rubric_v2', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: 78,
        p_quality_status: 'success',
        p_quality_dimensions: sampleDimensions,
      });

      expect(error).toBeNull();
    });

    // Property 3 [lld §11.1b]: Questions are inserted into assessment_questions.
    it('then questions are inserted', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc);

      await svc.rpc('finalise_rubric_v2', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: 78,
        p_quality_status: 'success',
        p_quality_dimensions: sampleDimensions,
      });

      const { data: qRows } = await svc
        .from('assessment_questions')
        .select('question_number')
        .eq('assessment_id', assessmentId)
        .order('question_number');

      expect(qRows).toHaveLength(2);
      expect(qRows?.[0]?.question_number).toBe(1);
      expect(qRows?.[1]?.question_number).toBe(2);
    });

    // Property 4 [lld §11.1b]: artefact_quality_score is persisted as the integer passed in.
    it('then artefact_quality_score is persisted', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc);

      await svc.rpc('finalise_rubric_v2', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: 78,
        p_quality_status: 'success',
        p_quality_dimensions: sampleDimensions,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('artefact_quality_score')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.artefact_quality_score).toBe(78);
    });

    // Property 5 [lld §11.1b]: artefact_quality_status is set to 'success'.
    it('then artefact_quality_status is "success"', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc);

      await svc.rpc('finalise_rubric_v2', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: 78,
        p_quality_status: 'success',
        p_quality_dimensions: sampleDimensions,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('artefact_quality_status')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.artefact_quality_status).toBe('success');
    });

    // Property 6 [lld §11.1b]: artefact_quality_dimensions is persisted as the exact JSONB array passed in.
    it('then artefact_quality_dimensions is persisted as the exact array passed in', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc);

      await svc.rpc('finalise_rubric_v2', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: 78,
        p_quality_status: 'success',
        p_quality_dimensions: sampleDimensions,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('artefact_quality_dimensions')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.artefact_quality_dimensions).toEqual(sampleDimensions);
    });

    // Property 7 [lld §11.1b]: Assessment status transitions to 'awaiting_responses'.
    it('then assessment status transitions to "awaiting_responses"', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc);

      await svc.rpc('finalise_rubric_v2', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: 78,
        p_quality_status: 'success',
        p_quality_dimensions: sampleDimensions,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('status')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.status).toBe('awaiting_responses');
    });
  });

  describe('Given questions and an unavailable quality result', () => {
    // Property 8 [lld §11.1b, issue]: Questions are inserted even when the quality result is unavailable.
    it('then questions are inserted', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc);

      await svc.rpc('finalise_rubric_v2', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: null,
        p_quality_status: 'unavailable',
        p_quality_dimensions: null,
      });

      const { data: qRows } = await svc
        .from('assessment_questions')
        .select('question_number')
        .eq('assessment_id', assessmentId);

      expect(qRows).toHaveLength(2);
    });

    // Property 9 [lld §11.1b, issue]: artefact_quality_score is NULL when quality is unavailable.
    it('then artefact_quality_score is NULL', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc);

      await svc.rpc('finalise_rubric_v2', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: null,
        p_quality_status: 'unavailable',
        p_quality_dimensions: null,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('artefact_quality_score')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.artefact_quality_score).toBeNull();
    });

    // Property 10 [lld §11.1b, issue]: artefact_quality_status is set to 'unavailable'.
    it('then quality_status is "unavailable"', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc);

      await svc.rpc('finalise_rubric_v2', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: null,
        p_quality_status: 'unavailable',
        p_quality_dimensions: null,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('artefact_quality_status')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.artefact_quality_status).toBe('unavailable');
    });

    // Property 11 [lld §11.1b]: artefact_quality_dimensions is NULL when quality is unavailable.
    it('then artefact_quality_dimensions is NULL', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc);

      await svc.rpc('finalise_rubric_v2', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: null,
        p_quality_status: 'unavailable',
        p_quality_dimensions: null,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('artefact_quality_dimensions')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.artefact_quality_dimensions).toBeNull();
    });

    // Property 12 [lld §11.1b, issue]: Assessment status transitions to 'awaiting_responses'
    // even when the quality result is unavailable.
    it('then assessment status transitions to "awaiting_responses"', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc);

      await svc.rpc('finalise_rubric_v2', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: null,
        p_quality_status: 'unavailable',
        p_quality_dimensions: null,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('status')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.status).toBe('awaiting_responses');
    });
  });

  describe('Given a CHECK violation on score range', () => {
    // Property 13 [lld §11.1b]: The RPC returns an error when p_quality_score violates the 0–100 CHECK.
    it('then error is non-null', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc);

      const { error } = await svc.rpc('finalise_rubric_v2', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: 150,
        p_quality_status: 'success',
        p_quality_dimensions: sampleDimensions,
      });

      expect(error).not.toBeNull();
    });

    // Property 14 [lld §11.1b]: The transaction aborts — no questions are inserted.
    it('then no questions are inserted (transaction aborts)', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc);

      await svc.rpc('finalise_rubric_v2', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: 150,
        p_quality_status: 'success',
        p_quality_dimensions: sampleDimensions,
      });

      const { data: qRows } = await svc
        .from('assessment_questions')
        .select('id')
        .eq('assessment_id', assessmentId);

      expect(qRows).toHaveLength(0);
    });

    // Property 15 [lld §11.1b]: The assessment status stays at 'rubric_generation' (atomicity).
    it('then the assessment status stays at "rubric_generation"', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc);

      await svc.rpc('finalise_rubric_v2', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: 150,
        p_quality_status: 'success',
        p_quality_dimensions: sampleDimensions,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('status')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.status).toBe('rubric_generation');
    });
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
