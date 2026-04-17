import { describe, expect, it } from 'vitest';
import { resolveRepoPath } from '@/lib/github/tools/path-safety';
import type { PathSafetyResult } from '@/lib/github/tools/path-safety';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(result: PathSafetyResult): result is { ok: true; normalised: string } {
  return result.ok === true;
}

function rejected(
  result: PathSafetyResult,
): result is { ok: false; reason: 'absolute' | 'traversal' | 'empty' | 'invalid_chars' } {
  return result.ok === false;
}

// ---------------------------------------------------------------------------
// path-safety — resolveRepoPath
// ---------------------------------------------------------------------------

describe('resolveRepoPath', () => {
  // -------------------------------------------------------------------------
  // Happy path — accepted inputs
  // -------------------------------------------------------------------------

  describe('Given a normal repo-relative file path', () => {
    it('then accepts docs/adr/0014-api-routes.md with ok=true', () => {
      const result = resolveRepoPath('docs/adr/0014-api-routes.md');
      expect(result.ok).toBe(true);
      if (ok(result)) {
        expect(result.normalised).toBe('docs/adr/0014-api-routes.md');
      }
    });

    it('then accepts a simple path at the repo root (README.md)', () => {
      const result = resolveRepoPath('README.md');
      expect(result.ok).toBe(true);
      if (ok(result)) {
        expect(result.normalised).toBe('README.md');
      }
    });

    it("then accepts './docs/adr/0014.md' and normalises away the leading './'", () => {
      const result = resolveRepoPath('./docs/adr/0014.md');
      expect(result.ok).toBe(true);
      if (ok(result)) {
        expect(result.normalised).toBe('docs/adr/0014.md');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Normalisation
  // -------------------------------------------------------------------------

  describe('Given a path with redundant slashes', () => {
    it("then normalises 'docs//adr//0014.md' to 'docs/adr/0014.md'", () => {
      const result = resolveRepoPath('docs//adr//0014.md');
      expect(result.ok).toBe(true);
      if (ok(result)) {
        expect(result.normalised).toBe('docs/adr/0014.md');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Rejections — absolute paths (reason = 'absolute')
  // -------------------------------------------------------------------------

  describe('Given an absolute POSIX path', () => {
    it("then rejects '/etc/passwd' with reason='absolute'", () => {
      const result = resolveRepoPath('/etc/passwd');
      expect(result.ok).toBe(false);
      if (rejected(result)) {
        expect(result.reason).toBe('absolute');
      }
    });
  });

  describe('Given a Windows-style absolute path', () => {
    it("then rejects 'C:/Windows/System32' with reason='absolute'", () => {
      const result = resolveRepoPath('C:/Windows/System32');
      expect(result.ok).toBe(false);
      if (rejected(result)) {
        expect(result.reason).toBe('absolute');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Rejections — traversal (reason = 'traversal')
  // -------------------------------------------------------------------------

  describe('Given a path that begins with a parent-directory segment', () => {
    it("then rejects '../secrets' with reason='traversal'", () => {
      const result = resolveRepoPath('../secrets');
      expect(result.ok).toBe(false);
      if (rejected(result)) {
        expect(result.reason).toBe('traversal');
      }
    });
  });

  describe('Given a path that traverses above the repo root after normalisation', () => {
    it("then rejects 'docs/../../etc' with reason='traversal'", () => {
      const result = resolveRepoPath('docs/../../etc');
      expect(result.ok).toBe(false);
      if (rejected(result)) {
        expect(result.reason).toBe('traversal');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Rejections — empty / whitespace-only (reason = 'empty')
  // -------------------------------------------------------------------------

  describe('Given an empty string', () => {
    it("then rejects '' with reason='empty'", () => {
      const result = resolveRepoPath('');
      expect(result.ok).toBe(false);
      if (rejected(result)) {
        expect(result.reason).toBe('empty');
      }
    });
  });

  describe('Given a whitespace-only string', () => {
    it("then rejects '   ' with reason='empty'", () => {
      const result = resolveRepoPath('   ');
      expect(result.ok).toBe(false);
      if (rejected(result)) {
        expect(result.reason).toBe('empty');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Rejections — invalid characters (reason = 'invalid_chars')
  // -------------------------------------------------------------------------

  describe('Given a path containing a null byte', () => {
    it("then rejects with reason='invalid_chars'", () => {
      const result = resolveRepoPath('docs/\0passwd');
      expect(result.ok).toBe(false);
      if (rejected(result)) {
        expect(result.reason).toBe('invalid_chars');
      }
    });
  });

  describe('Given a path containing a control character', () => {
    it("then rejects with reason='invalid_chars' for a path with \\x01", () => {
      const result = resolveRepoPath('docs/\x01file.md');
      expect(result.ok).toBe(false);
      if (rejected(result)) {
        expect(result.reason).toBe('invalid_chars');
      }
    });

    it("then rejects with reason='invalid_chars' for a path with \\x1F", () => {
      const result = resolveRepoPath('src/\x1Ffile.ts');
      expect(result.ok).toBe(false);
      if (rejected(result)) {
        expect(result.reason).toBe('invalid_chars');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Invariant: Row 2 — no path outside repo root
  // The result.normalised must never start with '..' when ok=true
  // -------------------------------------------------------------------------

  describe('Given any accepted path', () => {
    it('then the normalised path never starts with ".." (invariant row 2)', () => {
      const safePaths = [
        'docs/adr/0014.md',
        'README.md',
        './src/index.ts',
        'docs//design//v1.md',
      ];
      for (const p of safePaths) {
        const result = resolveRepoPath(p);
        if (ok(result)) {
          expect(result.normalised).not.toMatch(/^\.\./);
          expect(result.normalised).not.toMatch(/^\/(?!\/)/); // not absolute
        }
      }
    });
  });
});
