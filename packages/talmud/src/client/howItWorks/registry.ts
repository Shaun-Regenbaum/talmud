/**
 * Live registry fetch for #howitworks. Pulls the actual producer definitions
 * the running worker serves (GET /api/marks + GET /api/enrichments) so the
 * page never drifts from the code — it documents whatever is deployed.
 *
 * NOTE: /api/enrichments only emits LLM enrichments (the worker filters to
 * extractor.kind === 'llm'), so deterministic/computed producers like
 * rabbi.identity surface as marks/derived rather than in the enrichment list.
 * The page states this honestly rather than fabricating entries.
 */
import { createResource, type Resource } from 'solid-js';
import type { RawEnrichment, RawMark } from './graphModel';

export interface Registry {
  marks: RawMark[];
  enrichments: RawEnrichment[];
}

async function fetchRegistry(): Promise<Registry> {
  const [marksRes, enrichRes] = await Promise.all([fetch('/api/marks'), fetch('/api/enrichments')]);
  if (!marksRes.ok) throw new Error(`/api/marks ${marksRes.status}`);
  if (!enrichRes.ok) throw new Error(`/api/enrichments ${enrichRes.status}`);
  const marksJson = (await marksRes.json()) as { marks?: RawMark[] };
  const enrichJson = (await enrichRes.json()) as { enrichments?: RawEnrichment[] };
  return {
    marks: Array.isArray(marksJson.marks) ? marksJson.marks : [],
    enrichments: Array.isArray(enrichJson.enrichments) ? enrichJson.enrichments : [],
  };
}

export function useRegistry(): Resource<Registry> {
  const [registry] = createResource(fetchRegistry);
  return registry;
}
