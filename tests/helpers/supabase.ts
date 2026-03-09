import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

const SUPABASE_URL = process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
const SUPABASE_ANON_KEY = process.env['SUPABASE_ANON_KEY'] ?? '';

/**
 * Creates a Supabase client using the service role key.
 * Bypasses RLS — use only in test setup/teardown, never in application code.
 */
export function createServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Creates a Supabase client authenticated as a specific user via a mock JWT.
 * The JWT is constructed to set auth.uid() in RLS policies.
 *
 * For local Supabase, use the service role to create a real auth user and obtain
 * a valid access token. This helper wraps that flow for integration tests.
 */
export function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Creates a Supabase client with a custom access token (for RLS-enforced tests).
 */
export function createAuthenticatedClient(accessToken: string): SupabaseClient<Database> {
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
  serviceClient: SupabaseClient<Database>,
  overrides: { email?: string; password?: string } = {},
): Promise<{ userId: string; email: string; accessToken: string }> {
  const email = overrides.email ?? `test-${crypto.randomUUID()}@example.com`;
  const password = overrides.password ?? 'test-password-123';

  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message}`);
  }

  const anonClient = createAnonClient();
  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
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
  serviceClient: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { error } = await serviceClient.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`Failed to delete test user ${userId}: ${error.message}`);
  }
}
