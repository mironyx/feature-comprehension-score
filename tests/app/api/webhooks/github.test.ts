// Tests for POST /api/webhooks/github — GitHub App webhook entry point.
// Design reference: docs/design/v1-design.md §4.4

import { createHmac } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before importing the route
// ---------------------------------------------------------------------------

vi.mock('@/lib/github/webhook-verification', () => ({
  verifyWebhookSignature: vi.fn(),
}));

vi.mock('@/lib/github/installation-handlers', () => ({
  handleInstallationCreated: vi.fn().mockResolvedValue(undefined),
  handleInstallationDeleted: vi.fn().mockResolvedValue(undefined),
  handleRepositoriesAdded: vi.fn().mockResolvedValue(undefined),
  handleRepositoriesRemoved: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase/secret', () => ({
  createSecretSupabaseClient: vi.fn(() => ({})),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { verifyWebhookSignature } from '@/lib/github/webhook-verification';
import {
  handleInstallationCreated,
  handleInstallationDeleted,
  handleRepositoriesAdded,
  handleRepositoriesRemoved,
} from '@/lib/github/installation-handlers';
import { POST } from '@/app/api/webhooks/github/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET = 'test-secret';

function sign(body: string): string {
  return `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
}

function makeRequest(body: string, event: string, validSig = true): NextRequest {
  const signature = validSig ? sign(body) : 'sha256=invalid';
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
  // Default: signature is valid
  vi.mocked(verifyWebhookSignature).mockReturnValue(true);
});

describe('POST /api/webhooks/github', () => {
  describe('Given an invalid webhook signature', () => {
    it('then returns 401', async () => {
      vi.mocked(verifyWebhookSignature).mockReturnValue(false);
      const req = makeRequest('{}', 'installation', false);
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe('Given an unknown event type', () => {
    it('then returns 200 with received:true without calling any handler', async () => {
      const req = makeRequest('{}', 'ping');
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json() as { received: boolean };
      expect(body.received).toBe(true);
      expect(handleInstallationCreated).not.toHaveBeenCalled();
    });
  });

  describe('Given an installation.created event', () => {
    it('then calls handleInstallationCreated and returns 200', async () => {
      const payload = {
        action: 'created',
        installation: { id: 1, account: { id: 2, login: 'acme', type: 'Organization' }, app_id: 3 },
      };
      const req = makeRequest(JSON.stringify(payload), 'installation');
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(handleInstallationCreated).toHaveBeenCalledOnce();
    });
  });

  describe('Given an installation.deleted event', () => {
    it('then calls handleInstallationDeleted and returns 200', async () => {
      const payload = {
        action: 'deleted',
        installation: { id: 1, account: { id: 2, login: 'acme', type: 'Organization' }, app_id: 3 },
      };
      const req = makeRequest(JSON.stringify(payload), 'installation');
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(handleInstallationDeleted).toHaveBeenCalledOnce();
    });
  });

  describe('Given an installation_repositories.added event', () => {
    it('then calls handleRepositoriesAdded and returns 200', async () => {
      const payload = {
        action: 'added',
        installation: { id: 1 },
        repositories_added: [{ id: 10, name: 'repo', full_name: 'acme/repo' }],
        repositories_removed: [],
      };
      const req = makeRequest(JSON.stringify(payload), 'installation_repositories');
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(handleRepositoriesAdded).toHaveBeenCalledOnce();
    });
  });

  describe('Given an installation_repositories.removed event', () => {
    it('then calls handleRepositoriesRemoved and returns 200', async () => {
      const payload = {
        action: 'removed',
        installation: { id: 1 },
        repositories_added: [],
        repositories_removed: [{ id: 10, name: 'repo', full_name: 'acme/repo' }],
      };
      const req = makeRequest(JSON.stringify(payload), 'installation_repositories');
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(handleRepositoriesRemoved).toHaveBeenCalledOnce();
    });
  });
});
