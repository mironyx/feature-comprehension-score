// Integration tests for E17 observability schema columns and finalise_rubric_v3 RPC.
// Issue: #243 — Schema: observability columns + tool_use_enabled + rubric_cost_cap_cents
// LLD: docs/design/lld-v2-e17-agentic-retrieval.md §17.1d

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
// Mirrors the pattern from transaction-functions.integration.test.ts.
// ---------------------------------------------------------------------------
async function createAssessment(
  svc: ReturnType<typeof secretClient>,
  orgId: string,
): Promise<{ assessmentId: string; repoId: string }> {
  const repoId = await createTestRepo(svc, orgId);
  const assessmentId = crypto.randomUUID();
  const { error } = await svc.from('assessments').insert({
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
  if (error) throw new Error(`createAssessment failed: ${error.message}`);
  return { assessmentId, repoId };
}

const sampleQuestions = [
  {
    question_number: 1,
    naur_layer: 'world_to_program',
    question_text: 'What does this feature do at a high level?',
    weight: 2,
    reference_answer: 'It implements agentic artefact retrieval.',
  },
  {
    question_number: 2,
    naur_layer: 'design_justification',
    question_text: 'Why was a tool-use loop chosen over a deterministic orchestrator?',
    weight: 1,
    reference_answer: 'Flexibility and reduced coupling per ADR-0023.',
  },
];

const sampleToolCalls = [
  {
    tool_name: 'readFile',
    argument_path: 'docs/adr/0023-tool-use-loop.md',
    bytes_returned: 1024,
    outcome: 'ok',
  },
  {
    tool_name: 'listDirectory',
    argument_path: 'docs/design',
    bytes_returned: 256,
    outcome: 'ok',
  },
];

// ---------------------------------------------------------------------------
// schema: E17 observability — new columns on assessments and org_config
// ---------------------------------------------------------------------------

describe('schema: E17 observability', () => {
  let orgId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  // Property 1 [issue §243, lld §17.1d]:
  // A row inserted into assessments without the new observability columns has
  // rubric_input_tokens = null (the column defaults to null).
  it('assessments.rubric_input_tokens defaults to null on legacy rows', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const { assessmentId } = await createAssessment(svc, orgId);

    const { data: row } = await svc
      .from('assessments')
      .select('rubric_input_tokens')
      .eq('id', assessmentId)
      .single();

    expect(row?.rubric_input_tokens).toBeNull();
  });

  // Property 2 [issue §243, lld §17.1d]:
  // A row inserted into assessments without specifying rubric_output_tokens has it null.
  it('assessments.rubric_output_tokens defaults to null on legacy rows', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const { assessmentId } = await createAssessment(svc, orgId);

    const { data: row } = await svc
      .from('assessments')
      .select('rubric_output_tokens')
      .eq('id', assessmentId)
      .single();

    expect(row?.rubric_output_tokens).toBeNull();
  });

  // Property 3 [issue §243, lld §17.1d]:
  // A row inserted into assessments without specifying rubric_tool_call_count has it null.
  it('assessments.rubric_tool_call_count defaults to null on legacy rows', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const { assessmentId } = await createAssessment(svc, orgId);

    const { data: row } = await svc
      .from('assessments')
      .select('rubric_tool_call_count')
      .eq('id', assessmentId)
      .single();

    expect(row?.rubric_tool_call_count).toBeNull();
  });

  // Property 4 [issue §243, lld §17.1d]:
  // A row inserted into assessments without specifying rubric_tool_calls has it null.
  it('assessments.rubric_tool_calls defaults to null on legacy rows', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const { assessmentId } = await createAssessment(svc, orgId);

    const { data: row } = await svc
      .from('assessments')
      .select('rubric_tool_calls')
      .eq('id', assessmentId)
      .single();

    expect(row?.rubric_tool_calls).toBeNull();
  });

  // Property 5 [issue §243, lld §17.1d]:
  // A row inserted into assessments without specifying rubric_duration_ms has it null.
  it('assessments.rubric_duration_ms defaults to null on legacy rows', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const { assessmentId } = await createAssessment(svc, orgId);

    const { data: row } = await svc
      .from('assessments')
      .select('rubric_duration_ms')
      .eq('id', assessmentId)
      .single();

    expect(row?.rubric_duration_ms).toBeNull();
  });

  // Property 6 [issue §243, lld §17.1d, invariant 7]:
  // A freshly-created org_config row (created without specifying tool_use_enabled)
  // has tool_use_enabled = false. This is the default that makes tool-use opt-in.
  it('org_config.tool_use_enabled defaults to false', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { data: cfg } = await svc
      .from('org_config')
      .select('tool_use_enabled')
      .eq('org_id', orgId)
      .single();

    expect(cfg?.tool_use_enabled).toBe(false);
  });

  // Property 7 [issue §243, lld §17.1d]:
  // A freshly-created org_config row has rubric_cost_cap_cents = 20 (2× V1 baseline).
  it('org_config.rubric_cost_cap_cents defaults to 20', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);

    const { data: cfg } = await svc
      .from('org_config')
      .select('rubric_cost_cap_cents')
      .eq('org_id', orgId)
      .single();

    expect(cfg?.rubric_cost_cap_cents).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// finalise_rubric_v3 — observability fields persisted in one transaction
// ---------------------------------------------------------------------------

describe('finalise_rubric_v3', () => {
  let orgId: string;

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  describe('Given valid inputs with all observability fields populated', () => {
    // Property 8 [issue §243, lld §17.1d]:
    // The RPC returns no error when called with valid inputs.
    it('returns no error', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc, orgId);

      const { error } = await svc.rpc('finalise_rubric_v3', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: 75,
        p_quality_status: 'success',
        p_quality_dimensions: null,
        p_rubric_input_tokens: 1500,
        p_rubric_output_tokens: 320,
        p_rubric_tool_call_count: 2,
        p_rubric_tool_calls: sampleToolCalls,
        p_rubric_duration_ms: 4200,
      });

      expect(error).toBeNull();
    });

    // Property 9 [issue §243, lld §17.1d]:
    // Questions are inserted into assessment_questions by finalise_rubric_v3.
    it('then questions are inserted into assessment_questions', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc, orgId);

      await svc.rpc('finalise_rubric_v3', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: 75,
        p_quality_status: 'success',
        p_quality_dimensions: null,
        p_rubric_input_tokens: 1500,
        p_rubric_output_tokens: 320,
        p_rubric_tool_call_count: 2,
        p_rubric_tool_calls: sampleToolCalls,
        p_rubric_duration_ms: 4200,
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

    // Property 10 [issue §243, lld §17.1d]:
    // Assessment status transitions to 'awaiting_responses' after finalise_rubric_v3.
    it('then assessment status transitions to "awaiting_responses"', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc, orgId);

      await svc.rpc('finalise_rubric_v3', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: 75,
        p_quality_status: 'success',
        p_quality_dimensions: null,
        p_rubric_input_tokens: 1500,
        p_rubric_output_tokens: 320,
        p_rubric_tool_call_count: 2,
        p_rubric_tool_calls: sampleToolCalls,
        p_rubric_duration_ms: 4200,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('status')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.status).toBe('awaiting_responses');
    });

    // Property 11 [issue §243, lld §17.1d]:
    // rubric_input_tokens is persisted as the integer passed in.
    it('then rubric_input_tokens is persisted', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc, orgId);

      await svc.rpc('finalise_rubric_v3', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: null,
        p_quality_status: 'pending',
        p_quality_dimensions: null,
        p_rubric_input_tokens: 1500,
        p_rubric_output_tokens: 320,
        p_rubric_tool_call_count: 2,
        p_rubric_tool_calls: sampleToolCalls,
        p_rubric_duration_ms: 4200,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('rubric_input_tokens')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.rubric_input_tokens).toBe(1500);
    });

    // Property 12 [issue §243, lld §17.1d]:
    // rubric_output_tokens is persisted as the integer passed in.
    it('then rubric_output_tokens is persisted', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc, orgId);

      await svc.rpc('finalise_rubric_v3', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: null,
        p_quality_status: 'pending',
        p_quality_dimensions: null,
        p_rubric_input_tokens: 1500,
        p_rubric_output_tokens: 320,
        p_rubric_tool_call_count: 2,
        p_rubric_tool_calls: sampleToolCalls,
        p_rubric_duration_ms: 4200,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('rubric_output_tokens')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.rubric_output_tokens).toBe(320);
    });

    // Property 13 [issue §243, lld §17.1d]:
    // rubric_tool_call_count is persisted as the integer passed in.
    it('then rubric_tool_call_count is persisted', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc, orgId);

      await svc.rpc('finalise_rubric_v3', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: null,
        p_quality_status: 'pending',
        p_quality_dimensions: null,
        p_rubric_input_tokens: 1500,
        p_rubric_output_tokens: 320,
        p_rubric_tool_call_count: 2,
        p_rubric_tool_calls: sampleToolCalls,
        p_rubric_duration_ms: 4200,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('rubric_tool_call_count')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.rubric_tool_call_count).toBe(2);
    });

    // Property 14 [issue §243, lld §17.1d]:
    // rubric_tool_calls is persisted as the exact JSONB array passed in,
    // including { tool_name, argument_path, bytes_returned, outcome } per entry.
    it('then rubric_tool_calls is persisted as the exact array passed in', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc, orgId);

      await svc.rpc('finalise_rubric_v3', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: null,
        p_quality_status: 'pending',
        p_quality_dimensions: null,
        p_rubric_input_tokens: 1500,
        p_rubric_output_tokens: 320,
        p_rubric_tool_call_count: 2,
        p_rubric_tool_calls: sampleToolCalls,
        p_rubric_duration_ms: 4200,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('rubric_tool_calls')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.rubric_tool_calls).toEqual(sampleToolCalls);
    });

    // Property 15 [issue §243, lld §17.1d]:
    // rubric_duration_ms is persisted as the integer passed in.
    it('then rubric_duration_ms is persisted', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc, orgId);

      await svc.rpc('finalise_rubric_v3', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: null,
        p_quality_status: 'pending',
        p_quality_dimensions: null,
        p_rubric_input_tokens: 1500,
        p_rubric_output_tokens: 320,
        p_rubric_tool_call_count: 2,
        p_rubric_tool_calls: sampleToolCalls,
        p_rubric_duration_ms: 4200,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('rubric_duration_ms')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.rubric_duration_ms).toBe(4200);
    });
  });

  describe('Given null values for the E11 quality fields (cross-epic ordering)', () => {
    // Property 16 [issue §243, lld §17.1d cross-epic ordering]:
    // finalise_rubric_v3 accepts null for all E11 quality columns — the RPC must
    // not error out when E11 has not yet landed (or is intentionally omitted).
    it('finalise_rubric_v3 accepts null for E11 columns', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc, orgId);

      const { error } = await svc.rpc('finalise_rubric_v3', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: null,
        p_quality_status: 'pending',
        p_quality_dimensions: null,
        p_rubric_input_tokens: 800,
        p_rubric_output_tokens: 150,
        p_rubric_tool_call_count: 0,
        p_rubric_tool_calls: [],
        p_rubric_duration_ms: 1200,
      });

      expect(error).toBeNull();

      const { data: assessment } = await svc
        .from('assessments')
        .select('artefact_quality_score, artefact_quality_dimensions, status')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.artefact_quality_score).toBeNull();
      expect(assessment?.artefact_quality_dimensions).toBeNull();
      expect(assessment?.status).toBe('awaiting_responses');
    });

    // Property 17 [issue §243, lld §17.1d]:
    // When tool-use is disabled (0 tool calls), rubric_tool_call_count = 0 and
    // rubric_tool_calls = empty array are persisted correctly.
    it('persists rubric_tool_call_count = 0 and empty tool_calls array when no tools were called', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc, orgId);

      await svc.rpc('finalise_rubric_v3', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: null,
        p_quality_status: 'pending',
        p_quality_dimensions: null,
        p_rubric_input_tokens: 800,
        p_rubric_output_tokens: 150,
        p_rubric_tool_call_count: 0,
        p_rubric_tool_calls: [],
        p_rubric_duration_ms: 1200,
      });

      const { data: assessment } = await svc
        .from('assessments')
        .select('rubric_tool_call_count, rubric_tool_calls')
        .eq('id', assessmentId)
        .single();

      expect(assessment?.rubric_tool_call_count).toBe(0);
      expect(assessment?.rubric_tool_calls).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Legacy finalise_rubric_v2 still works (no breaking change)
  // ---------------------------------------------------------------------------

  describe('legacy finalise_rubric_v2 (no breaking change)', () => {
    // Property 18 [issue §243, lld §17.1d]:
    // finalise_rubric_v2 is still invokable and still transitions the assessment
    // to awaiting_responses. Ensures E17 schema migration did not break the V2 RPC.
    it('legacy finalise_rubric_v2 still works', async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const { assessmentId } = await createAssessment(svc, orgId);

      const { error } = await svc.rpc('finalise_rubric_v2', {
        p_assessment_id: assessmentId,
        p_org_id: orgId,
        p_questions: sampleQuestions,
        p_quality_score: null,
        p_quality_status: 'pending',
        p_quality_dimensions: null,
      });

      expect(error).toBeNull();

      const { data: assessment } = await svc
        .from('assessments')
        .select('status, rubric_input_tokens, rubric_output_tokens, rubric_tool_call_count, rubric_tool_calls, rubric_duration_ms')
        .eq('id', assessmentId)
        .single();

      // V2 RPC transitions status as before
      expect(assessment?.status).toBe('awaiting_responses');

      // V2 RPC does not populate the new observability columns — they stay null
      expect(assessment?.rubric_input_tokens).toBeNull();
      expect(assessment?.rubric_output_tokens).toBeNull();
      expect(assessment?.rubric_tool_call_count).toBeNull();
      expect(assessment?.rubric_tool_calls).toBeNull();
      expect(assessment?.rubric_duration_ms).toBeNull();
    });
  });
});
