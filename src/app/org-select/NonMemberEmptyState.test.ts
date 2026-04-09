// Component test — snapshot-style render using renderToStaticMarkup.
// No @testing-library/react dependency; vitest env is 'node'.

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NonMemberEmptyState } from './NonMemberEmptyState';

const REQUIRED_COPY =
  'You do not have access to any organisation using FCS. Ask your admin to install the app or add you to an org where it is installed.';

function render(): string {
  return renderToStaticMarkup(NonMemberEmptyState());
}

describe('NonMemberEmptyState', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the exact copy from requirement O.3', () => {
    const html = render();
    expect(html).toContain(REQUIRED_COPY);
    expect(html).toContain('<h1>No access</h1>');
  });

  it('links to NEXT_PUBLIC_GITHUB_APP_INSTALL_URL when set', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_GITHUB_APP_INSTALL_URL',
      'https://github.com/apps/custom/installations/new',
    );
    const html = render();
    expect(html).toContain(
      'href="https://github.com/apps/custom/installations/new"',
    );
  });

  it('falls back to the default install URL when the env var is not set', () => {
    vi.stubEnv('NEXT_PUBLIC_GITHUB_APP_INSTALL_URL', '');
    const html = render();
    expect(html).toContain(
      'href="https://github.com/apps/fcs-app/installations/new"',
    );
  });

  it('posts the sign-out form to /auth/sign-out', () => {
    const html = render();
    expect(html).toMatch(/<form[^>]*action="\/auth\/sign-out"[^>]*method="post"/);
    expect(html).toContain('<button type="submit">Sign out</button>');
  });
});
