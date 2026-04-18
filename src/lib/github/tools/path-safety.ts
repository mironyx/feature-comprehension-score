export type PathSafetyResult =
  | { ok: true; normalised: string }
  | { ok: false; reason: 'absolute' | 'traversal' | 'empty' | 'invalid_chars' };

// Control characters (including null bytes) are rejected before normalisation.
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;
const WINDOWS_DRIVE = /^[A-Za-z]:/;

export function resolveRepoPath(raw: string): PathSafetyResult {
  if (raw.trim().length === 0) return { ok: false, reason: 'empty' };
  if (CONTROL_CHARS.test(raw)) return { ok: false, reason: 'invalid_chars' };
  if (raw.startsWith('/') || WINDOWS_DRIVE.test(raw)) return { ok: false, reason: 'absolute' };

  const segments = raw.split('/').filter(s => s.length > 0);
  if (segments.some(s => s === '..')) return { ok: false, reason: 'traversal' };

  return { ok: true, normalised: segments.join('/') };
}
