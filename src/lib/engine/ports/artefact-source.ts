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

export const IssueContentParamsSchema = RepoCoordsSchema.extend({
  issueNumbers: z.array(z.number().int().positive()).min(1),
});

export type IssueContentParams = z.infer<typeof IssueContentParamsSchema>;

export const DiscoverLinkedPRsParamsSchema = RepoCoordsSchema.extend({
  issueNumbers: z.array(z.number().int().positive()).min(1),
});

export type DiscoverLinkedPRsParams = z.infer<typeof DiscoverLinkedPRsParamsSchema>;

export interface ArtefactSource {
  extractFromPRs(params: PRExtractionParams): Promise<RawArtefactSet>;
  fetchIssueContent(params: IssueContentParams): Promise<LinkedIssue[]>;
  discoverLinkedPRs(params: DiscoverLinkedPRsParams): Promise<number[]>;
}
