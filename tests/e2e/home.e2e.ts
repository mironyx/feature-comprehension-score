import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test('Given an unauthenticated visitor, when they navigate to the home page, then they are redirected to sign-in', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Sign in to Feature Comprehension Score' }),
    ).toBeVisible();
  });
});
