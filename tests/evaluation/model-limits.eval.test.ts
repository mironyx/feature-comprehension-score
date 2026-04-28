/**
 * Adversarial evaluation tests for issue #328 — model context limit lookup.
 *
 * Gap: AC-5 [req §Story 1.1] states both "network error" and "non-2xx response"
 * must fall back to DEFAULT_CONTEXT_LIMIT with a warning. The test-author's file
 * covers the network error path (HttpResponse.error()) exhaustively with three
 * tests, but the !response.ok branch (HTTP 4xx/5xx) has a different code path
 * and different warning message — it is not exercised by any existing test.
 *
 * These two tests probe that branch. Failures are findings — do NOT fix the
 * implementation here.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import {
  DEFAULT_CONTEXT_LIMIT,
  clearModelLimitsCache,
  getModelContextLimit,
} from '@/lib/openrouter/model-limits';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models/user';

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('getModelContextLimit — non-2xx HTTP response', () => {
  beforeEach(() => {
    clearModelLimitsCache();
  });

  describe('Given the OpenRouter API returns a non-2xx status (e.g. 500)', () => {
    it('should fall back to DEFAULT_CONTEXT_LIMIT', async () => {
      // [req §Story 1.1] — "non-2xx response" is an explicit failure mode
      // that must fall back to the conservative default
      server.use(
        http.get(OPENROUTER_MODELS_URL, () =>
          HttpResponse.json({ error: 'Internal Server Error' }, { status: 500 }),
        ),
      );

      const result = await getModelContextLimit('any-model');

      expect(result).toBe(DEFAULT_CONTEXT_LIMIT);
    });

    it('should log a warning on non-2xx response', async () => {
      // [req §Story 1.1] — "logs a warning" applies to non-2xx responses too
      server.use(
        http.get(OPENROUTER_MODELS_URL, () =>
          HttpResponse.json({ error: 'Too Many Requests' }, { status: 429 }),
        ),
      );
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await getModelContextLimit('any-model');

      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
