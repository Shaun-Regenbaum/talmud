/**
 * MarkEnrichmentCards — generic, mark-agnostic component that renders all
 * registered enrichments for a given mark instance.
 *
 * Architecture: pulls /api/studio/enrichments, filters to entries whose
 * `mark` field matches the props.markId, then for each promoted enrichment
 * fires /api/studio/run with `{ enrichment_id, tractate, page, mark_input
 * = props.instance }` and renders the parsed JSON output.
 *
 * Adding a new enrichment for a mark = drop a row into CODE_ENRICHMENTS
 * (worker/code-marks.ts) or save one via PUT /api/studio/enrichments. The
 * sidebar picks it up automatically. No UI code changes per new
 * enrichment.
 *
 * Each enrichment renders as a collapsible card with status + content. The
 * card's body is rendered by a per-enrichment renderer if registered, or
 * falls back to a generic key/value dump of the parsed JSON.
 */

import { createResource, createSignal, createEffect, untrack, For, Show } from 'solid-js';
import { Hebraized } from './Hebraized';
import { devModeActive } from './DevModeShelf';

interface EnrichmentDef {
  id: string;
  label: string;
  description?: string;
  mark: string;
  mode?: 'augment-content' | 'refine-anchors' | 'aggregate';
  depends?: string[];
  status?: 'draft' | 'promoted';
  source: 'kv' | 'code';
}


interface RunResult {
  content: string;
  parsed: unknown;
  parse_error: string | null;
  model: string;
  total_ms: number;
  usage?: { total_tokens?: number; cost?: number } | null;
  /** Aggregate-only: parsed output of each dep enrichment, keyed by dep id.
   *  Lets the client surface leaves in the dev dropdown without a second
   *  round-trip. */
  deps_resolved?: Record<string, unknown>;
}

type RunState =
  | { kind: 'idle' }
  | { kind: 'loading'; stamp: string }
  | { kind: 'ok'; stamp: string; result: RunResult }
  | { kind: 'error'; stamp: string; error: string };

async function fetchEnrichments(): Promise<EnrichmentDef[]> {
  const r = await fetch('/api/studio/enrichments');
  if (!r.ok) return [];
  const j = await r.json() as { enrichments: EnrichmentDef[] };
  return j.enrichments;
}

async function runEnrichment(
  enrichmentId: string,
  tractate: string,
  page: string,
  markInput: unknown,
): Promise<RunResult> {
  const r = await fetch('/api/studio/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enrichment_id: enrichmentId, tractate, page, mark_input: markInput }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
  return j as RunResult;
}

interface Props {
  markId: string;
  instance: unknown;
  /** Stable identifier for the instance (e.g. rabbi name). Used to scope
   *  the per-card stamp so re-clicking a different rabbi triggers a fresh
   *  fetch. */
  instanceKey: string;
  tractate: string;
  page: string;
}

// Pluggable per-enrichment renderers can be registered here in the future.
// For now we use the generic ParsedFieldView (below) which renders any
// parsed JSON nicely by inferring field types from key names.

export default function MarkEnrichmentCards(props: Props) {
  const [defs] = createResource(fetchEnrichments);
  const [runs, setRuns] = createSignal<Record<string, RunState>>({});
  const [open, setOpen] = createSignal<Set<string>>(new Set());
  const [selectedDevView, setSelectedDevView] = createSignal<string | null>(null);

  const setRun = (id: string, state: RunState) =>
    setRuns((cur) => ({ ...cur, [id]: state }));

  const allMatching = () => (defs() ?? []).filter((d) => d.mark === props.markId && d.status !== 'draft');
  // The user-facing card is the aggregate (synthesis). Leaves only render
  // when dev mode is on AND the user picks one from the dropdown.
  const aggregates = () => allMatching().filter((d) => d.mode === 'aggregate');
  const leaves = () => allMatching().filter((d) => d.mode !== 'aggregate');
  // What to show as the primary card. Default: the first aggregate. If no
  // aggregate exists for this mark, fall back to all leaves (current
  // behavior for marks without a synthesis layer).
  const primary = () => {
    const a = aggregates();
    if (a.length > 0) return a;
    return leaves();
  };
  // What to render when user selects a specific leaf in dev mode.
  const devSelected = () => {
    const id = selectedDevView();
    if (!id) return null;
    return allMatching().find((d) => d.id === id) ?? null;
  };
  const matching = () => {
    const sel = devSelected();
    return sel ? [sel] : primary();
  };

  const stamp = () => `${props.tractate}/${props.page}/${props.instanceKey}`;

  // Auto-fire each enrichment on mount + when the daf or instance changes.
  createEffect(() => {
    const list = matching();
    if (list.length === 0) return;
    const s = stamp();
    untrack(() => {
      for (const d of list) {
        const cur = runs()[d.id];
        if (cur && cur.kind !== 'idle' && cur.stamp === s) continue;
        setRun(d.id, { kind: 'loading', stamp: s });
        // Auto-open the first card so users see content right away.
        if (open().size === 0) setOpen(new Set([d.id]));
        void runEnrichment(d.id, props.tractate, props.page, props.instance).then(
          (result) => {
            setRun(d.id, { kind: 'ok', stamp: s, result });
            // For aggregate enrichments: server returns each dep's parsed
            // output in `deps_resolved`. Populate per-leaf run state so the
            // dev dropdown can render leaves instantly without a second
            // /api/studio/run call.
            const resolved = result.deps_resolved;
            if (resolved) {
              for (const [depId, depParsed] of Object.entries(resolved)) {
                setRun(depId, {
                  kind: 'ok',
                  stamp: s,
                  result: {
                    content: typeof depParsed === 'string' ? depParsed : JSON.stringify(depParsed),
                    parsed: typeof depParsed === 'object' ? depParsed : null,
                    parse_error: null,
                    model: result.model,
                    total_ms: 0,
                    usage: null,
                  },
                });
              }
            }
          },
          (err) => setRun(d.id, { kind: 'error', stamp: s, error: String((err as Error)?.message ?? err) }),
        );
      }
    });
  });

  const toggle = (id: string) => {
    const next = new Set(open());
    if (next.has(id)) next.delete(id); else next.add(id);
    setOpen(next);
  };

  // The aggregate (synthesis) run, if any. Used to surface which leaves were
  // actually consumed by the synthesis as clickable badges below.
  const aggregateRun = (): RunResult | null => {
    const ag = aggregates()[0];
    if (!ag) return null;
    const r = runs()[ag.id];
    return r?.kind === 'ok' ? r.result : null;
  };
  const usedDepIds = (): string[] => {
    const r = aggregateRun();
    if (!r?.deps_resolved) return [];
    return Object.keys(r.deps_resolved);
  };
  // Pretty-print "rabbi.bio" → "Bio", "rabbi.daf-role" → "Daf role".
  const prettyDepLabel = (depId: string, markId: string): string => {
    const tail = depId.startsWith(`${markId}.`) ? depId.slice(markId.length + 1) : depId;
    return tail.replace(/[-_]/g, ' ').replace(/\b\w/, (m) => m.toUpperCase());
  };

  return (
    <div>
      <Show when={devModeActive() && allMatching().length > 1}>
        <div style={{ 'margin-bottom': '0.5rem', display: 'flex', 'flex-direction': 'column', gap: '0.35rem' }}>
          <div style={{ 'font-size': '0.7rem', color: '#888', display: 'flex', 'align-items': 'center', gap: '0.4rem' }}>
            <span>view:</span>
            <select
              value={selectedDevView() ?? ''}
              onChange={(e) => setSelectedDevView(e.currentTarget.value || null)}
              style={{ 'font-size': '0.75rem', padding: '1px 4px', 'font-family': 'inherit' }}
            >
              <option value="">synthesis</option>
              <For each={leaves()}>{(d) => (
                <option value={d.id}>{d.id} (leaf)</option>
              )}</For>
            </select>
          </div>
          {/* Badge tray: which leaves the synthesis actually consumed.
              Clicking switches the view; the dep is already cached from
              the synthesis call so there's no extra LLM fetch. */}
          <Show when={usedDepIds().length > 0}>
            <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.25rem' }}>
              <button
                onClick={() => setSelectedDevView(null)}
                title="Show synthesis"
                style={{
                  padding: '1px 8px', 'font-size': '0.7rem', cursor: 'pointer',
                  background: selectedDevView() === null ? '#000' : '#f0f0f0',
                  color: selectedDevView() === null ? '#fff' : '#444',
                  border: '1px solid #ddd', 'border-radius': '10px',
                }}
              >
                synthesis
              </button>
              <For each={usedDepIds()}>{(depId) => (
                <button
                  onClick={() => setSelectedDevView(depId)}
                  title={`Show ${depId}`}
                  style={{
                    padding: '1px 8px', 'font-size': '0.7rem', cursor: 'pointer',
                    background: selectedDevView() === depId ? '#000' : '#f0f0f0',
                    color: selectedDevView() === depId ? '#fff' : '#444',
                    border: '1px solid #ddd', 'border-radius': '10px',
                  }}
                >
                  {prettyDepLabel(depId, props.markId)}
                </button>
              )}</For>
            </div>
          </Show>
        </div>
      </Show>

      <For each={matching()}>{(d) => {
        const state = (): RunState => runs()[d.id] ?? { kind: 'idle' };
        const isOpen = () => open().has(d.id);
        const result = (): RunResult | null =>
          state().kind === 'ok' ? (state() as Extract<RunState, { kind: 'ok' }>).result : null;
        const errMsg = (): string | null =>
          state().kind === 'error' ? (state() as Extract<RunState, { kind: 'error' }>).error : null;

        return (
          <section style={{ 'margin-bottom': '1rem' }}>
            <button
              onClick={() => toggle(d.id)}
              style={{
                display: 'flex', 'align-items': 'center', gap: '0.4rem',
                width: '100%', 'text-align': 'left',
                background: 'transparent', border: 0,
                padding: '0.3rem 0',
                'border-bottom': '1px solid #eee',
                cursor: 'pointer',
                'font-family': 'inherit', 'font-size': '0.78rem',
                color: '#555', 'letter-spacing': '0.02em',
              }}
            >
              <span style={{ color: '#aaa' }}>{isOpen() ? '▾' : '▸'}</span>
              <span style={{ 'text-transform': 'uppercase', 'font-size': '0.7rem', 'letter-spacing': '0.06em', 'font-weight': 600 }}>
                {/* Drop the "<mark>." prefix for the section header — we
                    already know the mark from the sidebar context. */}
                {d.id.startsWith(`${props.markId}.`) ? d.id.slice(props.markId.length + 1) : (d.label || d.id)}
              </span>
              <span style={{ 'margin-left': 'auto', 'font-size': '0.7rem', color: state().kind === 'error' ? '#c00' : state().kind === 'loading' ? '#aaa' : '#bbb' }}>
                {state().kind === 'loading' ? 'generating…' :
                 state().kind === 'ok' ? `${(state() as Extract<RunState, { kind: 'ok' }>).result.total_ms}ms` :
                 state().kind === 'error' ? 'error' : ''}
              </span>
            </button>

            <Show when={isOpen()}>
              <div style={{ padding: '0.6rem 0 0' }}>
                <Show when={errMsg()}>{(msg) => (
                  <div style={{ color: '#c00', 'font-family': 'monospace', 'font-size': '0.78rem' }}>
                    {msg()}
                  </div>
                )}</Show>

                {/* No body text during loading — the spinner + 'generating…'
                    pill on the section header is the single source of
                    feedback. Avoids duplicate "generating" + body text. */}

                <Show when={result()}>{(r) => (
                  <Show when={r().parsed && typeof r().parsed === 'object'} fallback={
                    <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'inherit', 'font-size': '0.85rem', 'line-height': 1.55, margin: 0, color: '#222' }}>
                      <Hebraized text={r().content} />
                    </pre>
                  }>
                    <ParsedFieldView parsed={r().parsed as Record<string, unknown>} />
                  </Show>
                )}</Show>
              </div>
            </Show>
          </section>
        );
      }}</For>
    </div>
  );
}

/**
 * Generic field-by-field renderer for parsed JSON enrichment output.
 * Uses field name conventions to format common shapes nicely:
 *   - field ending in `_he` or named `*_quote_he` → render dir=rtl Hebrew
 *   - field starting with `historical_*`, `role_*`, `bio*` → paragraph
 *   - arrays of strings → bulleted list
 */
function ParsedFieldView(props: { parsed: Record<string, unknown> }) {
  const entries = () => Object.entries(props.parsed)
    .filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0));
  // When the schema has only ONE string field (e.g. rabbi.bio's `bio`), drop
  // the section header and render the text as a clean paragraph. Multi-field
  // schemas keep the per-field labels for clarity.
  const isSingleString = () => {
    const e = entries();
    return e.length === 1 && typeof e[0][1] === 'string';
  };

  return (
    <Show when={isSingleString()} fallback={
      <div style={{ 'font-size': '0.88rem', 'line-height': 1.55, color: '#222' }}>
        <For each={entries()}>{([key, value]) => {
          const isHe = key.endsWith('_he') || key.includes('quote_he');
          const label = key.replace(/_/g, ' ').replace(/\b\w/, (m) => m.toUpperCase());
          if (typeof value === 'string') {
            return (
              <div style={{ 'margin-bottom': '0.7rem' }}>
                <div style={{ 'font-size': '0.7rem', color: '#888', 'margin-bottom': '0.15rem', 'font-weight': 500 }}>
                  {label}
                </div>
                <Show when={isHe} fallback={
                  <p style={{ margin: 0 }}><Hebraized text={value} /></p>
                }>
                  <p dir="rtl" lang="he" style={{ margin: 0, 'font-family': '"Mekorot Vilna", serif', 'font-size': '1rem', color: '#222' }}>
                    {value}
                  </p>
                </Show>
              </div>
            );
          }
          if (Array.isArray(value)) {
            return (
              <div style={{ 'margin-bottom': '0.7rem' }}>
                <div style={{ 'font-size': '0.7rem', color: '#888', 'margin-bottom': '0.15rem', 'font-weight': 500 }}>
                  {label}
                </div>
                <ul style={{ margin: 0, 'padding-left': '1rem' }}>
                  <For each={value}>{(v) => <li>{String(v)}</li>}</For>
                </ul>
              </div>
            );
          }
          return null;
        }}</For>
      </div>
    }>
      <p style={{ margin: 0, 'font-size': '0.92rem', 'line-height': 1.6, color: '#222' }}>
        <Hebraized text={String(entries()[0][1])} />
      </p>
    </Show>
  );
}
