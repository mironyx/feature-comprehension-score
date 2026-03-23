import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'list' : 'html',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // Both CI and local: start the pre-built standalone server.
    // Run `npm run build` before running E2E tests if the build is stale.
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      HOSTNAME: 'localhost',
      NEXT_PUBLIC_SUPABASE_URL:
        process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] ?? 'placeholder-publishable-key',
      SUPABASE_SECRET_KEY: process.env['SUPABASE_SECRET_KEY'] ?? 'placeholder-secret-key',
    },
  },
});
