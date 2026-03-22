import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

const SUPABASE_URL = process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321';
const SUPABASE_SECRET_KEY = process.env['SUPABASE_SECRET_KEY'] ?? '';
const SUPABASE_PUBLISHABLE_KEY = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? '';

/**
 * Creates a Supabase client using the secret key.
 * Bypasses RLS — use only in test setup/teardown, never in application code.
 */
export function createSecretClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_SECRET_KEY);
}

/**
 * Creates a Supabase client authenticated as a specific user via a mock JWT.
 * The JWT is constructed to set auth.uid() in RLS policies.
 *
 * For local Supabase, use the secret client to create a real auth user and obtain
 * a valid access token. This helper wraps that flow for integration tests.
 */
export function createPublishableClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}

/**
 * Creates a Supabase client with a custom access token (for RLS-enforced tests).
 */
export function createAuthenticatedClient(accessToken: string): SupabaseClient<Database> {
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return client;
}

/**
 * Creates a test user via the Supabase Auth admin API and returns the user ID
 * and a signed-in client. The user is created with a random email to avoid
 * collisions between test runs.
 */
export async function createTestUser(
  secretClient: SupabaseClient<Database>,
  overrides: { email?: string; password?: string } = {},
): Promise<{ userId: string; email: string; accessToken: string }> {
  const email = overrides.email ?? `test-${crypto.randomUUID()}@example.com`;
  const password = overrides.password ?? 'test-password-123';

  const { data, error } = await secretClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message}`);
  }

  const publishableClient = createPublishableClient();
  const { data: signInData, error: signInError } = await publishableClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in test user: ${signInError?.message}`);
  }

  return {
    userId: data.user.id,
    email,
    accessToken: signInData.session.access_token,
  };
}

/**
 * Deletes a test user by ID. Call in afterEach/afterAll to clean up.
 */
export async function deleteTestUser(
  secretClient: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { error } = await secretClient.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`Failed to delete test user ${userId}: ${error.message}`);
  }
}
