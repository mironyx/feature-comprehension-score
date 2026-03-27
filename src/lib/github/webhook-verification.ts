// HMAC-SHA256 signature verification for GitHub App webhooks.
// Design reference: docs/design/v1-design.md §4.4 POST /api/webhooks/github

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies the X-Hub-Signature-256 header sent by GitHub.
 * Returns true only if the signature matches the HMAC-SHA256 of the body.
 */
export function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  if (!signature.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // Buffer lengths differ — signature cannot match
    return false;
  }
}
