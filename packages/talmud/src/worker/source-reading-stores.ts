import { NO_STORE_REVISION } from '../lib/sage-graph/reading-pins';
import { SOURCE_READING_STORE_FORMAT } from '../lib/sage-graph/source-reading-store';
import type { Bindings } from './types';

/**
 * The two source-reading stores. The bindings stay fixed; a data release only adds a verified
 * revision to a store, and the next request reads it. Each request resolves every store's
 * revision once and uses that same revision for all of its reads. Responses name the revisions,
 * and a client can send them back (`bavliRevision`, `otherRevision`) to read the same data again.
 */
export const SOURCE_STORES = [
  { name: 'bavli', binding: 'SOURCE_READINGS_BAVLI_DB', param: 'bavliRevision' },
  { name: 'other', binding: 'SOURCE_READINGS_OTHER_DB', param: 'otherRevision' },
] as const;
export type SourceStoreName = (typeof SOURCE_STORES)[number]['name'];
export interface SourceStore {
  name: SourceStoreName;
  db: D1Database;
  revision: string;
  /** The client asked for this revision, so a failed read must not quietly drop it. */
  requested: boolean;
}

/**
 * Graph revision lookups add this, so a store revision loaded into the graph database by mistake is
 * never served as the graph. The importer refuses that mix-up too; this is the second guard.
 */
export const NOT_A_STORE_REVISION =
  "id NOT LIKE 'source-readings-%' AND json_extract(manifest_json,'$.sourceReadingStore') IS NULL";
export type SourceStoreRevisions = Record<SourceStoreName, string | null>;
export interface ResolvedSourceStores {
  stores: SourceStore[];
  revisions: SourceStoreRevisions;
  /** Stores that could not be read. Their readings are missing from this response. */
  unavailable: SourceStoreName[];
}
export interface SourceStoreError {
  error: string;
  status: 404 | 503;
}

function usable(name: SourceStoreName, row: { id: string; manifest_json: string }) {
  try {
    const manifest = JSON.parse(row.manifest_json);
    return (
      row.id.startsWith(`source-readings-${name}-`) &&
      manifest.storageFormat === 'shared-v1' &&
      manifest.sourceReadingStore?.name === name &&
      manifest.sourceReadingStore?.recordFormat === SOURCE_READING_STORE_FORMAT
    );
  } catch {
    return false;
  }
}

/**
 * A requested revision must exist exactly, or the request fails; it never falls back to the newest.
 * `none` skips the store. With nothing requested, use the newest verified revision.
 */
export async function resolveSourceStores(
  env: Bindings,
  query: (name: string) => string | undefined,
): Promise<ResolvedSourceStores | SourceStoreError> {
  const resolved: ResolvedSourceStores = {
    stores: [],
    revisions: { bavli: null, other: null },
    unavailable: [],
  };
  for (const { name, binding, param } of SOURCE_STORES) {
    const requested = query(param);
    if (requested === '') return { error: 'Name a source reading revision', status: 404 };
    // The page this request came from read no revision of this store, so neither does the request.
    if (requested === NO_STORE_REVISION) continue;
    const db = env[binding];
    if (!db) {
      if (requested) return { error: 'Source reading store is not available', status: 404 };
      continue;
    }
    let row: { id: string; manifest_json: string } | null;
    try {
      row = await (requested
        ? db
            .prepare(
              "SELECT id, manifest_json FROM sage_graph_revisions WHERE state='verified' AND id=?",
            )
            .bind(requested)
        : db.prepare(
            "SELECT id, manifest_json FROM sage_graph_revisions WHERE state='verified' ORDER BY created_at DESC, id DESC LIMIT 1",
          )
      ).first<{ id: string; manifest_json: string }>();
    } catch {
      if (requested) return { error: 'Source reading store is unavailable', status: 503 };
      resolved.unavailable.push(name);
      continue;
    }
    if (!row) {
      if (requested) return { error: 'No verified source reading revision was found', status: 404 };
      continue; // an empty store holds no readings yet
    }
    if (!usable(name, row)) {
      if (requested) return { error: 'No verified source reading revision was found', status: 404 };
      resolved.unavailable.push(name);
      continue;
    }
    resolved.stores.push({ name, db, revision: row.id, requested: !!requested });
    resolved.revisions[name] = row.id;
  }
  return resolved;
}
