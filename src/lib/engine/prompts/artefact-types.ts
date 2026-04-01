import { z } from 'zod';
import { ArtefactQualitySchema } from '../llm/schemas';

export const ArtefactFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});
export type ArtefactFile = z.infer<typeof ArtefactFileSchema>;

export const FileListingEntrySchema = z.object({
  path: z.string().min(1),
  additions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  status: z.string().min(1),
});
export type FileListingEntry = z.infer<typeof FileListingEntrySchema>;

export const LinkedIssueSchema = z.object({
  title: z.string().min(1),
  body: z.string(),
});
export type LinkedIssue = z.infer<typeof LinkedIssueSchema>;

export const RawArtefactSetSchema = z.object({
  artefact_type: z.enum(['pull_request', 'feature']),
  pr_description: z.string().optional(),
  pr_diff: z.string().min(1),
  file_listing: z.array(FileListingEntrySchema).min(1),
  file_contents: z.array(ArtefactFileSchema),
  test_files: z.array(ArtefactFileSchema).optional(),
  linked_issues: z.array(LinkedIssueSchema).optional(),
  context_files: z.array(ArtefactFileSchema).optional(),
});
export type RawArtefactSet = z.infer<typeof RawArtefactSetSchema>;

export const OrganisationContextSchema = z.object({
  /** Domain-specific terms the LLM should understand in this codebase's context */
  domain_vocabulary: z.array(z.object({
    term: z.string().min(1),
    definition: z.string().min(1),
  })).optional(),

  /** Areas the client wants questions to emphasise */
  focus_areas: z.array(z.string().min(1)).max(5).optional(),

  /** Areas or modules the client wants excluded from assessment */
  exclusions: z.array(z.string().min(1)).max(5).optional(),

  /** Free-text domain context (capped length — context, not instructions) */
  domain_notes: z.string().max(500).optional(),
});
export type OrganisationContext = z.infer<typeof OrganisationContextSchema>;

export const AssembledArtefactSetSchema = RawArtefactSetSchema.extend({
  question_count: z.number().int().min(3).max(5),
  artefact_quality: ArtefactQualitySchema,
  token_budget_applied: z.boolean(),
  truncation_notes: z.array(z.string()).optional(),
  organisation_context: OrganisationContextSchema.optional(),
});
export type AssembledArtefactSet = z.infer<typeof AssembledArtefactSetSchema>;
