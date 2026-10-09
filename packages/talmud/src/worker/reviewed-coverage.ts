import { canonicalSlug } from '../lib/rabbi/identity';
import { isValidAmud } from '../lib/sefref/amudim';
import { TRACTATE_OPTIONS } from '../lib/sefref/tractates';
import type { RegistryDatabase } from './reviewed-rabbi';

const tractates = new Map(TRACTATE_OPTIONS.map((t) => [t.value.toLowerCase(), t.value]));

export function coveragePage(tractate: string, page: string): string | null {
  const name = tractates.get(tractate.toLowerCase());
  page = page.trim();
  return name && isValidAmud(name, page) ? `${name} ${page}` : null;
}

/** Old annotations can name a page beyond a known tractate's final page. */
export function isNonexistentCoveragePage(tractate: string, page: unknown): boolean {
  const name = tractates.get(tractate.toLowerCase());
  return (
    !!name && typeof page === 'string' && /^\d+[ab]$/.test(page.trim()) && !isValidAmud(name, page)
  );
}

export function countCoverage(pages: Iterable<string>) {
  const distinct = new Set(pages);
  const byTractate: Record<string, number> = {};
  for (const ref of distinct) {
    const name = ref.slice(0, ref.lastIndexOf(' '));
    byTractate[name] = (byTractate[name] ?? 0) + 1;
  }
  return { dafCount: distinct.size, byTractate };
}

/** Pin the read to one verified revision. A correction outranks an older reading. */
export async function loadReviewedCoverage(db: RegistryDatabase | undefined, requested: string) {
  if (!db) throw new Error('Reviewed coverage is unavailable');
  const revision = await db
    .prepare(
      "SELECT id FROM sage_graph_revisions WHERE state='verified' ORDER BY created_at DESC,id DESC LIMIT 1",
    )
    .first<{ id: string }>();
  if (!revision) throw new Error('Reviewed coverage has no verified revision');
  const slug = canonicalSlug(requested);
  const pages = new Set<string>();
  const otherRefs = new Set<string>();
  let after = '';
  for (let batch = 0; batch < 100; batch++) {
    const { results } = await db
      .prepare(
        `SELECT r.record_id,r.ref FROM sage_graph_records r
         LEFT JOIN sage_graph_records other ON other.revision_id=r.revision_id
          AND other.record_id=(CASE r.kind WHEN 'source_identity' THEN 'accepted_identity:'
            ELSE 'source_identity:' END)||json_extract(r.payload_json,'$.personKey')
         WHERE r.revision_id=? AND r.subject_id=? AND r.record_id>?
          AND r.kind IN ('source_identity','accepted_identity')
          AND r.authority IN ('source_review','user_correction')
          AND ((r.kind='source_identity' AND r.decision='accepted_registry_identity')
            OR (r.kind='accepted_identity' AND r.decision='accepted'))
          AND (other.record_id IS NULL OR other.authority NOT IN ('source_review','user_correction')
            OR (r.authority='user_correction' AND other.authority='source_review')
            OR (r.authority=other.authority AND r.kind='source_identity'))
         ORDER BY r.record_id LIMIT 500`,
      )
      .bind(revision.id, slug, after)
      .all<{ record_id: string; ref: string }>();
    for (const row of results) {
      if (typeof row.ref !== 'string' || !row.ref) throw new Error('Missing reviewed reference');
      const match = /^(.+) ([1-9]\d*[ab]):[1-9]\d*$/.exec(row.ref);
      const page = match ? coveragePage(match[1], match[2]) : null;
      if (page) pages.add(page);
      else otherRefs.add(row.ref);
    }
    if (results.length < 500) {
      return { revision: revision.id, pages: [...pages], otherPassageCount: otherRefs.size };
    }
    const next = results[results.length - 1].record_id;
    if (next <= after) throw new Error('Reviewed coverage did not advance');
    after = next;
  }
  throw new Error('Reviewed coverage exceeded the read limit');
}
