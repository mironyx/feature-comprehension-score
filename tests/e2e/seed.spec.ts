import { test, expect } from '@playwright/test';

test.describe('Seed', () => {
  test('seed', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Feature Comprehension Score/);
  });
});
