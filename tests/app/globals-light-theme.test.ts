// Tests for light theme colour tokens in globals.css.
// Design reference: docs/design/lld-v7-frontend-ux.md § T3
// Issue: #342

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cssSrc = readFileSync(
  resolve(__dirname, '../../src/app/globals.css'),
  'utf8',
);

const REQUIRED_VARIABLES = [
  '--color-background',
  '--color-surface',
  '--color-surface-raised',
  '--color-border',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-accent',
  '--color-accent-hover',
  '--color-accent-muted',
  '--color-destructive',
  '--color-destructive-muted',
  '--color-success',
] as const;

function extractBlock(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  if (!match) throw new Error(`Block "${selector}" not found in globals.css`);
  return match[1];
}

function relativeLuminance(hex: string): number {
  const channel = (n: number): number => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

describe('Light theme tokens', () => {
  describe('Given a [data-theme="light"] block exists in globals.css', () => {
    const lightBlock = extractBlock(cssSrc, '[data-theme="light"]');

    it.each(REQUIRED_VARIABLES)('then it defines %s', (variable) => {
      expect(lightBlock).toMatch(new RegExp(`${variable}\\s*:\\s*#[0-9a-fA-F]{3,8}`));
    });
  });

  describe('Given the dark theme remains the default', () => {
    const rootBlock = extractBlock(cssSrc, ':root');

    it('then :root defines --color-background as the dark value #0d0f14', () => {
      expect(rootBlock).toMatch(/--color-background\s*:\s*#0d0f14/);
    });

    it('then :root defines --color-text-primary as the dark value #e8eaf0', () => {
      expect(rootBlock).toMatch(/--color-text-primary\s*:\s*#e8eaf0/);
    });
  });

  describe('Given light theme text/bg combinations are evaluated for WCAG AA', () => {
    it.each([
      ['text-primary on background', '#1a1d23', '#f5f4f0'],
      ['text-secondary on background', '#5c6370', '#f5f4f0'],
      ['accent on background', '#92400e', '#f5f4f0'],
      ['accent on surface', '#92400e', '#ffffff'],
      ['destructive on background', '#b91c1c', '#f5f4f0'],
      ['success on background', '#15803d', '#f5f4f0'],
    ])('then %s meets the 4.5:1 ratio', (_label, fg, bg) => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  });
});
