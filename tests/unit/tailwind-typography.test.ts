/**
 * Regression tests for issue #344 — responsive heading sizes.
 *
 * The three largest tokens (`display`, `heading-xl`, `heading-lg`) must use
 * `clamp(min, preferred, max)` so they scale with viewport width and avoid
 * horizontal overflow on narrow mobile screens. Smaller sizes stay fixed.
 */
import { describe, expect, it } from 'vitest';
import tailwindConfig from '../../tailwind.config';

type FontSizeEntry = readonly [string, { lineHeight: string; fontWeight: string }];

function getFontSize(token: string): FontSizeEntry {
  const fontSize = (tailwindConfig.theme?.extend?.fontSize ?? {}) as Record<string, FontSizeEntry>;
  const entry = fontSize[token];
  if (!entry) throw new Error(`fontSize token "${token}" missing from tailwind.config.ts`);
  return entry;
}

describe('Responsive headings — tailwind.config.ts fontSize', () => {
  it('display uses clamp(2.5rem, 6vw, 4rem)', () => {
    const [size, meta] = getFontSize('display');
    expect(size).toBe('clamp(2.5rem, 6vw, 4rem)');
    expect(meta).toEqual({ lineHeight: '1.0', fontWeight: '700' });
  });

  it('heading-xl uses clamp(1.5rem, 4vw, 2.25rem)', () => {
    const [size, meta] = getFontSize('heading-xl');
    expect(size).toBe('clamp(1.5rem, 4vw, 2.25rem)');
    expect(meta).toEqual({ lineHeight: '1.2', fontWeight: '700' });
  });

  it('heading-lg uses clamp(1.25rem, 3vw, 1.5rem)', () => {
    const [size, meta] = getFontSize('heading-lg');
    expect(size).toBe('clamp(1.25rem, 3vw, 1.5rem)');
    expect(meta).toEqual({ lineHeight: '1.3', fontWeight: '600' });
  });

  it.each([
    ['heading-md', '1.125rem', { lineHeight: '1.4', fontWeight: '600' }],
    ['body', '0.9375rem', { lineHeight: '1.6', fontWeight: '400' }],
    ['label', '0.8125rem', { lineHeight: '1.4', fontWeight: '500' }],
    ['caption', '0.75rem', { lineHeight: '1.5', fontWeight: '400' }],
  ] as const)('keeps %s fixed at %s (no clamp)', (token, expectedSize, expectedMeta) => {
    const [size, meta] = getFontSize(token);
    expect(size).toBe(expectedSize);
    expect(size).not.toMatch(/clamp\(/);
    expect(meta).toEqual(expectedMeta);
  });
});
