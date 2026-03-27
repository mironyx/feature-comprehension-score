import { ApiError } from './errors';
import { OpenRouterClient } from '@/lib/engine/llm/client';
import type { LLMClient } from '@/lib/engine/llm/types';

export function buildLlmClient(): LLMClient {
  const apiKey = process.env['OPENROUTER_API_KEY'];
  if (!apiKey) throw new ApiError(500, 'LLM client not configured');
  return new OpenRouterClient({ apiKey });
}
