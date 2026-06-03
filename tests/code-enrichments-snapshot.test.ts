import { describe, expect, it } from 'vitest';
import { CODE_ENRICHMENTS } from '../src/worker/code-marks';

// Cache keys are derived from (id, cache_version) — see src/worker/cache-keys.ts.
// The Phase C generation-factory refactor (makeLeaf / makeSynthesis) must emit
// the exact same enrichments with the exact same cache_version, or it silently
// invalidates every cached enrichment. This snapshot is that guard: it locks the
// id@cache_version set across the whole catalog. If the refactor changes it, the
// diff is the blast radius — review it deliberately, don't just `-u`.
/** A per-enrichment fingerprint that captures everything the generation-factory
 *  refactor could silently change: identity (id + cache_version, which key the
 *  cache), wiring (mode / scope / target mark), and the output contract
 *  (schema name + required keys). Prompt bodies are guarded separately by
 *  tests/prompt-parity. */
function fingerprint(e: (typeof CODE_ENRICHMENTS)[number]): string {
  const schema = (e.extractor as { output_schema?: { name?: string; schema?: { required?: string[] } } })
    .output_schema;
  const name = schema?.name ?? '-';
  const required = (schema?.schema?.required ?? []).join(',');
  const deps = (e.dependencies ?? [])
    .map((d) => (typeof d === 'string' ? d : 'enrichment' in d ? `${(d as { fanOut?: boolean }).fanOut ? 'e*' : 'e'}:${d.enrichment}` : `m:${d.mark}`))
    .join('|');
  return `${e.id}@${e.cache_version} mode=${e.mode} scope=${e.scope} mark=${e.target_mark} schema=${name}[${required}] deps=[${deps}]`;
}

describe('CODE_ENRICHMENTS cache identity', () => {
  it('per-enrichment fingerprint is stable', () => {
    const pairs = CODE_ENRICHMENTS.map(fingerprint).sort();
    expect(pairs).toMatchSnapshot();
  });

  it('every enrichment has a non-empty id and cache_version', () => {
    for (const e of CODE_ENRICHMENTS) {
      expect(e.id, 'id').toBeTruthy();
      expect(e.cache_version, `cache_version for ${e.id}`).toBeTruthy();
    }
  });
});
