import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { server } from './server';
import { mockPullRequest } from './github';
import { mockClaudeMessages } from './anthropic';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('MSW integration', () => {
  it('Given default handlers, when fetching a GitHub PR, then it returns mock data', async () => {
    const response = await fetch(
      'https://api.github.com/repos/test-org/test-repo/pulls/1',
    );
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.number).toBe(1);
    expect(data.title).toBe('PR #1');
  });

  it('Given default handlers, when calling the Claude API, then it returns mock data', async () => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', messages: [] }),
    });
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.content[0].text).toBe('Default mock response from Claude.');
  });

  it('Given a per-test override, when fetching, then the override takes precedence', async () => {
    server.use(
      mockPullRequest('test-org', 'test-repo', 1, { title: 'Overridden PR' }),
    );

    const response = await fetch(
      'https://api.github.com/repos/test-org/test-repo/pulls/1',
    );
    const data = await response.json();

    expect(data.title).toBe('Overridden PR');
  });

  it('Given a custom Claude response, when calling the API, then it returns custom content', async () => {
    server.use(mockClaudeMessages('Custom scoring response.'));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', messages: [] }),
    });
    const data = await response.json();

    expect(data.content[0].text).toBe('Custom scoring response.');
  });
});
