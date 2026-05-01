// Zod validation schemas for the projects API.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.3-B.4
// V11 E11.3 T3.1: glob parseability validation, question_count cap raised 5 → 8.

import { z } from 'zod';
import picomatch from 'picomatch';

// picomatch v4 is permissive by default — `makeRe('[')` returns a literal regex
// rather than throwing. `strictBrackets: true` makes it throw on unclosed
// brackets, which is the malformed-syntax class we want to surface to users.
function isParseableGlob(p: string): boolean {
  try {
    picomatch.makeRe(p, { strictBrackets: true });
    return true;
  } catch {
    return false;
  }
}

function refineGlobs(arr: string[] | undefined, ctx: z.RefinementCtx): void {
  if (!arr) return;
  arr.forEach((p, index) => {
    if (!isParseableGlob(p)) {
      ctx.addIssue({
        code: 'custom',
        path: [index],
        message: `glob_unparseable:${p}`,
      });
    }
  });
}

const GlobPatternsSchema = z
  .array(z.string().min(1))
  .max(50)
  .superRefine(refineGlobs);

export const CreateProjectSchema = z.object({
  org_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  glob_patterns: GlobPatternsSchema.optional(),
  domain_notes: z.string().max(2000).optional(),
  question_count: z.number().int().min(3).max(8).optional(),
});

export const UpdateProjectSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    glob_patterns: GlobPatternsSchema.optional(),
    domain_notes: z.string().max(2000).optional(),
    question_count: z.number().int().min(3).max(8).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'at_least_one_field' });

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
