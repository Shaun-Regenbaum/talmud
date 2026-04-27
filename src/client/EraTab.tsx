/**
 * Era tab in EnrichmentPage. Daf-scoped. Shows the segment-level era
 * classification (mishnaic / amoraic / savora / etc.) for every Sefaria
 * segment of the daf. One enrichment strategy: llm-refine, which batches an
 * LLM pass over low-confidence segments via /api/era-context?stage=2.
 */
import { createResource, createSignal, For, Show, type JSX } from 'solid-js';

interface EraSegment {
  segIdx: number;
  era: string | null;
  source?: string;
  why?: string;
  speakers?: unknown;
  confidence?: number;
}

interface EraContextResult {
  segments: EraSegment[];
  _cached?: boolean;
}

const ERA_COLOR: Record<string, string> = {
  'biblical': '#fde68a',
  'mishnaic': '#bbf7d0',
  'tannaitic': '#bbf7d0',
  'amoraic': '#bfdbfe',
  'savora': '#ddd6fe',
  'gaonic': '#fbcfe8',
  'rishonic': '#f5d0fe',
  'unknown': '#f1f5f9',
};

export function EraTab(props: { tractate: string; page: string; loadKey: number; refreshNonce?: number; onReloadSkeleton?: () => void }): JSX.Element {
  const dafKey = () => `${props.tractate}|${props.page}|${props.loadKey}|${props.refreshNonce ?? 0}`;
  const [data, { refetch }] = createResource(dafKey, async (): Promise<EraContextResult | null> => {
    if (props.loadKey === 0) return null;
    const refresh = (props.refreshNonce ?? 0) > 0 ? '?refresh=1' : '';
    const res = await fetch(`/api/era-context/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}${refresh}`);
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }
    return res.json();
  });

  const [running, setRunning] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>();

  const runRefine = async () => {
    setRunning(true);
    setError(undefined);
    try {
      // Fire stage-2; the response either kicks off background work (204)
      // or returns the refined segments.
      const res = await fetch(`/api/era-context/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}?stage=2`);
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      // Always refetch the canonical /api/era-context to render the now-updated state.
      await refetch();
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  };

  // Group contiguous same-era segments into strips for compact rendering.
  const strips = (): Array<{ era: string | null; from: number; to: number; segments: EraSegment[] }> => {
    const segs = data()?.segments ?? [];
    const out: Array<{ era: string | null; from: number; to: number; segments: EraSegment[] }> = [];
    let cursor = 0;
    while (cursor < segs.length) {
      const start = segs[cursor];
      let end = cursor;
      while (end + 1 < segs.length && segs[end + 1].era === start.era) end++;
      out.push({ era: start.era, from: start.segIdx, to: segs[end].segIdx, segments: segs.slice(cursor, end + 1) });
      cursor = end + 1;
    }
    return out;
  };

  return (
    <>
      <style>{ERA_TAB_CSS}</style>

      <section class="panel enrich-bar">
        <Show when={props.onReloadSkeleton}>
          <button class="toggle-pill toggle-off-empty reload-skel" onClick={() => props.onReloadSkeleton?.()} title="Re-run era first-pass detection from scratch.">
            <span class="toggle-mark">↻</span>
            <span class="toggle-label">Reload skeleton</span>
          </button>
        </Show>
        <span class="enrich-label">Enrichments</span>
        {(() => {
          // "cached" if any segment carries the LLM source tag (otherwise still
          // heuristic). Source field on EraSegment doubles as cached signal.
          const isCached = () => (data()?.segments ?? []).some((s) => typeof s.source === 'string' && s.source.includes('llm'));
          return (
            <button
              class="enrich-btn"
              classList={{ 'enrich-btn-cached': isCached() && !running() }}
              disabled={running() || !data()}
              onClick={runRefine}
              title="LLM-refine low-confidence segments using surrounding context."
            >
              {running() ? 'LLM refine…' : (isCached() ? '↻ LLM refine' : '+ LLM refine')}
              <Show when={error()}><span class="enrich-btn-err">err</span></Show>
            </button>
          );
        })()}
      </section>

      <Show when={data.loading}><p class="loading">Loading era classifications…</p></Show>
      <Show when={!data.loading && data.error}><p class="err-msg">{String(data.error)}</p></Show>
      <Show when={data() && data()!.segments.length === 0}>
        <section class="panel empty">No segment-level era data for this daf.</section>
      </Show>
      <Show when={data() && data()!.segments.length > 0}>
        <section class="panel era-list">
          <For each={strips()}>{(strip) => (
            <div class="era-strip" style={{ 'border-left': `4px solid ${ERA_COLOR[strip.era ?? 'unknown'] ?? '#cbd5e1'}` }}>
              <div class="era-strip-head">
                <span class="era-strip-tag" style={{ background: ERA_COLOR[strip.era ?? 'unknown'] ?? '#f1f5f9' }}>{strip.era ?? 'unknown'}</span>
                <span class="era-strip-range">segments {strip.from}–{strip.to}</span>
                <Show when={strip.segments[0].source}>
                  <span class="era-strip-source">via {strip.segments[0].source}</span>
                </Show>
              </div>
              <Show when={strip.segments[0].why}>
                <p class="era-strip-why">{strip.segments[0].why}</p>
              </Show>
            </div>
          )}</For>
        </section>
      </Show>
    </>
  );
}

const ERA_TAB_CSS = `
.era-list { padding: 0.55rem 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; }
.era-strip { padding: 0.4rem 0.6rem; background: #fff; border: 1px solid #e5e7eb; border-radius: 3px; }
.era-strip-head { display: flex; gap: 0.45rem; align-items: baseline; flex-wrap: wrap; }
.era-strip-tag { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px 8px; border-radius: 10px; font-weight: 600; color: #1e293b; }
.era-strip-range { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #64748b; }
.era-strip-source { font-size: 10.5px; color: #94a3b8; font-style: italic; margin-left: auto; }
.era-strip-why { font-size: 11.5px; color: #475569; margin: 0.25rem 0 0; line-height: 1.45; }
`;
