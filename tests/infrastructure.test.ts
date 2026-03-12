import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { server } from './mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Test infrastructure', () => {
  it('Vitest runs and reports coverage', () => {
    expect(true).toBe(true);
  });

  it('MSW intercepts HTTP requests', async () => {
    const response = await fetch(
      'https://api.github.com/repos/test-org/test-repo/pulls/1',
    );

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.number).toBe(1);
  });
});
