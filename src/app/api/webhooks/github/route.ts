// POST /api/webhooks/github — GitHub App webhook entry point.
// Verifies HMAC-SHA256 signature, then delegates to the webhook event handler.
// Design reference: docs/design/v1-design.md §4.4, Story 1.1
// Convention: ADR-0014.

import type { NextRequest } from 'next/server';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { verifyWebhookSignature } from '@/lib/github/webhook-verification';
import { handleWebhookEvent } from '@/lib/github/installation-handlers';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';

// Fail fast at startup if the webhook secret is not configured.
const WEBHOOK_SECRET =
  process.env['GITHUB_WEBHOOK_SECRET'] ??
  (() => { throw new Error('Missing GITHUB_WEBHOOK_SECRET'); })();

// ---------------------------------------------------------------------------
// Contract types — response shapes for this endpoint (ADR-0014).
// ---------------------------------------------------------------------------

/**
 * POST /api/webhooks/github
 *
 * No JWT auth — verified via X-Hub-Signature-256 (HMAC-SHA256 of raw body).
 * Returns 401 on invalid signature, 200 { received: true } on success.
 * Installation events processed synchronously; all others acknowledged and ignored.
 */
interface WebhookSuccessResponse { received: true }

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-hub-signature-256') ?? '';
    if (!verifyWebhookSignature(body, signature, WEBHOOK_SECRET)) {
      throw new ApiError(401, 'Unauthorized');
    }
    const event = request.headers.get('x-github-event') ?? '';
    const payload = JSON.parse(body) as Record<string, unknown>;
    await handleWebhookEvent(event, payload, createSecretSupabaseClient());
    return json<WebhookSuccessResponse>({ received: true });
  } catch (error) {
    return handleApiError(error);
  }
}
