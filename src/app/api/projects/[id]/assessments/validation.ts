import { z } from 'zod';

export const CreateFcsBodySchema = z.object({
  repository_id: z.string().uuid(),
  feature_name: z.string().min(1),
  feature_description: z.string().optional(),
  merged_pr_numbers: z.array(z.number().int().positive()).optional(),
  issue_numbers: z.array(z.number().int().positive()).optional(),
  participants: z.array(z.object({ github_username: z.string().min(1) })).min(1),
  comprehension_depth: z.enum(['conceptual', 'detailed']).default('conceptual'),
}).refine(
  (b) => (b.merged_pr_numbers?.length ?? 0) > 0 || (b.issue_numbers?.length ?? 0) > 0,
  { message: 'At least one of merged_pr_numbers or issue_numbers is required' },
);

export type CreateFcsBody = z.infer<typeof CreateFcsBodySchema>;
