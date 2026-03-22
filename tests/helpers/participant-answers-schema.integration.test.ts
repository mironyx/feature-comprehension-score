import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import {
  SUPABASE_LOCAL_URL,
  SUPABASE_LOCAL_SECRET_KEY,
} from './supabase-env';
import {
  createTestOrg,
  createTestRepo,
  createTestAssessment,
  createTestQuestion,
  createTestParticipant,
  deleteTestOrg,
} from './factories';

function secretClient() {
  return createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SECRET_KEY);
}

// ---------------------------------------------------------------------------
// describe('participant_answers schema migration')
// ---------------------------------------------------------------------------

describe('participant_answers schema migration', () => {
  describe('Given an existing database with v1 migrations', () => {
    it('then the v0.8 migration applies without errors', async () => {
      const svc = secretClient();

      // Verify the new columns exist by selecting them — an error means the column is missing
      const { error } = await svc
        .from('participant_answers')
        .select('id, score, score_rationale, is_reassessment')
        .limit(1);

      expect(error, 'v0.8 migration should have added score, score_rationale, is_reassessment').toBeNull();
    });
  });

  describe('Given the updated participant_answers table', () => {
    let orgId: string;
    let assessmentId: string;
    let questionId: string;
    let participantId: string;

    beforeAll(async () => {
      const svc = secretClient();
      orgId = await createTestOrg(svc);
      const repoId = await createTestRepo(svc, orgId);
      assessmentId = await createTestAssessment(svc, orgId, repoId);
      questionId = await createTestQuestion(svc, orgId, assessmentId);
      participantId = await createTestParticipant(svc, orgId, assessmentId);
    });

    afterAll(async () => {
      const svc = secretClient();
      await deleteTestOrg(svc, orgId);
    });

    it('then score accepts null and values between 0.00 and 1.00', async () => {
      const svc = secretClient();

      // NULL score
      const { error: errNull } = await svc.from('participant_answers').insert({
        org_id: orgId,
        assessment_id: assessmentId,
        participant_id: participantId,
        question_id: questionId,
        answer_text: 'Answer with null score',
        score: null,
        is_reassessment: false,
        attempt_number: 1,
      });
      expect(errNull, 'score: null should be accepted').toBeNull();

      // Clean up so we can insert again with different attempt
      const { error: errMin } = await svc.from('participant_answers').insert({
        org_id: orgId,
        assessment_id: assessmentId,
        participant_id: participantId,
        question_id: questionId,
        answer_text: 'Answer with score 0.00',
        score: 0.0,
        is_reassessment: false,
        attempt_number: 2,
      });
      expect(errMin, 'score: 0.00 should be accepted').toBeNull();

      const { error: errMax } = await svc.from('participant_answers').insert({
        org_id: orgId,
        assessment_id: assessmentId,
        participant_id: participantId,
        question_id: questionId,
        answer_text: 'Answer with score 1.00',
        score: 1.0,
        is_reassessment: false,
        attempt_number: 3,
      });
      expect(errMax, 'score: 1.00 should be accepted').toBeNull();
    });

    it('then score rejects values outside 0.00–1.00', async () => {
      const svc = secretClient();

      const { error: errHigh } = await svc.from('participant_answers').insert({
        org_id: orgId,
        assessment_id: assessmentId,
        participant_id: participantId,
        question_id: questionId,
        answer_text: 'Answer with invalid high score',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        score: 1.5 as any,
        is_reassessment: true,
        attempt_number: 1,
      });
      expect(errHigh, 'score: 1.5 should be rejected by CHECK constraint').not.toBeNull();

      const { error: errLow } = await svc.from('participant_answers').insert({
        org_id: orgId,
        assessment_id: assessmentId,
        participant_id: participantId,
        question_id: questionId,
        answer_text: 'Answer with invalid low score',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        score: -0.1 as any,
        is_reassessment: true,
        attempt_number: 1,
      });
      expect(errLow, 'score: -0.1 should be rejected by CHECK constraint').not.toBeNull();
    });

    it('then is_reassessment defaults to false', async () => {
      const svc = secretClient();

      // Insert a second question so we have a fresh participant/question combination
      const questionId2 = await createTestQuestion(svc, orgId, assessmentId, {
        question_number: 2,
        question_text: 'Second question for default test',
      });

      const { data, error } = await svc
        .from('participant_answers')
        .insert({
          org_id: orgId,
          assessment_id: assessmentId,
          participant_id: participantId,
          question_id: questionId2,
          answer_text: 'Answer without specifying is_reassessment',
          attempt_number: 1,
          // is_reassessment intentionally omitted — should default to false
        })
        .select('is_reassessment')
        .single();

      expect(error).toBeNull();
      expect(data?.is_reassessment).toBe(false);
    });

    it('then the UNIQUE constraint allows same question with different is_reassessment', async () => {
      const svc = secretClient();

      const questionId3 = await createTestQuestion(svc, orgId, assessmentId, {
        question_number: 3,
        question_text: 'Third question for uniqueness test',
      });

      // Initial assessment answer
      const { error: errFirst } = await svc.from('participant_answers').insert({
        org_id: orgId,
        assessment_id: assessmentId,
        participant_id: participantId,
        question_id: questionId3,
        answer_text: 'Initial answer',
        is_reassessment: false,
        attempt_number: 1,
      });
      expect(errFirst, 'initial answer insert should succeed').toBeNull();

      // Re-assessment answer — same participant/question/attempt_number but is_reassessment=true
      const { error: errReassess } = await svc.from('participant_answers').insert({
        org_id: orgId,
        assessment_id: assessmentId,
        participant_id: participantId,
        question_id: questionId3,
        answer_text: 'Re-assessment answer',
        is_reassessment: true,
        attempt_number: 1,
      });
      expect(
        errReassess,
        'reassessment answer (same question/attempt, different is_reassessment) should not violate UNIQUE constraint',
      ).toBeNull();
    });
  });
});
