import { DEFAULT_MODEL } from '@/lib/engine/llm/client';

export const DEFAULT_CONTEXT_LIMIT = 130_000;

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models/user';

/** Cached model list: modelId → context_length. Populated on first call. */
let modelListCache: Map<string, number> | null = null;
/** In-flight fetch promise — prevents duplicate network calls on concurrent lookups. */
let fetchPromise: Promise<Map<string, number>> | null = null;

/** Clears the module-level cache. Test-only. */
export function clearModelLimitsCache(): void {
  modelListCache = null;
  fetchPromise = null;
}

export async function getModelContextLimit(modelId: string): Promise<number> {
  if (!modelListCache) {
    if (!fetchPromise) {
      fetchPromise = fetchModelList().then(map => {
        modelListCache = map;
        fetchPromise = null;
        return map;
      });
    }
    await fetchPromise;
  }

  const limit = modelListCache!.get(modelId);
  if (limit === undefined) {
    console.warn(`[model-limits] model not in cache: ${modelId}`, { fallback: DEFAULT_CONTEXT_LIMIT });
    return DEFAULT_CONTEXT_LIMIT;
  }
  return limit;
}

export function getConfiguredModelId(): string {
  return process.env['OPENROUTER_MODEL'] ?? DEFAULT_MODEL;
}

async function fetchModelList(): Promise<Map<string, number>> {
  const apiKey = process.env['OPENROUTER_API_KEY'];
  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      console.warn('[model-limits] OpenRouter API returned non-2xx', { status: response.status });
      return new Map();
    }
    const body = (await response.json()) as { data: Array<{ id: string; context_length: number | null }> };
    const map = new Map<string, number>();
    for (const entry of body.data) {
      if (typeof entry.context_length === 'number' && entry.context_length > 0) {
        map.set(entry.id, entry.context_length);
      }
    }
    return map;
  } catch (err) {
    console.warn('[model-limits] Failed to fetch model list', { err });
    return new Map();
  }
}
