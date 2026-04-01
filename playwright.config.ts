import { readFileSync, existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Load .env.test.local so E2E tests use local Supabase, not the cloud instance
// from .env.local. Existing env vars take precedence.
if (existsSync('.env.test.local')) {
  for (const line of readFileSync('.env.test.local', 'utf8').split('\n')) {
    const match = /^(\w+)=(.+)$/.exec(line);
    if (match?.[1] && match[2] && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const supabaseUrl = process.env['SUPABASE_URL'] ?? 'https://placeholder.supabase.co';
const publishableKey = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? 'placeholder-publishable-key';
const secretKey = process.env['SUPABASE_SECRET_KEY'] ?? 'placeholder-secret-key';

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
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      SUPABASE_SECRET_KEY: secretKey,
    },
  },
});
