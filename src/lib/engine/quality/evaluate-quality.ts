import type { LLMClient, LLMError, LLMErrorCode } from '@/lib/engine/llm/types';
import {
  ArtefactQualityResponseSchema,
  type ArtefactQualityDimension,
} from '@/lib/engine/llm/schemas';
import type { RawArtefactSet } from '@/lib/engine/prompts/artefact-types';
import { buildArtefactQualityPrompt } from './build-quality-prompt';
import { aggregateDimensions } from './aggregate-dimensions';

export type ArtefactQualityUnavailableReason =
  | 'llm_failed'
  | 'timeout'
  | 'validation_failed';

export type ArtefactQualityResult =
  | {
      status: 'success';
      aggregate: number;
      dimensions: ArtefactQualityDimension[];
    }
  | {
      status: 'unavailable';
      reason: ArtefactQualityUnavailableReason;
      error: LLMError;
    };

export interface EvaluateQualityRequest {
  raw: RawArtefactSet;
  llmClient: LLMClient;
  model?: string;
  maxTokens?: number;
}

/**
 * Pure engine function that evaluates the six artefact-quality dimensions via
 * a dedicated LLM call and returns an aggregate (0–100) plus per-dimension
 * breakdown. On any LLM failure — network, validation, or timeout — returns
 * `{ status: 'unavailable', reason, error }` rather than throwing so the
 * upstream pipeline can persist the result and continue.
 */
export async function evaluateArtefactQuality(
  request: EvaluateQualityRequest,
): Promise<ArtefactQualityResult> {
  const { raw, llmClient, model, maxTokens } = request;
  const { systemPrompt, userPrompt } = buildArtefactQualityPrompt(raw);

  const result = await llmClient.generateStructured<typeof ArtefactQualityResponseSchema>({
    systemPrompt,
    prompt: userPrompt,
    schema: ArtefactQualityResponseSchema,
    model,
    maxTokens,
  });

  if (!result.success) {
    return {
      status: 'unavailable',
      reason: classifyReason(result.error.code),
      error: result.error,
    };
  }

  const { dimensions } = result.data;
  return {
    status: 'success',
    aggregate: aggregateDimensions(dimensions),
    dimensions,
  };
}

function classifyReason(code: LLMErrorCode): ArtefactQualityUnavailableReason {
  if (code === 'validation_failed' || code === 'malformed_response') return 'validation_failed';
  if (code === 'network_error') return 'timeout';
  return 'llm_failed';
}
