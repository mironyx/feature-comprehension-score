import { z } from 'zod';

export const NaurLayerSchema = z.enum([
  'world_to_program',
  'design_justification',
  'modification_capacity',
]);
export type NaurLayer = z.infer<typeof NaurLayerSchema>;

export const ArtefactQualitySchema = z.enum([
  'code_only',
  'code_and_tests',
  'code_and_requirements',
  'code_and_design',
  'code_requirements_and_design',
]);
export type ArtefactQuality = z.infer<typeof ArtefactQualitySchema>;

export const QuestionSchema = z.object({
  question_number: z.number().int(),
  question_text: z.string(),
  weight: z.number().int().min(1).max(3),
  naur_layer: NaurLayerSchema,
  reference_answer: z.string(),
});
export type Question = z.infer<typeof QuestionSchema>;

export const QuestionGenerationResponseSchema = z.object({
  questions: z.array(QuestionSchema).min(1).max(5),
  artefact_quality: ArtefactQualitySchema,
  artefact_quality_note: z.string(),
});
export type QuestionGenerationResponse = z.infer<typeof QuestionGenerationResponseSchema>;

export const ScoringResponseSchema = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string(),
});
export type ScoringResponse = z.infer<typeof ScoringResponseSchema>;

export const RelevanceResponseSchema = z.object({
  is_relevant: z.boolean(),
  explanation: z.string(),
});
export type RelevanceResponse = z.infer<typeof RelevanceResponseSchema>;
