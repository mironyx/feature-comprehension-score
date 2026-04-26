// Tests for root layout — font loading and globals.css wiring.
// Design reference: docs/design/frontend-system.md § Typography, Layout Shell
// Issue: #164

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/font/google', () => ({
  Syne: vi.fn(() => ({ variable: '--font-syne' })),
  Outfit: vi.fn(() => ({ variable: '--font-outfit' })),
}));

async function renderLayout(): Promise<React.ReactElement> {
  const { default: RootLayout } = await import('@/app/layout');
  return RootLayout({ children: 'test content' }) as React.ReactElement;
}

describe('Root layout', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('Given the root layout renders', () => {
    it('then <html> has lang="en" and both font variable classes', async () => {
      const html = await renderLayout();

      expect(html.type).toBe('html');
      expect(html.props.lang).toBe('en');
      expect(html.props.className).toContain('--font-syne');
      expect(html.props.className).toContain('--font-outfit');
    });

    it('then <body> has font-sans and base colour classes', async () => {
      const html = await renderLayout();
      const children = html.props.children as React.ReactElement[];
      const body = children.find(
        (child) => (child as { type?: string }).type === 'body'
      ) as React.ReactElement;

      expect(body).toBeDefined();
      expect(body.type).toBe('body');
      expect(body.props.className).toContain('font-sans');
      expect(body.props.className).toContain('bg-background');
      expect(body.props.className).toContain('text-text-primary');
    });

    it('then <head> contains an inline theme initialisation script', async () => {
      // Issue #343: prevent flash of wrong theme on page load.
      const html = await renderLayout();
      const children = html.props.children as React.ReactElement[];
      const head = children.find(
        (child) => (child as { type?: string }).type === 'head'
      ) as React.ReactElement | undefined;

      expect(head).toBeDefined();
      const script = (head!.props.children as { type: string; props: { dangerouslySetInnerHTML: { __html: string } } });
      expect(script.type).toBe('script');
      const code = script.props.dangerouslySetInnerHTML.__html;
      expect(code).toContain('fcs-theme');
      expect(code).toContain('data-theme');
      expect(code).toContain('prefers-color-scheme');
    });
  });
});
