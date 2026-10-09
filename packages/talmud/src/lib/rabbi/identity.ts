import duplicates from '../data/rabbi-duplicates.json';

export const DUPLICATE_SLUGS: Readonly<Record<string, string>> = duplicates.duplicates;

export function canonicalSlug(slug: string): string {
  return DUPLICATE_SLUGS[slug] ?? slug;
}
