// Tests for POST /api/webhooks/github — GitHub App webhook entry point.
// Design reference: docs/design/v1-design.md §4.4

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before importing the route
// ---------------------------------------------------------------------------

vi.mock('@/lib/github/webhook-verification', () => ({
  verifyWebhookSignature: vi.fn(),
}));

vi.mock('@/lib/github/installation-handlers', () => ({
  handleWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase/secret', () => ({
  createSecretSupabaseClient: vi.fn(() => ({})),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { verifyWebhookSignature } from '@/lib/github/webhook-verification';
import { handleWebhookEvent } from '@/lib/github/installation-handlers';
import { POST } from '@/app/api/webhooks/github/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: string, event: string): NextRequest {
  const signature = 'sha256=placeholder';
  return new NextRequest('http://localhost/api/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signature,
      'x-github-event': event,
      'x-github-delivery': 'test-delivery-id',
    },
    body,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyWebhookSignature).mockReturnValue(true);
});

describe('POST /api/webhooks/github', () => {
  describe('Given an invalid webhook signature', () => {
    it('then returns 401 without calling the event handler', async () => {
      vi.mocked(verifyWebhookSignature).mockReturnValue(false);
      const req = makeRequest('{}', 'installation');
      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(handleWebhookEvent).not.toHaveBeenCalled();
    });
  });

  describe('Given a valid signature', () => {
    it('then calls handleWebhookEvent with event, payload, and supabase client', async () => {
      const payload = { action: 'created', installation: { id: 1 } };
      const req = makeRequest(JSON.stringify(payload), 'installation');
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(handleWebhookEvent).toHaveBeenCalledOnce();
      expect(handleWebhookEvent).toHaveBeenCalledWith('installation', payload, expect.anything());
    });

    it('then returns 200 with received:true', async () => {
      const req = makeRequest('{}', 'ping');
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json() as { received: boolean };
      expect(body.received).toBe(true);
    });
  });
});
