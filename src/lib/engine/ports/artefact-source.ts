import { z } from 'zod';
import type { LinkedIssue, RawArtefactSet } from '../prompts/artefact-types';

export const PRExtractionParamsSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  prNumbers: z.array(z.number().int().positive()).min(1),
  contextFilePatterns: z.array(z.string()).optional(),
  defaultBranch: z.string().min(1).optional(),
});

export type PRExtractionParams = z.infer<typeof PRExtractionParamsSchema>;

export const IssueContentParamsSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  issueNumbers: z.array(z.number().int().positive()).min(1),
});

export type IssueContentParams = z.infer<typeof IssueContentParamsSchema>;

export interface ArtefactSource {
  extractFromPRs(params: PRExtractionParams): Promise<RawArtefactSet>;
  fetchIssueContent(params: IssueContentParams): Promise<LinkedIssue[]>;
}
