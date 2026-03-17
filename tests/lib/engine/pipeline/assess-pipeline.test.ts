import { describe, it, expect, vi } from 'vitest';
import {
  generateRubric,
  scoreAnswers,
  calculateAssessmentAggregate,
  type Rubric,
  type ParticipantAnswer,
} from '@/lib/engine/pipeline';
import { createMockLLMClient } from '../../../fixtures/llm/mock-llm-client';
import type { LLMClient } from '@/lib/engine/llm/types';
import type { AssembledArtefactSet } from '@/lib/engine/prompts/artefact-types';
import { questionGenerationFixture } from '../../../fixtures/llm/question-generation';
import { scoringFixture } from '../../../fixtures/llm/scoring';
import { relevanceFixture } from '../../../fixtures/llm/relevance';

const validArtefacts: AssembledArtefactSet = {
  artefact_type: 'pull_request',
  pr_diff: '--- a/src/pay.ts\n+++ b/src/pay.ts\n@@ -1 +1 @@\n-old\n+new',
  file_listing: [
    { path: 'src/pay.ts', additions: 5, deletions: 2, status: 'modified' },
  ],
  file_contents: [
    { path: 'src/pay.ts', content: 'export function pay() {}' },
  ],
  question_count: 3,
  artefact_quality: 'code_only',
  token_budget_applied: false,
};

describe('Assessment pipeline', () => {
  describe('Given valid artefacts', () => {
    it('then it generates a rubric with questions, weights, and reference answers', async () => {
      const llmClient = createMockLLMClient();
      const result = await generateRubric({ artefacts: validArtefacts, llmClient });

      expect(result.status).toBe('success');
      if (result.status !== 'success') return;

      expect(result.rubric.questions).toHaveLength(3);
      for (const q of result.rubric.questions) {
        expect(q.weight).toBeGreaterThanOrEqual(1);
        expect(q.weight).toBeLessThanOrEqual(3);
        expect(q.reference_answer).toBeTruthy();
        expect(q.question_text).toBeTruthy();
      }
    });
  });

  describe('Given a generated rubric and submitted answers from 2 participants', () => {
    const rubric: Rubric = {
      questions: questionGenerationFixture.valid.questions,
      artefact_quality: questionGenerationFixture.valid.artefact_quality,
      artefact_quality_note: questionGenerationFixture.valid.artefact_quality_note,
    };

    const answers: ParticipantAnswer[] = [
      { questionIndex: 0, participantId: 'alice', answer: 'To fix the race condition causing duplicate charges.' },
      { questionIndex: 1, participantId: 'alice', answer: 'Adds a distributed lock using Redis.' },
      { questionIndex: 2, participantId: 'alice', answer: 'Uses Redis SET NX with TTL keyed on payment intent.' },
      { questionIndex: 0, participantId: 'bob', answer: 'Something about payments.' },
      { questionIndex: 1, participantId: 'bob', answer: 'It changes the locking.' },
      { questionIndex: 2, participantId: 'bob', answer: 'Not sure how it works.' },
    ];

    it('then it scores all answers and returns correct aggregate', async () => {
      const llmClient = createMockLLMClient();
      const scoreResult = await scoreAnswers({ rubric, answers, llmClient });

      expect(scoreResult.status).toBe('success');
      expect(scoreResult.scored).toHaveLength(6);
      expect(scoreResult.failures).toHaveLength(0);

      for (const s of scoreResult.scored) {
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(1);
        expect(s.rationale).toBeTruthy();
        expect(typeof s.is_relevant).toBe('boolean');
      }

      const aggregate = calculateAssessmentAggregate(scoreResult.scored, rubric);
      expect(aggregate.overallScore).toBeGreaterThanOrEqual(0);
      expect(aggregate.overallScore).toBeLessThanOrEqual(1);
      expect(aggregate.participantScores.size).toBe(2);
      expect(aggregate.participantScores.has('alice')).toBe(true);
      expect(aggregate.participantScores.has('bob')).toBe(true);
      expect(aggregate.questionScores.size).toBe(3);
    });
  });

  describe('Given one LLM call fails', () => {
    it('then it records the failure and continues scoring remaining answers', async () => {
      const rubric: Rubric = {
        questions: questionGenerationFixture.valid.questions,
        artefact_quality: questionGenerationFixture.valid.artefact_quality,
        artefact_quality_note: questionGenerationFixture.valid.artefact_quality_note,
      };

      const answers: ParticipantAnswer[] = [
        { questionIndex: 0, participantId: 'alice', answer: 'Good answer about race conditions.' },
        { questionIndex: 1, participantId: 'alice', answer: 'Distributed lock with Redis.' },
      ];

      // Flow: relevance → (if relevant) score, per answer sequentially.
      // Fail the 1st call (relevance for first answer), succeed on the rest.
      const failingClient: LLMClient = {
        generateStructured: vi.fn()
          .mockResolvedValueOnce({ success: false, error: { code: 'server_error', message: 'LLM unavailable', retryable: true } })
          .mockResolvedValueOnce({ success: true, data: relevanceFixture.valid })
          .mockResolvedValueOnce({ success: true, data: scoringFixture.valid }),
      };

      const result = await scoreAnswers({ rubric, answers, llmClient: failingClient });

      expect(result.status).toBe('scoring_incomplete');
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.scored.length).toBeLessThan(answers.length);

      // Partial aggregate should still work with available scores
      const aggregate = calculateAssessmentAggregate(result.scored, rubric);
      expect(aggregate.overallScore).toBeGreaterThanOrEqual(0);
      expect(aggregate.overallScore).toBeLessThanOrEqual(1);
    });
  });

  describe('Given an answer with questionIndex out of range', () => {
    it('then it records a validation_failed failure and continues scoring remaining answers', async () => {
      const rubric: Rubric = {
        questions: questionGenerationFixture.valid.questions,
        artefact_quality: questionGenerationFixture.valid.artefact_quality,
        artefact_quality_note: questionGenerationFixture.valid.artefact_quality_note,
      };

      const answers: ParticipantAnswer[] = [
        { questionIndex: 99, participantId: 'alice', answer: 'Out of range answer.' },
        { questionIndex: 0, participantId: 'bob', answer: 'Valid answer about race conditions.' },
      ];

      const llmClient = createMockLLMClient();
      const result = await scoreAnswers({ rubric, answers, llmClient });

      expect(result.status).toBe('scoring_incomplete');
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]!.questionIndex).toBe(99);
      expect(result.failures[0]!.participantId).toBe('alice');
      expect(result.failures[0]!.error.code).toBe('validation_failed');
      expect(result.scored).toHaveLength(1);
      expect(result.scored[0]!.participantId).toBe('bob');
    });
  });

  describe('Given generation fails', () => {
    it('then it returns generation_failed status', async () => {
      const llmClient = createMockLLMClient({
        error: { code: 'server_error', message: 'LLM unavailable' },
      });

      const result = await generateRubric({ artefacts: validArtefacts, llmClient });

      expect(result.status).toBe('generation_failed');
      if (result.status !== 'generation_failed') return;
      expect(result.error.code).toBe('server_error');
      expect(result.error.retryable).toBe(true);
    });
  });
});
