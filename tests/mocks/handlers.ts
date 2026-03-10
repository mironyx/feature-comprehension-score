import { mockPullRequest } from './github';
import { mockClaudeMessages } from './anthropic';

/**
 * Default handlers used across all tests.
 * Individual tests can override these by prepending handlers via server.use().
 */
export const handlers = [
  mockPullRequest('test-org', 'test-repo', 1),
  mockClaudeMessages('Default mock response from Claude.'),
];
