// Zod validation schemas for the projects API.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.3-B.4

import { z } from 'zod';

export const CreateProjectSchema = z.object({
  org_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  glob_patterns: z.array(z.string().min(1)).max(50).optional(),
  domain_notes: z.string().max(2000).optional(),
  question_count: z.number().int().min(3).max(5).optional(),
});

export const UpdateProjectSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    glob_patterns: z.array(z.string().min(1)).max(50).optional(),
    domain_notes: z.string().max(2000).optional(),
    question_count: z.number().int().min(3).max(5).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'at_least_one_field' });

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
