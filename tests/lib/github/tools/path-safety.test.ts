import { describe, expect, it } from 'vitest';
import { resolveRepoPath } from '@/lib/github/tools/path-safety';
import type { PathSafetyResult } from '@/lib/github/tools/path-safety';

// ---------------------------------------------------------------------------
// path-safety — §17.1b BDD spec
// ---------------------------------------------------------------------------

describe('path-safety', () => {
  // Happy path

  it('accepts docs/adr/0014-api-routes.md', () => {
    const result: PathSafetyResult = resolveRepoPath('docs/adr/0014-api-routes.md');
    expect(result.ok).toBe(true);
  });

  it('returns normalised path for valid input', () => {
    const result = resolveRepoPath('docs/adr/0014-api-routes.md');
    if (!result.ok) throw new Error('Expected ok');
    expect(result.normalised).toBe('docs/adr/0014-api-routes.md');
  });

  // Normalisation [lld §17.1b line 403]

  it('normalises docs//adr//0014.md to docs/adr/0014.md', () => {
    const result = resolveRepoPath('docs//adr//0014.md');
    if (!result.ok) throw new Error('Expected ok');
    expect(result.normalised).toBe('docs/adr/0014.md');
  });

  // Absolute paths [lld §17.1b / req invariant #2]

  it('rejects /etc/passwd (absolute)', () => {
    const result = resolveRepoPath('/etc/passwd');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.reason).toBe('absolute');
  });

  it('rejects C:/Windows (absolute, Windows)', () => {
    const result = resolveRepoPath('C:/Windows');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.reason).toBe('absolute');
  });

  // Traversal [lld §17.1b / req invariant #2]

  it('rejects ../secrets', () => {
    const result = resolveRepoPath('../secrets');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.reason).toBe('traversal');
  });

  it('rejects docs/../../etc', () => {
    const result = resolveRepoPath('docs/../../etc');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.reason).toBe('traversal');
  });

  // Empty [lld §17.1b]

  it('rejects empty string', () => {
    const result = resolveRepoPath('');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.reason).toBe('empty');
  });

  it('rejects whitespace-only string', () => {
    const result = resolveRepoPath('   ');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.reason).toBe('empty');
  });

  // Invalid characters [lld §17.1b]

  it('rejects paths containing null bytes', () => {
    const result = resolveRepoPath('docs/\x00passwd');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.reason).toBe('invalid_chars');
  });
});
