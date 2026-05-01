// Evaluation tests for POST + GET /api/projects (T1.3, issue #396).
// Covers gaps not addressed by the primary test-author:
//   AC-3: CreateProjectSchema rejects invalid names (empty, > 200 chars)
//   AC-12: GET /api/projects returns 400 when org_id query param is absent

import { describe, it, expect, vi } from 'vitest';
import { CreateProjectSchema } from '@/app/api/projects/validation';

// ---------------------------------------------------------------------------
// AC-3: Validation schema — name constraints
// ---------------------------------------------------------------------------

describe('CreateProjectSchema — name validation [req §Story 1.1 AC 3]', () => {
  describe('Given a payload with no name field', () => {
    it('fails validation with a "Required" or min-length error', () => {
      const result = CreateProjectSchema.safeParse({ org_id: 'a0000000-0000-4000-8000-000000000001' });
      expect(result.success).toBe(false);
    });
  });

  describe('Given a payload with an empty string name', () => {
    it('fails validation (name must be at least 1 character) [req §Story 1.1 AC 3, lld §B.3]', () => {
      const result = CreateProjectSchema.safeParse({
        org_id: 'a0000000-0000-4000-8000-000000000001',
        name: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Given a payload with a name of exactly 201 characters', () => {
    it('fails validation (max 200 chars) [req §Story 1.1 AC 3, lld §B.3]', () => {
      const result = CreateProjectSchema.safeParse({
        org_id: 'a0000000-0000-4000-8000-000000000001',
        name: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Given a payload with a name of exactly 200 characters', () => {
    it('passes validation (boundary value — 200 is the limit) [req §Story 1.1 AC 3, lld §B.3]', () => {
      const result = CreateProjectSchema.safeParse({
        org_id: 'a0000000-0000-4000-8000-000000000001',
        name: 'a'.repeat(200),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Given a payload with a name of exactly 1 character', () => {
    it('passes validation (boundary value — 1 is the minimum) [req §Story 1.1 AC 3, lld §B.3]', () => {
      const result = CreateProjectSchema.safeParse({
        org_id: 'a0000000-0000-4000-8000-000000000001',
        name: 'X',
      });
      expect(result.success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// AC-3 (additional): org_id must be a valid UUID
// ---------------------------------------------------------------------------

describe('CreateProjectSchema — org_id validation [lld §B.3]', () => {
  describe('Given a payload with a non-UUID org_id', () => {
    it('fails validation', () => {
      const result = CreateProjectSchema.safeParse({
        org_id: 'not-a-uuid',
        name: 'Payment Service',
      });
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// AC-12: GET /api/projects — missing org_id query param → 400
// ---------------------------------------------------------------------------

vi.mock('@/lib/api/context', () => ({
  createApiContext: vi.fn().mockResolvedValue({
    user: { id: 'user-uuid-001', email: 'alice@example.com', githubUserId: 42, githubUsername: 'alice' },
    supabase: { from: vi.fn() },
    adminSupabase: { from: vi.fn() },
  }),
}));

describe('GET /api/projects — missing org_id query param [lld §B.3 BDD]', () => {
  describe('Given a GET request with no org_id query parameter', () => {
    it('returns HTTP 400 [lld §B.3: "org_id required" guard]', async () => {
      const { NextRequest } = await import('next/server');
      const { GET } = await import('@/app/api/projects/route');
      const request = new NextRequest('http://localhost/api/projects');
      const response = await GET(request);
      expect(response.status).toBe(400);
    });

    it('response body contains an error field [lld §B.3]', async () => {
      const { NextRequest } = await import('next/server');
      const { GET } = await import('@/app/api/projects/route');
      const request = new NextRequest('http://localhost/api/projects');
      const response = await GET(request);
      const body = await response.json() as { error?: string };
      expect(body.error).toBeDefined();
    });
  });
});
