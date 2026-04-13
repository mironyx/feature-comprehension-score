import { test, expect } from '@playwright/test';

test.describe('Sign-in page', () => {
  test('Given a visitor, when they navigate to the sign-in page, then they see the sign-in heading', async ({
    page,
  }) => {
    await page.goto('/auth/sign-in');
    await expect(
      page.getByRole('heading', { name: 'Sign in' }),
    ).toBeVisible();
  });
});
