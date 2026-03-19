import { z } from 'zod';
import type { RawArtefactSet } from '../prompts/artefact-types';

export const PRExtractionParamsSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  prNumbers: z.array(z.number().int().positive()).min(1),
});

export type PRExtractionParams = z.infer<typeof PRExtractionParamsSchema>;

export interface ArtefactSource {
  extractFromPRs(params: PRExtractionParams): Promise<RawArtefactSet>;
}
