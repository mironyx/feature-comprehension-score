// Tests for org cookie context helpers.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.3

import { describe, expect, it, vi } from 'vitest';
import { getSelectedOrgId, setSelectedOrgId } from '@/lib/supabase/org-context';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCookies(values: Record<string, string>) {
  return {
    get: (name: string) => {
      const value = values[name];
      return value !== undefined ? { name, value } : undefined;
    },
    getAll: () => Object.entries(values).map(([name, value]) => ({ name, value })),
  };
}

function makeResponse() {
  const cookies: Record<string, { value: string; options?: Record<string, unknown> }> = {};
  return {
    cookies: {
      set: vi.fn((name: string, value: string, options?: Record<string, unknown>) => {
        cookies[name] = { value, options };
      }),
    },
    _cookies: cookies,
  };
}

// ---------------------------------------------------------------------------
// getSelectedOrgId
// ---------------------------------------------------------------------------

describe('getSelectedOrgId', () => {
  it('Given fcs-org-id cookie is set, returns its value', () => {
    const cookies = makeCookies({ 'fcs-org-id': 'org-uuid-001' });
    expect(getSelectedOrgId(cookies as never)).toBe('org-uuid-001');
  });

  it('Given fcs-org-id cookie is absent, returns null', () => {
    const cookies = makeCookies({});
    expect(getSelectedOrgId(cookies as never)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setSelectedOrgId
// ---------------------------------------------------------------------------

describe('setSelectedOrgId', () => {
  it('Given a response and org ID, sets fcs-org-id cookie on the response', () => {
    const response = makeResponse();
    setSelectedOrgId(response as never, 'org-uuid-002');
    expect(response.cookies.set).toHaveBeenCalledOnce();
    expect(response.cookies.set).toHaveBeenCalledWith(
      'fcs-org-id',
      'org-uuid-002',
      expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax' }),
    );
  });
});
