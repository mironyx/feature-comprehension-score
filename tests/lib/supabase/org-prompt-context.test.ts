// Tests for loadOrgPromptContext — loads organisation prompt context for rubric generation.
// Design reference: docs/design/lld-organisation-context.md §4.1

import { describe, expect, it } from 'vitest';
import { loadOrgPromptContext } from '@/lib/supabase/org-prompt-context';

// ---------------------------------------------------------------------------
// Supabase client stub
// ---------------------------------------------------------------------------

interface StubRow {
  context: unknown;
}

function makeSupabase(row: StubRow | null, error: { message: string } | null = null) {
  const result = { data: row, error };
  const chain = { eq: () => chain, is: () => chain, maybeSingle: async () => result };
  return { from: () => ({ select: () => chain }) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadOrgPromptContext', () => {
  it('returns undefined when no row exists for the org', async () => {
    const supabase = makeSupabase(null);
    const result = await loadOrgPromptContext(supabase as never, 'org-1');
    expect(result).toBeUndefined();
  });

  it('returns the parsed OrganisationContext when a valid row exists', async () => {
    const context = {
      focus_areas: ['security'],
      domain_notes: 'Event sourcing.',
    };
    const supabase = makeSupabase({ context });
    const result = await loadOrgPromptContext(supabase as never, 'org-1');
    expect(result).toEqual(context);
  });

  it('returns undefined when the stored JSONB fails schema validation', async () => {
    const supabase = makeSupabase({ context: { focus_areas: 'not-an-array' } });
    const result = await loadOrgPromptContext(supabase as never, 'org-1');
    expect(result).toBeUndefined();
  });

  it('throws when Supabase returns an error', async () => {
    const supabase = makeSupabase(null, { message: 'connection failed' });
    await expect(loadOrgPromptContext(supabase as never, 'org-1'))
      .rejects.toThrow('loadOrgPromptContext: connection failed');
  });
});
