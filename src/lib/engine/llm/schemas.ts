import { z } from 'zod';

export const NaurLayerSchema = z.enum([
  'world_mapping',
  'design',
  'modification',
]);
export type NaurLayer = z.infer<typeof NaurLayerSchema>;

export const QuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  weight: z.number().int().min(1).max(3),
  naur_layer: NaurLayerSchema,
  reference_answer: z.string(),
});
export type Question = z.infer<typeof QuestionSchema>;

export const QuestionGenerationResponseSchema = z.object({
  questions: z.array(QuestionSchema).min(1).max(5),
});
export type QuestionGenerationResponse = z.infer<typeof QuestionGenerationResponseSchema>;

export const ScoringResponseSchema = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string(),
});
export type ScoringResponse = z.infer<typeof ScoringResponseSchema>;

export const RelevanceResponseSchema = z.object({
  relevant: z.boolean(),
  explanation: z.string(),
});
export type RelevanceResponse = z.infer<typeof RelevanceResponseSchema>;
