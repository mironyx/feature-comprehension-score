import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
import {
  DEFAULT_CONTEXT_LIMIT,
  clearModelLimitsCache,
  getModelContextLimit,
  getConfiguredModelId,
} from '@/lib/openrouter/model-limits';
import { DEFAULT_MODEL } from '@/lib/engine/llm/client';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models/user';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockModelList(models: Array<{ id: string; context_length: number | null }>) {
  return http.get(OPENROUTER_MODELS_URL, () => HttpResponse.json({ data: models }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DEFAULT_CONTEXT_LIMIT', () => {
  it('should be exported and equal 130000', () => {
    // [req §Story 1.1] conservative fallback aligned with Deepseek 160K × 0.8
    expect(DEFAULT_CONTEXT_LIMIT).toBe(130_000);
  });
});

describe('getModelContextLimit', () => {
  beforeEach(() => {
    clearModelLimitsCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Given the OpenRouter API returns a valid model list', () => {
    it('should return the context_length for the matching model', async () => {
      // [req §Story 1.1] — "when the model is found in the response data array by
      // matching id, then context_length is returned as an integer"
      server.use(
        mockModelList([{ id: 'deepseek/deepseek-v4-flash', context_length: 1_000_000 }]),
      );

      const result = await getModelContextLimit('deepseek/deepseek-v4-flash');

      expect(result).toBe(1_000_000);
    });
  });

  describe('Given the model is not found in the API response', () => {
    it('should fall back to DEFAULT_CONTEXT_LIMIT', async () => {
      // [req §Story 1.1] — "when the model is not found in the response
      // (unknown model ID), then the system falls back to 130,000 tokens"
      server.use(
        mockModelList([{ id: 'other-model', context_length: 100_000 }]),
      );

      const result = await getModelContextLimit('deepseek/deepseek-v4-flash');

      expect(result).toBe(DEFAULT_CONTEXT_LIMIT);
    });

    it('should log a warning with the unrecognised model ID', async () => {
      // [req §Story 1.1] — "logs a warning with the unrecognised model ID"
      server.use(
        mockModelList([{ id: 'other-model', context_length: 100_000 }]),
      );
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await getModelContextLimit('deepseek/deepseek-v4-flash');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('deepseek/deepseek-v4-flash'),
        expect.anything(),
      );
    });
  });

  describe('Given the API returns context_length: null for the model', () => {
    it('should fall back to DEFAULT_CONTEXT_LIMIT', async () => {
      // [req §Story 1.1] — "Given the OpenRouter API returns context_length: null
      // for the model, then the system falls back to the same conservative default"
      server.use(
        mockModelList([{ id: 'deepseek/deepseek-v4-flash', context_length: null }]),
      );

      const result = await getModelContextLimit('deepseek/deepseek-v4-flash');

      expect(result).toBe(DEFAULT_CONTEXT_LIMIT);
    });

    it('should log a warning when context_length is null', async () => {
      // [req §Story 1.1] — "logs a warning" for null context_length
      server.use(
        mockModelList([{ id: 'deepseek/deepseek-v4-flash', context_length: null }]),
      );
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await getModelContextLimit('deepseek/deepseek-v4-flash');

      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('Given the OpenRouter API call fails', () => {
    it('should fall back to DEFAULT_CONTEXT_LIMIT', async () => {
      // [req §Story 1.1] — "Given the OpenRouter API call fails (network error,
      // non-2xx response), then the system falls back to the conservative default"
      server.use(
        http.get(OPENROUTER_MODELS_URL, () => HttpResponse.error()),
      );

      const result = await getModelContextLimit('any-model');

      expect(result).toBe(DEFAULT_CONTEXT_LIMIT);
    });

    it('should log a warning on API failure', async () => {
      // [req §Story 1.1] — "logs a warning" and rubric generation is not blocked
      server.use(
        http.get(OPENROUTER_MODELS_URL, () => HttpResponse.error()),
      );
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await getModelContextLimit('any-model');

      expect(warnSpy).toHaveBeenCalled();
    });

    it('should not throw — rubric generation must not be blocked', async () => {
      // [req §Story 1.1] — "rubric generation is not blocked by a metadata API failure"
      server.use(
        http.get(OPENROUTER_MODELS_URL, () => HttpResponse.error()),
      );

      await expect(getModelContextLimit('any-model')).resolves.not.toThrow();
    });
  });

  describe('Given two different models are requested', () => {
    it('should fetch the model list once and serve both from cache', async () => {
      // [req §Story 1.1] — "the cached value is used (no repeated API call)"
      // [lld §I3] — "Full model list is fetched once per process lifetime"
      let callCount = 0;
      server.use(
        http.get(OPENROUTER_MODELS_URL, () => {
          callCount += 1;
          return HttpResponse.json({
            data: [
              { id: 'model-a', context_length: 200_000 },
              { id: 'model-b', context_length: 64_000 },
            ],
          });
        }),
      );

      const [resultA, resultB] = await Promise.all([
        getModelContextLimit('model-a'),
        getModelContextLimit('model-b'),
      ]);

      // Both values are correct from cache
      expect(resultA).toBe(200_000);
      expect(resultB).toBe(64_000);
      // The endpoint was called exactly once
      expect(callCount).toBe(1);
    });

    it('should serve the second call from cache without a network request', async () => {
      // [req §Story 1.1] — cache is populated on the first call; subsequent calls
      // are pure map reads with no network I/O
      server.use(
        mockModelList([{ id: 'deepseek/deepseek-v4-flash', context_length: 1_000_000 }]),
      );

      await getModelContextLimit('deepseek/deepseek-v4-flash');

      // Remove the handler — if the second call goes to the network it will fail
      server.use(
        http.get(OPENROUTER_MODELS_URL, () => HttpResponse.error()),
      );

      const secondResult = await getModelContextLimit('deepseek/deepseek-v4-flash');

      expect(secondResult).toBe(1_000_000);
    });
  });

  describe('Given clearModelLimitsCache is called between requests', () => {
    it('should re-fetch the model list on the next call', async () => {
      // Observable property: cache reset between calls via clearModelLimitsCache()
      // [lld §Story 1.1] — "clearModelLimitsCache: Test-only. Resets singleton."
      let callCount = 0;
      server.use(
        http.get(OPENROUTER_MODELS_URL, () => {
          callCount += 1;
          return HttpResponse.json({
            data: [{ id: 'some-model', context_length: 50_000 }],
          });
        }),
      );

      await getModelContextLimit('some-model');
      clearModelLimitsCache();
      await getModelContextLimit('some-model');

      expect(callCount).toBe(2);
    });
  });

  describe('Given an entry with a non-positive context_length', () => {
    it('should not store a zero context_length in cache — fallback to DEFAULT_CONTEXT_LIMIT', async () => {
      // [lld §Story 1.1] — "Entries with null or non-positive context_length are
      // skipped (those models will fall back to DEFAULT_CONTEXT_LIMIT on lookup)"
      server.use(
        mockModelList([{ id: 'broken-model', context_length: 0 }]),
      );

      const result = await getModelContextLimit('broken-model');

      expect(result).toBe(DEFAULT_CONTEXT_LIMIT);
    });
  });
});

describe('getConfiguredModelId', () => {
  afterEach(() => {
    // Restore any env mutations made in individual tests
    delete process.env['OPENROUTER_MODEL'];
  });

  it('should return OPENROUTER_MODEL env var when set', () => {
    // [lld §Story 1.1] — "getConfiguredModelId: returns OPENROUTER_MODEL env var
    // or DEFAULT_MODEL fallback"
    process.env['OPENROUTER_MODEL'] = 'deepseek/deepseek-v4-flash';

    const result = getConfiguredModelId();

    expect(result).toBe('deepseek/deepseek-v4-flash');
  });

  it('should return DEFAULT_MODEL when OPENROUTER_MODEL env var is unset', () => {
    // [lld §Story 1.1] — falls back to DEFAULT_MODEL from client.ts
    delete process.env['OPENROUTER_MODEL'];

    const result = getConfiguredModelId();

    expect(result).toBe(DEFAULT_MODEL);
  });
});
