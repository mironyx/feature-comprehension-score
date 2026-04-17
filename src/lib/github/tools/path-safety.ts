export type PathSafetyResult =
  | { ok: true; normalised: string }
  | { ok: false; reason: 'absolute' | 'traversal' | 'empty' | 'invalid_chars' };

const CONTROL_CHARS = /[\u0000-\u001F]/;
const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:/;

export function resolveRepoPath(raw: string): PathSafetyResult {
  if (raw.trim().length === 0) return { ok: false, reason: 'empty' };
  if (CONTROL_CHARS.test(raw)) return { ok: false, reason: 'invalid_chars' };
  if (raw.startsWith('/')) return { ok: false, reason: 'absolute' };
  if (WINDOWS_DRIVE_PREFIX.test(raw)) return { ok: false, reason: 'absolute' };

  const segments = raw.split('/').filter(s => s !== '' && s !== '.');
  if (segments.some(s => s === '..')) return { ok: false, reason: 'traversal' };

  const normalised = segments.join('/');
  if (normalised === '') return { ok: false, reason: 'empty' };
  return { ok: true, normalised };
}
