/**
 * FCS happy-path E2E test — sign in, view assessments, answer questions, view scores.
 *
 * Requires a running local Supabase instance. The test is skipped when
 * NEXT_PUBLIC_SUPABASE_URL is the placeholder value (CI without Supabase).
 *
 * External API calls (GitHub, LLM) are avoided by seeding all data directly
 * and intercepting browser POST requests via page.route().
 *
 * Issue: #138
 */

import { test, expect } from '@playwright/test';
import {
  createE2EUser,
  deleteE2EUser,
  setE2EAuthCookies,
  createAdminClient,
  type E2EUser,
} from '../helpers/e2e-auth';
import {
  seedOrg,
  seedRepo,
  seedUserOrg,
  seedAssessment,
  seedQuestions,
  seedParticipant,
  seedScores,
  markParticipantSubmitted,
  cleanupOrg,
} from '../helpers/e2e-seed';

const isPlaceholder =
  (process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '').includes('placeholder');

test.describe('FCS happy path', () => {
  test.skip(isPlaceholder, 'Skipped: no local Supabase instance');

  let user: E2EUser;
  let orgId: string;
  let repoId: string;
  let assessmentId: string;
  let questionIds: string[];
  let participantId: string;

  test.beforeAll(async () => {
    const admin = createAdminClient();
    user = await createE2EUser();
    orgId = await seedOrg(admin);
    repoId = await seedRepo(admin, orgId);
    await seedUserOrg(admin, user.userId, orgId);
    assessmentId = await seedAssessment(admin, orgId, repoId);
    questionIds = await seedQuestions(admin, orgId, assessmentId);
    participantId = await seedParticipant(
      admin, orgId, assessmentId, user.userId,
    );
  });

  test.afterAll(async () => {
    const admin = createAdminClient();
    await cleanupOrg(admin, orgId);
    await deleteE2EUser(user.userId);
  });

  test('Given an authenticated admin, when they view assessments, then the list and new-assessment link are visible', async ({
    page,
  }) => {
    await setE2EAuthCookies(page.context(), user, orgId);
    await page.goto('/assessments');

    await expect(
      page.getByRole('heading', { name: 'My Assessments' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'New Assessment' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'E2E Test Feature' }),
    ).toBeVisible();
  });

  test('Given a participant with a pending assessment, when they navigate to it, then the questions are displayed', async ({
    page,
  }) => {
    await setE2EAuthCookies(page.context(), user, orgId);
    await page.goto(`/assessments/${assessmentId}`);

    await expect(page.getByText('E2E Test Feature')).toBeVisible();
    await expect(
      page.getByText('How does this feature map real-world domain concepts'),
    ).toBeVisible();
    await expect(
      page.getByText('Why was the observer pattern chosen'),
    ).toBeVisible();
    await expect(
      page.getByText('What would need to change to support'),
    ).toBeVisible();
  });

  test('Given a participant with filled answers, when they submit, then answers are accepted and they see the confirmation', async ({
    page,
  }) => {
    await setE2EAuthCookies(page.context(), user, orgId);

    // Intercept the answers POST to avoid LLM calls (relevance + scoring).
    // Return 'accepted' and update DB to match.
    await page.route(`**/api/assessments/${assessmentId}/answers`, async (route) => {
      const admin = createAdminClient();
      await markParticipantSubmitted(admin, participantId);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'accepted',
          results: questionIds.map((qId) => ({
            question_id: qId,
            is_relevant: true,
            explanation: null,
            attempts_remaining: 0,
          })),
          participation: { completed: 1, total: 1 },
        }),
      });
    });

    await page.goto(`/assessments/${assessmentId}`);

    // Fill all three answer text areas
    const answerAreas = page.getByRole('textbox');
    const count = await answerAreas.count();
    for (let i = 0; i < count; i++) {
      await answerAreas.nth(i).fill(
        `This is a thoughtful answer to question ${i + 1} demonstrating understanding.`,
      );
    }

    await page.getByRole('button', { name: 'Submit answers' }).click();

    await expect(
      page.getByRole('heading', { name: 'Answers Submitted' }),
    ).toBeVisible();
    await expect(
      page.getByText('Your answers have been recorded'),
    ).toBeVisible();
  });

  test('Given a completed assessment with scores, when the user views results, then scores are displayed', async ({
    page,
  }) => {
    const admin = createAdminClient();
    await seedScores(admin, assessmentId, 0.85, [
      { questionId: questionIds[0]!, score: 0.9 },
      { questionId: questionIds[1]!, score: 0.8 },
      { questionId: questionIds[2]!, score: 0.85 },
    ]);

    await setE2EAuthCookies(page.context(), user, orgId);
    await page.goto(`/assessments/${assessmentId}/results`);

    await expect(
      page.getByRole('heading', { name: 'Assessment Results' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Comprehension Score' }),
    ).toBeVisible();
    await expect(page.getByText('85%')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Question Breakdown' }),
    ).toBeVisible();
  });
});
