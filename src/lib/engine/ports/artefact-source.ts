import { z } from 'zod';
import type { LinkedIssue, RawArtefactSet } from '../prompts/artefact-types';

export const RepoCoordsSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

export type RepoCoords = z.infer<typeof RepoCoordsSchema>;

export const PRExtractionParamsSchema = RepoCoordsSchema.extend({
  prNumbers: z.array(z.number().int().positive()).min(1),
  contextFilePatterns: z.array(z.string()).optional(),
  defaultBranch: z.string().min(1).optional(),
});

export type PRExtractionParams = z.infer<typeof PRExtractionParamsSchema>;

export const IssueQueryParamsSchema = RepoCoordsSchema.extend({
  issueNumbers: z.array(z.number().int().positive()).min(1),
});

export type IssueQueryParams = z.infer<typeof IssueQueryParamsSchema>;

export interface ArtefactSource {
  extractFromPRs(params: PRExtractionParams): Promise<RawArtefactSet>;
  fetchIssueContent(params: IssueQueryParams): Promise<LinkedIssue[]>;
  discoverLinkedPRs(params: IssueQueryParams): Promise<number[]>;
}
