// Unit test for SignInButton — verifies OAuth scopes after cutover.
// Design reference: docs/design/lld-onboarding-auth-cutover.md §5
//
// Uses source-level assertion since the test harness does not include
// @testing-library/react. The acceptance criterion is that the scope
// string is exactly 'read:user'.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('SignInButton', () => {
  it('requests only the read:user scope', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../../src/app/auth/sign-in/SignInButton.tsx'),
      'utf8',
    );
    const scopeMatch = src.match(/scopes:\s*'([^']+)'/);
    expect(scopeMatch).not.toBeNull();
    expect(scopeMatch![1]).toBe('read:user');
  });
});
