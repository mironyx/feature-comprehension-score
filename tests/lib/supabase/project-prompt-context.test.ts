// Tests for loadProjectPromptContext — loads per-project prompt context for FCS rubric generation.
// Design reference: docs/design/lld-v11-e11-3-project-context-config.md §B.2
// Issue: #422

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { loadProjectPromptContext } from '@/lib/supabase/project-prompt-context';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Supabase client stub — mirrors org-prompt-context.test.ts shape.
// project resolver uses .eq('project_id', $1).maybeSingle()
// (NOT .is('project_id', null) — that is the org-level predicate).
// ---------------------------------------------------------------------------

interface StubRow {
  context: unknown;
}

function makeSupabase(row: StubRow | null, error: { message: string } | null = null) {
  const result = { data: row, error };
  const eqSpy = vi.fn();
  const isSpy = vi.fn();
  const chain = {
    eq: eqSpy,
    is: isSpy,
    maybeSingle: async () => result,
  };
  eqSpy.mockReturnValue(chain);
  isSpy.mockReturnValue(chain);
  return {
    from: () => ({ select: () => chain }),
    _spies: { eq: eqSpy, is: isSpy },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadProjectPromptContext', () => {
  it('returns parsed ProjectPromptContext when a row exists for the project', async () => {
    const context = {
      domain_notes: 'Event sourcing architecture.',
      glob_patterns: ['docs/adr/*.md', '**/*.ts'],
      question_count: 5,
    };
    const supabase = makeSupabase({ context });
    const result = await loadProjectPromptContext(supabase as never, 'project-1');
    expect(result).toEqual(context);
  });

  it('returns undefined when no row exists for the project', async () => {
    const supabase = makeSupabase(null);
    const result = await loadProjectPromptContext(supabase as never, 'project-1');
    expect(result).toBeUndefined();
  });

  it('returns undefined when the row exists but the context fails schema parse (logs warn)', async () => {
    // question_count: 99 violates max(8); focus_areas: 'string' violates array shape
    const supabase = makeSupabase({ context: { question_count: 99 } });
    const result = await loadProjectPromptContext(supabase as never, 'project-1');
    expect(result).toBeUndefined();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledOnce();
  });

  it('does NOT return the org-level row (project_id IS NULL) when both org and project rows exist', async () => {
    // The project resolver must query with .eq('project_id', projectId), never with .is('project_id', null).
    const context = { domain_notes: 'project-specific context' };
    const supabase = makeSupabase({ context });
    await loadProjectPromptContext(supabase as never, 'project-abc');

    // Assert .eq was called with the project_id predicate
    expect(supabase._spies.eq).toHaveBeenCalledWith('project_id', 'project-abc');
    // Assert .is was never called (org-level predicate must be absent from this resolver)
    expect(supabase._spies.is).not.toHaveBeenCalled();
  });

  it('rejects with loadProjectPromptContext: <message> when Supabase returns an error', async () => {
    const supabase = makeSupabase(null, { message: 'connection refused' });
    await expect(loadProjectPromptContext(supabase as never, 'project-1'))
      .rejects.toThrow('loadProjectPromptContext: connection refused');
  });
});
