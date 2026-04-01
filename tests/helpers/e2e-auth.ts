/**
 * E2E auth helper — creates a Supabase test user and returns cookies
 * for Playwright to inject into the browser context.
 *
 * Requires a running local Supabase instance.
 * Issue: #138
 */

import { createClient } from '@supabase/supabase-js';
import type { BrowserContext } from '@playwright/test';

// API URL for admin operations (local Supabase)
const SUPABASE_URL = process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321';
const SECRET_KEY = process.env['SUPABASE_SECRET_KEY'] ?? '';
const PUBLISHABLE_KEY = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? '';

// The server derives the cookie name from NEXT_PUBLIC_SUPABASE_URL.
// For local dev, both URLs resolve to 127.0.0.1.
const SERVER_SUPABASE_URL =
  process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? SUPABASE_URL;

const CHUNK_SIZE = 3180;
const E2E_PASSWORD = 'e2e-test-password-123';

export interface E2EUser {
  userId: string;
  email: string;
}

function buildCookieStorageKey(): string {
  const ref = new URL(SERVER_SUPABASE_URL).hostname.split('.')[0];
  return `sb-${ref}-auth-token`;
}

function chunkSession(
  key: string,
  session: object,
): { name: string; value: string }[] {
  const json = JSON.stringify(session);
  if (json.length <= CHUNK_SIZE) {
    return [{ name: key, value: json }];
  }
  const chunks: { name: string; value: string }[] = [];
  for (let i = 0; i * CHUNK_SIZE < json.length; i++) {
    chunks.push({
      name: `${key}.${i}`,
      value: json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    });
  }
  return chunks;
}

export function createAdminClient() {
  return createClient(SUPABASE_URL, SECRET_KEY);
}

export async function createE2EUser(): Promise<E2EUser> {
  const admin = createAdminClient();
  const email = `e2e-${Date.now()}@test.local`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: E2E_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createE2EUser: ${error?.message}`);
  }

  return { userId: data.user.id, email };
}

export async function deleteE2EUser(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
}

/**
 * Injects Supabase auth session cookies and the fcs-org-id cookie
 * into a Playwright browser context.
 */
export async function setE2EAuthCookies(
  context: BrowserContext,
  user: E2EUser,
  orgId: string,
): Promise<void> {
  const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY);
  const { data, error } = await anon.auth.signInWithPassword({
    email: user.email,
    password: E2E_PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(`setE2EAuthCookies: ${error?.message}`);
  }

  const key = buildCookieStorageKey();
  const chunks = chunkSession(key, data.session);

  const cookies = [
    ...chunks.map((c) => ({
      name: c.name,
      value: c.value,
      domain: 'localhost',
      path: '/',
    })),
    {
      name: 'fcs-org-id',
      value: orgId,
      domain: 'localhost',
      path: '/',
    },
  ];

  await context.addCookies(cookies);
}
