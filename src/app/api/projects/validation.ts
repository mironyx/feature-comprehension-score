// Zod schemas for POST /api/projects. Design reference: lld-v11-e11-1-project-management.md §B.3

import { z } from 'zod';

export const CreateProjectSchema = z.object({
  org_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  glob_patterns: z.array(z.string().min(1)).max(50).optional(),
  domain_notes: z.string().max(2000).optional(),
  question_count: z.number().int().min(3).max(5).optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
