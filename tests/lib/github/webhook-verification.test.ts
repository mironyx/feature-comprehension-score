// Tests for HMAC-SHA256 webhook signature verification.
// Design reference: docs/design/v1-design.md §4.4 POST /api/webhooks/github

import { createHmac, randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { verifyWebhookSignature } from '@/lib/github/webhook-verification';

const WEBHOOK_SIGNING_KEY = randomBytes(32).toString('hex');
const BODY = '{"action":"created","installation":{"id":1}}';

function sign(body: string, secret: string): string {
  const hex = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hex}`;
}

describe('verifyWebhookSignature', () => {
  describe('Given a valid signature', () => {
    it('then returns true', () => {
      const signature = sign(BODY, WEBHOOK_SIGNING_KEY);
      expect(verifyWebhookSignature(BODY, signature, WEBHOOK_SIGNING_KEY)).toBe(true);
    });
  });

  describe('Given a signature computed with the wrong secret', () => {
    it('then returns false', () => {
      const signature = sign(BODY, 'wrong-secret');
      expect(verifyWebhookSignature(BODY, signature, WEBHOOK_SIGNING_KEY)).toBe(false);
    });
  });

  describe('Given a tampered body', () => {
    it('then returns false', () => {
      const signature = sign(BODY, WEBHOOK_SIGNING_KEY);
      expect(verifyWebhookSignature('{"action":"deleted"}', signature, WEBHOOK_SIGNING_KEY)).toBe(false);
    });
  });

  describe('Given a signature without the sha256= prefix', () => {
    it('then returns false', () => {
      const hex = createHmac('sha256', WEBHOOK_SIGNING_KEY).update(BODY).digest('hex');
      expect(verifyWebhookSignature(BODY, hex, WEBHOOK_SIGNING_KEY)).toBe(false);
    });
  });

  describe('Given an empty signature', () => {
    it('then returns false', () => {
      expect(verifyWebhookSignature(BODY, '', WEBHOOK_SIGNING_KEY)).toBe(false);
    });
  });
});
