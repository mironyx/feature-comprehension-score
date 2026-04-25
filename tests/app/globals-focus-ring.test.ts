// Tests for global focus-visible ring and dark theme contrast fix.
// Design reference: docs/design/lld-v7-frontend-ux.md § T9
// Issue: #348

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cssSrc = readFileSync(
  resolve(__dirname, '../../src/app/globals.css'),
  'utf8',
);

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

describe('Global focus-visible ring', () => {
  describe('Given globals.css declares an @layer base focus-visible rule', () => {
    it('then the rule lives inside an @layer base block', () => {
      expect(cssSrc).toMatch(/@layer\s+base\s*\{[\s\S]*\*:focus-visible\s*\{/);
    });

    it('then the universal selector *:focus-visible is targeted (covers buttons, inputs, links)', () => {
      expect(cssSrc).toMatch(/\*:focus-visible\s*\{/);
    });

    it('then the rule paints a 2px ring using the accent token via box-shadow', () => {
      expect(cssSrc).toMatch(/\*:focus-visible\s*\{[^}]*box-shadow\s*:\s*0\s+0\s+0\s+2px\s+var\(--color-accent\)/);
    });

    it('then the rule clears the default outline so only the ring is visible', () => {
      expect(cssSrc).toMatch(/\*:focus-visible\s*\{[^}]*outline\s*:\s*none/);
    });

    it('then the rule inherits border-radius so the ring follows rounded elements', () => {
      expect(cssSrc).toMatch(/\*:focus-visible\s*\{[^}]*border-radius\s*:\s*inherit/);
    });

    it('then the rule uses :focus-visible (not :focus) so mouse clicks do not show the ring', () => {
      const block = /\*:focus-visible\s*\{([^}]*)\}/.exec(cssSrc)?.[1] ?? '';
      expect(block).not.toMatch(/:focus[^-]/);
    });
  });
});

describe('Dark theme contrast fix', () => {
  describe('Given the :root block defines the dark theme palette', () => {
    const rootMatch = /:root\s*\{([^}]*)\}/.exec(cssSrc);
    const rootBlock = rootMatch?.[1] ?? '';

    it('then --color-text-secondary is #8f96a8 (raised from #7a8499 for WCAG AA)', () => {
      expect(rootBlock).toMatch(/--color-text-secondary\s*:\s*#8f96a8/);
    });

    it('then the old low-contrast value #7a8499 is gone from :root', () => {
      expect(rootBlock).not.toMatch(/#7a8499/);
    });
  });

  describe('Given the updated --color-text-secondary is evaluated against the dark background', () => {
    it('then #8f96a8 on #0d0f14 meets the 4.5:1 WCAG AA threshold', () => {
      expect(contrastRatio('#8f96a8', '#0d0f14')).toBeGreaterThanOrEqual(4.5);
    });
  });
});
