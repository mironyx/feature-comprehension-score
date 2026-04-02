// Client-side validation for OrganisationContext form.
// Mirrors OrganisationContextSchema constraints from artefact-types.ts.
// Issue: #158

import type { OrganisationContext } from '@/lib/engine/prompts';

const MAX_FOCUS_AREAS = 5;
const MAX_EXCLUSIONS = 5;
const MAX_DOMAIN_NOTES = 500;

function validateVocabulary(
  vocabulary: NonNullable<OrganisationContext['domain_vocabulary']>,
): string[] {
  const errors: string[] = [];
  for (const entry of vocabulary) {
    if (!entry.term.trim()) errors.push('Each vocabulary term must not be blank.');
    if (!entry.definition.trim()) errors.push('Each vocabulary definition must not be blank.');
  }
  return errors;
}

function validateTagList(
  items: string[],
  max: number,
  plural: string,
  singular: string,
): string[] {
  const errors: string[] = [];
  if (items.length > max) errors.push(`Maximum ${max} ${plural} allowed.`);
  if (items.some((a) => !a.trim())) errors.push(`Each ${singular} must not be blank.`);
  return errors;
}

export function validateOrgContext(ctx: OrganisationContext): string[] {
  return [
    ...(ctx.domain_vocabulary ? validateVocabulary(ctx.domain_vocabulary) : []),
    ...(ctx.focus_areas ? validateTagList(ctx.focus_areas, MAX_FOCUS_AREAS, 'focus areas', 'focus area') : []),
    ...(ctx.exclusions ? validateTagList(ctx.exclusions, MAX_EXCLUSIONS, 'exclusions', 'exclusion') : []),
    ...(ctx.domain_notes && ctx.domain_notes.length > MAX_DOMAIN_NOTES
      ? [`Domain notes must be ${MAX_DOMAIN_NOTES} characters or fewer.`]
      : []),
  ];
}
