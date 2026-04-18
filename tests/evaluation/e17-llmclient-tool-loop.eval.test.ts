import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Engine-layer isolation — types.ts
//
// tools.test.ts (Property 6) already checks tools.ts for forbidden imports.
// types.ts was also modified in §17.1a (gained import from ./tools) and is
// equally part of the engine layer. AC-3 says "engine layer has zero
// framework/I/O imports" — this test extends that invariant to types.ts.
// ---------------------------------------------------------------------------

describe('Given the engine layer isolation invariant (types.ts)', () => {
  const TYPES_FILE = resolve(__dirname, '../../src/lib/engine/llm/types.ts');

  const FORBIDDEN_PATTERNS = [
    '@/lib/github',
    '@/lib/supabase',
    "from 'next/",
    'from "next/',
    'node:fs',
    'node:path',
  ];

  it('then types.ts contains no forbidden framework/I/O import strings', () => {
    const content = readFileSync(TYPES_FILE, 'utf-8');
    const violations = FORBIDDEN_PATTERNS.filter((p) => content.includes(p));
    expect(violations).toHaveLength(0);
  });
});
