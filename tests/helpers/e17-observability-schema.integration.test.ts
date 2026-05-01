// Integration tests for E17 observability schema changes and finalise_rubric overload.
// Covers: new assessments columns, org_config defaults + constraints, and the
// 8-argument finalise_rubric overload introduced in §17.1d.
// Issue: #243

import { describe, it, expect, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY } from './supabase-env';
import { createTestOrg, createTestRepo, deleteTestOrg } from './factories';

function secretClient() {
  return createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY);
}

// ---------------------------------------------------------------------------
// Shared helper: create a minimal assessment in rubric_generation status.
// ---------------------------------------------------------------------------

async function createRubricAssessment(
  svc: ReturnType<typeof secretClient>,
  orgId: string,
): Promise<string> {
  const repoId = await createTestRepo(svc, orgId);
  const assessmentId = crypto.randomUUID();
  const { error } = await svc.from('assessments').insert({
    id: assessmentId,
    org_id: orgId,
    repository_id: repoId,
    type: 'prcc',
    status: 'rubric_generation',
    config_enforcement_mode: 'soft',
    config_score_threshold: 70,
    config_question_count: 3,
    config_min_pr_size: 20,
  });
  if (error) throw new Error(`createRubricAssessment failed: ${error.message}`);
  return assessmentId;
}

const sampleQuestions = [
  {
    question_number: 1,
    naur_layer: 'world_to_program',
    question_text: 'Q1',
    weight: 2,
    reference_answer: 'A1',
  },
];

// ---------------------------------------------------------------------------
// assessments — new observability columns default to null
// ---------------------------------------------------------------------------

describe('schema: assessments observability columns default to null (E17 §17.1d)', () => {
  let orgId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  // Property 1 [lld §17.1d]: rubric_input_tokens defaults to null on legacy rows
  it('rubric_input_tokens defaults to null on new assessment row', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const assessmentId = await createRubricAssessment(svc, orgId);

    const { data } = await svc
      .from('assessments')
      .select('rubric_input_tokens')
      .eq('id', assessmentId)
      .single();

    expect(data?.rubric_input_tokens).toBeNull();
  });

  // Property 2 [lld §17.1d]: rubric_output_tokens defaults to null on legacy rows
  it('rubric_output_tokens defaults to null on new assessment row', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const assessmentId = await createRubricAssessment(svc, orgId);

    const { data } = await svc
      .from('assessments')
      .select('rubric_output_tokens')
      .eq('id', assessmentId)
      .single();

    expect(data?.rubric_output_tokens).toBeNull();
  });

  // Property 3 [lld §17.1d]: rubric_tool_call_count defaults to null on legacy rows
  it('rubric_tool_call_count defaults to null on new assessment row', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const assessmentId = await createRubricAssessment(svc, orgId);

    const { data } = await svc
      .from('assessments')
      .select('rubric_tool_call_count')
      .eq('id', assessmentId)
      .single();

    expect(data?.rubric_tool_call_count).toBeNull();
  });

  // Property 4 [lld §17.1d]: rubric_tool_calls defaults to null on legacy rows
  it('rubric_tool_calls defaults to null on new assessment row', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const assessmentId = await createRubricAssessment(svc, orgId);

    const { data } = await svc
      .from('assessments')
      .select('rubric_tool_calls')
      .eq('id', assessmentId)
      .single();

    expect(data?.rubric_tool_calls).toBeNull();
  });

  // Property 5 [lld §17.1d]: rubric_duration_ms defaults to null on legacy rows
  it('rubric_duration_ms defaults to null on new assessment row', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const assessmentId = await createRubricAssessment(svc, orgId);

    const { data } = await svc
      .from('assessments')
      .select('rubric_duration_ms')
      .eq('id', assessmentId)
      .single();

    expect(data?.rubric_duration_ms).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// org_config — new column defaults
// ---------------------------------------------------------------------------

describe('schema: org_config E17 column defaults (§17.1d)', () => {
  let orgId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  // Property 6 [lld §17.1d, invariant 7]: tool_use_enabled defaults to false on org creation
  it('tool_use_enabled defaults to false on org creation', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { data } = await svc
      .from('org_config')
      .select('tool_use_enabled')
      .eq('org_id', orgId)
      .single();

    expect(data?.tool_use_enabled).toBe(false);
  });

  // Property 7 [lld §17.1d]: rubric_cost_cap_cents defaults to 20 on org creation
  it('rubric_cost_cap_cents defaults to 20 on org creation', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { data } = await svc
      .from('org_config')
      .select('rubric_cost_cap_cents')
      .eq('org_id', orgId)
      .single();

    expect(data?.rubric_cost_cap_cents).toBe(20);
  });

  // Property 8 [lld §17.1d]: retrieval_timeout_seconds defaults to 120 on org creation
  it('retrieval_timeout_seconds defaults to 120 on org creation', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { data } = await svc
      .from('org_config')
      .select('retrieval_timeout_seconds')
      .eq('org_id', orgId)
      .single();

    expect(data?.retrieval_timeout_seconds).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// org_config — CHECK constraint violations
// ---------------------------------------------------------------------------

describe('schema: org_config E17 CHECK constraints (§17.2a)', () => {
  let orgId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  // Property 9 [lld §17.2a]: rubric_cost_cap_cents rejects value above 500
  it('rubric_cost_cap_cents rejects value above 500', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ rubric_cost_cap_cents: 501 })
      .eq('org_id', orgId);

    expect(error).toBeTruthy();
  });

  // Property 10 [lld §17.2a]: rubric_cost_cap_cents rejects value below 0
  it('rubric_cost_cap_cents rejects value below 0', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ rubric_cost_cap_cents: -1 })
      .eq('org_id', orgId);

    expect(error).toBeTruthy();
  });

  // Property 11 [lld §17.2a]: rubric_cost_cap_cents accepts boundary value 0
  it('rubric_cost_cap_cents accepts boundary value 0', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ rubric_cost_cap_cents: 0 })
      .eq('org_id', orgId);

    expect(error).toBeNull();
  });

  // Property 12 [lld §17.2a]: rubric_cost_cap_cents accepts boundary value 500
  it('rubric_cost_cap_cents accepts boundary value 500', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ rubric_cost_cap_cents: 500 })
      .eq('org_id', orgId);

    expect(error).toBeNull();
  });

  // Property 13 [lld §17.2a]: retrieval_timeout_seconds rejects value above 600
  it('retrieval_timeout_seconds rejects value above 600', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ retrieval_timeout_seconds: 601 })
      .eq('org_id', orgId);

    expect(error).toBeTruthy();
  });

  // Property 14 [lld §17.2a]: retrieval_timeout_seconds rejects value below 10
  it('retrieval_timeout_seconds rejects value below 10', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ retrieval_timeout_seconds: 9 })
      .eq('org_id', orgId);

    expect(error).toBeTruthy();
  });

  // Property 15 [lld §17.2a]: retrieval_timeout_seconds accepts boundary value 10
  it('retrieval_timeout_seconds accepts boundary value 10', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ retrieval_timeout_seconds: 10 })
      .eq('org_id', orgId);

    expect(error).toBeNull();
  });

  // Property 16 [lld §17.2a]: retrieval_timeout_seconds accepts boundary value 600
  it('retrieval_timeout_seconds accepts boundary value 600', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { error } = await svc
      .from('org_config')
      .update({ retrieval_timeout_seconds: 600 })
      .eq('org_id', orgId);

    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// finalise_rubric — 8-arg observability overload
// ---------------------------------------------------------------------------

describe('finalise_rubric 8-arg overload: persists observability fields (E17 §17.1d)', () => {
  let orgId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  // Property 17 [lld §17.1d]: 8-arg overload persists all observability columns
  it('persists rubric_input_tokens, rubric_output_tokens, rubric_tool_call_count, rubric_tool_calls, rubric_duration_ms in one RPC call', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const assessmentId = await createRubricAssessment(svc, orgId);

    const toolCallsLog = [
      { tool_name: 'readFile', argument_path: 'docs/adr/0001.md', bytes_returned: 512, outcome: 'ok' },
    ];

    const { error } = await svc.rpc('finalise_rubric', {
      p_assessment_id: assessmentId,
      p_org_id: orgId,
      p_questions: sampleQuestions,
      p_rubric_input_tokens: 1200,
      p_rubric_output_tokens: 450,
      p_rubric_tool_call_count: 1,
      p_rubric_tool_calls: toolCallsLog,
      p_rubric_duration_ms: 3750,
    });

    expect(error).toBeNull();

    const { data } = await svc
      .from('assessments')
      .select(
        'rubric_input_tokens, rubric_output_tokens, rubric_tool_call_count, rubric_tool_calls, rubric_duration_ms',
      )
      .eq('id', assessmentId)
      .single();

    expect(data?.rubric_input_tokens).toBe(1200);
    expect(data?.rubric_output_tokens).toBe(450);
    expect(data?.rubric_tool_call_count).toBe(1);
    expect(data?.rubric_tool_calls).toEqual(toolCallsLog);
    expect(data?.rubric_duration_ms).toBe(3750);
  });

  // Property 18 [lld §17.1d, existing contract]: 8-arg overload inserts questions and transitions to awaiting_responses
  it('inserts questions and transitions assessment status to awaiting_responses', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const assessmentId = await createRubricAssessment(svc, orgId);

    const questions = [
      { question_number: 1, naur_layer: 'world_to_program', question_text: 'Q1', weight: 2, reference_answer: 'A1' },
      { question_number: 2, naur_layer: 'design_justification', question_text: 'Q2', weight: 1, reference_answer: 'A2' },
    ];

    const { error } = await svc.rpc('finalise_rubric', {
      p_assessment_id: assessmentId,
      p_org_id: orgId,
      p_questions: questions,
      p_rubric_input_tokens: 800,
      p_rubric_output_tokens: 200,
      p_rubric_tool_call_count: 0,
      p_rubric_tool_calls: [],
      p_rubric_duration_ms: 1500,
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
      .select('question_number')
      .eq('assessment_id', assessmentId)
      .order('question_number');
    expect(qRows).toHaveLength(2);
    expect(qRows?.[0]?.question_number).toBe(1);
    expect(qRows?.[1]?.question_number).toBe(2);
  });

  // Property 19 [lld §17.1d]: observability fields accept zero/empty values (tool-use disabled path)
  it('persists zero tool call count and empty array when tool-use is disabled', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const assessmentId = await createRubricAssessment(svc, orgId);

    const { error } = await svc.rpc('finalise_rubric', {
      p_assessment_id: assessmentId,
      p_org_id: orgId,
      p_questions: sampleQuestions,
      p_rubric_input_tokens: 600,
      p_rubric_output_tokens: 150,
      p_rubric_tool_call_count: 0,
      p_rubric_tool_calls: [],
      p_rubric_duration_ms: 900,
    });

    expect(error).toBeNull();

    const { data } = await svc
      .from('assessments')
      .select('rubric_tool_call_count, rubric_tool_calls')
      .eq('id', assessmentId)
      .single();

    expect(data?.rubric_tool_call_count).toBe(0);
    expect(data?.rubric_tool_calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// finalise_rubric — legacy 3-arg overload is unchanged (no breaking change)
// ---------------------------------------------------------------------------

describe('finalise_rubric 3-arg legacy overload: no breaking change (E17 §17.1d)', () => {
  let orgId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  // Property 20 [lld §17.1d]: legacy 3-arg call succeeds and sets awaiting_responses
  it('still inserts questions and transitions assessment to awaiting_responses', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const assessmentId = await createRubricAssessment(svc, orgId);

    const { error } = await svc.rpc('finalise_rubric', {
      p_assessment_id: assessmentId,
      p_org_id: orgId,
      p_questions: sampleQuestions,
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
      .select('question_number')
      .eq('assessment_id', assessmentId);
    expect(qRows).toHaveLength(1);
  });

  // Property 21 [lld §17.1d]: legacy 3-arg call leaves observability columns as null
  it('leaves all observability columns as null when called without observability args', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const assessmentId = await createRubricAssessment(svc, orgId);

    const { error } = await svc.rpc('finalise_rubric', {
      p_assessment_id: assessmentId,
      p_org_id: orgId,
      p_questions: sampleQuestions,
    });

    expect(error).toBeNull();

    const { data } = await svc
      .from('assessments')
      .select(
        'rubric_input_tokens, rubric_output_tokens, rubric_tool_call_count, rubric_tool_calls, rubric_duration_ms',
      )
      .eq('id', assessmentId)
      .single();

    expect(data?.rubric_input_tokens).toBeNull();
    expect(data?.rubric_output_tokens).toBeNull();
    expect(data?.rubric_tool_call_count).toBeNull();
    expect(data?.rubric_tool_calls).toBeNull();
    expect(data?.rubric_duration_ms).toBeNull();
  });
});
