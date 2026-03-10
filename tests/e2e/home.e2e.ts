import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test('Given a visitor, when they navigate to the home page, then they see the heading', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Feature Comprehension Score' }),
    ).toBeVisible();
  });
});
