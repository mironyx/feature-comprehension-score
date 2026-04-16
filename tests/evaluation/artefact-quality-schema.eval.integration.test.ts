// Adversarial evaluation tests for issue #235: artefact quality schema + finalise_rubric_v2.
// Audits three gaps not covered by the feature test-author:
//   1. Score lower boundary (0) accepted by the CHECK constraint.
//   2. Score upper boundary (100) accepted by the CHECK constraint.
//   3. Invalid p_quality_status value rejected by the column CHECK constraint.
//
// All helpers are imported from the sibling integration test to avoid duplication.

import { describe, it, expect, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY } from '../helpers/supabase-env';
import { createTestOrg, createTestRepo, deleteTestOrg } from '../helpers/factories';

function secretClient() {
  return createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY);
}

describe('finalise_rubric_v2 — CHECK constraint boundaries (#235)', () => {
  let orgId: string;

  async function createAssessment(svc: ReturnType<typeof secretClient>): Promise<string> {
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
    return assessmentId;
  }

  const sampleQuestions = [
    { question_number: 1, naur_layer: 'world_to_program', question_text: 'Q1', weight: 1, reference_answer: 'A1' },
  ];

  afterEach(async () => {
    const svc = secretClient();
    if (orgId) await deleteTestOrg(svc, orgId);
  });

  // AC-5 [lld §11.1b]: The CHECK on artefact_quality_score is BETWEEN 0 AND 100 (inclusive).
  // Score = 0 is the lower inclusive boundary — must be accepted.
  it('accepts artefact_quality_score = 0 (lower boundary)', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const assessmentId = await createAssessment(svc);

    const { error } = await svc.rpc('finalise_rubric_v2', {
      p_assessment_id: assessmentId,
      p_org_id: orgId,
      p_questions: sampleQuestions,
      p_quality_score: 0,
      p_quality_status: 'success',
      p_quality_dimensions: null,
    });

    expect(error).toBeNull();

    const { data: row } = await svc
      .from('assessments')
      .select('artefact_quality_score')
      .eq('id', assessmentId)
      .single();

    expect(row?.artefact_quality_score).toBe(0);
  });

  // AC-5 [lld §11.1b]: Score = 100 is the upper inclusive boundary — must be accepted.
  it('accepts artefact_quality_score = 100 (upper boundary)', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const assessmentId = await createAssessment(svc);

    const { error } = await svc.rpc('finalise_rubric_v2', {
      p_assessment_id: assessmentId,
      p_org_id: orgId,
      p_questions: sampleQuestions,
      p_quality_score: 100,
      p_quality_status: 'success',
      p_quality_dimensions: null,
    });

    expect(error).toBeNull();

    const { data: row } = await svc
      .from('assessments')
      .select('artefact_quality_score')
      .eq('id', assessmentId)
      .single();

    expect(row?.artefact_quality_score).toBe(100);
  });

  // AC-5 [lld §11.1b]: The CHECK on artefact_quality_status enforces IN ('pending','success','unavailable').
  // An unrecognised status must be rejected and the transaction must abort.
  it('rejects an invalid p_quality_status value and aborts the transaction', async () => {
    const svc = secretClient();
    orgId = await createTestOrg(svc);
    const assessmentId = await createAssessment(svc);

    const { error } = await svc.rpc('finalise_rubric_v2', {
      p_assessment_id: assessmentId,
      p_org_id: orgId,
      p_questions: sampleQuestions,
      p_quality_score: 50,
      p_quality_status: 'invalid_value',
      p_quality_dimensions: null,
    });

    expect(error).not.toBeNull();

    // Transaction must have aborted — no questions inserted.
    const { data: qRows } = await svc
      .from('assessment_questions')
      .select('id')
      .eq('assessment_id', assessmentId);

    expect(qRows).toHaveLength(0);

    // Assessment status must remain at rubric_generation.
    const { data: assessment } = await svc
      .from('assessments')
      .select('status')
      .eq('id', assessmentId)
      .single();

    expect(assessment?.status).toBe('rubric_generation');
  });
});
