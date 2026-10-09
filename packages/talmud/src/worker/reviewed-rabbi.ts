import { z } from 'zod';
import { GENERATION_ID_SET } from '../client/generations';
import { canonicalSlug } from '../lib/rabbi/identity';
import { RABBI_PLACES, type RabbiPlacesEntry } from './rabbi-places';

// The reader only needs these statement methods. This also lets tests run the
// production SQL against SQLite instead of substituting query results.
export interface RegistryStatement {
  bind(...values: (string | number)[]): RegistryStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
}
export interface RegistryDatabase {
  prepare(sql: string): RegistryStatement;
}

const source = z.object({
  title: z.string().trim().min(1),
  url: z.string().url().startsWith('https://'),
});

// Reviewed people use the same card fields as the bundled registry, with saved
// source references. A reviewed correction takes precedence over bundled data.
export const reviewedRabbiShape = z.object({
  identityStatus: z.literal('reviewed_person'),
  canonical: z.string().trim().min(1),
  canonicalHe: z.string().trim().min(1),
  aliases: z.array(z.string().min(1)),
  generation: z
    .string()
    .refine((id) => GENERATION_ID_SET.has(id))
    .nullable(),
  region: z.enum(['israel', 'bavel']).nullable(),
  places: z.array(z.string().min(1)),
  moved: z.enum(['bavel->israel', 'israel->bavel', 'both']).nullable(),
  bio: z.string().min(1).nullable(),
  sources: z.array(source).min(1),
});

export async function loadRabbiEntry(
  db: RegistryDatabase | undefined,
  requestedSlug: string,
): Promise<RabbiPlacesEntry | null> {
  const slug = canonicalSlug(requestedSlug);
  const reviewed = await loadReviewedRabbiEntry(db, slug);
  return reviewed ?? (Object.hasOwn(RABBI_PLACES.rabbis, slug) ? RABBI_PLACES.rabbis[slug] : null);
}

export async function loadReviewedRabbiEntry(
  db: RegistryDatabase | undefined,
  requestedSlug: string,
): Promise<z.infer<typeof reviewedRabbiShape> | null> {
  const slug = canonicalSlug(requestedSlug);
  if (!/^[a-z0-9()-]+$/.test(slug)) return null;
  if (!db) return null;
  const row = await db
    .prepare(
      `SELECT payload_json FROM sage_graph_all_records
       WHERE revision_id=(
         SELECT id FROM sage_graph_revisions WHERE state='verified'
         ORDER BY created_at DESC, id DESC LIMIT 1
       ) AND record_id=? AND kind='registry_person'
         AND authority IN ('source_review', 'user_correction') AND decision='supported'`,
    )
    .bind(`registry_person:${slug}`)
    .first<{ payload_json: string }>();
  if (!row) return null;
  // Corrupt saved data must become a retryable server error, not a false 404.
  return reviewedRabbiShape.parse(JSON.parse(row.payload_json));
}

/** Read one verified revision throughout pagination so the search list is complete. */
export async function loadReviewedRabbiEntries(
  db: RegistryDatabase | undefined,
  pageSize = 500,
): Promise<Record<string, RabbiPlacesEntry>> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500)
    throw new Error('Invalid registry page size');
  if (!db) return {};
  const revision = await db
    .prepare(
      "SELECT id FROM sage_graph_revisions WHERE state='verified' ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .first<{ id: string }>();
  if (!revision) return {};
  const entries: Record<string, RabbiPlacesEntry> = Object.create(null);
  let after = '';
  for (let page = 0; page < 100; page++) {
    const { results } = await db
      .prepare(
        `SELECT record_id, payload_json FROM sage_graph_all_records
         WHERE revision_id=? AND kind='registry_person' AND record_id>?
           AND authority IN ('source_review', 'user_correction') AND decision='supported'
         ORDER BY record_id LIMIT ?`,
      )
      .bind(revision.id, after, pageSize)
      .all<{ record_id: string; payload_json: string }>();
    for (const row of results) {
      if (!/^registry_person:[a-z0-9()-]+$/.test(row.record_id))
        throw new Error('Invalid reviewed registry identifier');
      const slug = row.record_id.slice('registry_person:'.length);
      entries[slug] = reviewedRabbiShape.parse(JSON.parse(row.payload_json));
    }
    if (results.length < pageSize) return entries;
    const next = results[results.length - 1].record_id;
    if (next <= after) throw new Error('Incomplete reviewed registry');
    after = next;
  }
  throw new Error('Reviewed registry exceeded the search read limit');
}
