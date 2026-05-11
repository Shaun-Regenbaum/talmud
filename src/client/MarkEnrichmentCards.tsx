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

import { createResource, createSignal, createEffect, untrack, For, Show, type JSX } from 'solid-js';
import { Hebraized } from './Hebraized';
import { devModeActive } from './DevModeShelf';
import { trackAI } from './aiActivity';

interface EnrichmentDef {
  id: string;
  label: string;
  description?: string;
  mark: string;
  mode?: 'augment-content' | 'refine-anchors' | 'aggregate';
  scope?: 'global' | 'local';
  /** Mixed dependency array: 'gemara' | 'commentaries' | { enrichment } | { mark }. */
  dependencies?: Array<unknown>;
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
  /** Aggregate-only: parsed output of each dep MARK (e.g. `{ mark: 'rabbi' }`
   *  → instances list under the 'rabbi' key). Same fetch as deps_resolved;
   *  surfaced so a sidebar can render mark-specific UI without re-fetching. */
  anchors_resolved?: Record<string, unknown>;
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

// Worker's run endpoint returns one of:
//   { status: 'ok', result: RunResult, total_ms? }     ← cache hit, immediate
//   { status: 'pending', runId: string }               ← enqueued, poll
//   { status: 'error', error: string }
type RunResponse =
  | { status: 'ok'; result: RunResult; total_ms?: number }
  | { status: 'pending'; runId: string }
  | { status: 'error'; error: string };

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 180_000;

async function runEnrichmentImpl(
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
  const j = await r.json() as RunResponse | { error?: string };
  if (!r.ok && r.status !== 202) {
    throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
  }
  if ('status' in j) {
    if (j.status === 'ok') return j.result;
    if (j.status === 'error') throw new Error(j.error);
    if (j.status === 'pending') return pollJob(j.runId);
  }
  // Legacy/synchronous shape — treat the whole body as RunResult for back-compat.
  return j as unknown as RunResult;
}

// Wraps the actual run in `trackAI` so the AIActivityPanel sees the
// loading→ok lifecycle and the dev-shelf log captures [ai] lines.
async function runEnrichment(
  enrichmentId: string,
  tractate: string,
  page: string,
  markInput: unknown,
): Promise<RunResult> {
  const inst = markInput as { fields?: { id?: string; name?: string; verseRef?: string } } | null;
  const instanceTag = inst?.fields?.id ?? inst?.fields?.name ?? inst?.fields?.verseRef ?? '';
  const id = `${enrichmentId}:${tractate}:${page}:${instanceTag}`;
  const label = instanceTag
    ? `${enrichmentId} · ${instanceTag} · ${tractate} ${page}`
    : `${enrichmentId} · ${tractate} ${page}`;
  return trackAI(id, label, () => runEnrichmentImpl(enrichmentId, tractate, page, markInput));
}

async function pollJob(runId: string): Promise<RunResult> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const r = await fetch(`/api/studio/run-status/${encodeURIComponent(runId)}`);
    const j = await r.json() as RunResponse | { status: 'pending' };
    if ('status' in j) {
      if (j.status === 'ok') return (j as { result: RunResult }).result;
      if (j.status === 'error') throw new Error((j as { error: string }).error);
      // pending — continue polling
    }
  }
  throw new Error(`job ${runId} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

// Shared FIFO queue with bounded concurrency so opening one section that
// mounts many move cards doesn't barrage `/api/studio/run` in parallel
// (workerd dies on the simultaneous fan-out + 30k-char prompts; see
// 2026-05-07 incident). Aggregates fire first, then per-move syntheses
// drain in order so cards fill in top-to-bottom as the user reads. KV cache
// hits still go through the queue but resolve fast, so there's no penalty
// once a section has been opened before.
class RequestQueue {
  private queue: Array<() => void> = [];
  private active = 0;
  constructor(private readonly concurrency: number) {}
  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        this.active++;
        task().then(
          (v) => { this.active--; this.pump(); resolve(v); },
          (e) => { this.active--; this.pump(); reject(e); },
        );
      };
      this.queue.push(run);
      this.pump();
    });
  }
  private pump() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    }
  }
}

const enrichmentQueue = new RequestQueue(2);

interface Props {
  markId: string;
  instance: unknown;
  /** Stable identifier for the instance (e.g. rabbi name). Used to scope
   *  the per-card stamp so re-clicking a different rabbi triggers a fresh
   *  fetch. */
  instanceKey: string;
  tractate: string;
  page: string;
  /** Fired with the aggregate's `deps_resolved` + `anchors_resolved` once
   *  the synthesis run lands. Lets the parent sidebar render mark-specific
   *  UI (e.g. argument subsection pills) from the same fetch that produced
   *  the synthesis paragraph — no duplicate `/api/studio/run` call.
   *  `deps_resolved` keys are enrichment ids; `anchors_resolved` keys are
   *  mark ids. Either may be undefined. */
  onResolved?: (resolved: {
    deps_resolved?: Record<string, unknown>;
    anchors_resolved?: Record<string, unknown>;
  }) => void;
}

// Pluggable per-enrichment renderers can be registered here in the future.
// For now we use the generic ParsedFieldView (below) which renders any
// parsed JSON nicely by inferring field types from key names.

export default function MarkEnrichmentCards(props: Props) {
  const [defs] = createResource(fetchEnrichments);
  const [runs, setRuns] = createSignal<Record<string, RunState>>({});
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
  // Each call goes through the shared `enrichmentQueue` (concurrency 2) so
  // mounting many move cards doesn't barrage the worker. Results that arrive
  // after the user has navigated away (stale stamp) are dropped.
  createEffect(() => {
    const list = matching();
    if (list.length === 0) return;
    const s = stamp();
    untrack(() => {
      for (const d of list) {
        const cur = runs()[d.id];
        if (cur && cur.kind !== 'idle' && cur.stamp === s) continue;
        setRun(d.id, { kind: 'loading', stamp: s });
        void enrichmentQueue.enqueue(() =>
          runEnrichment(d.id, props.tractate, props.page, props.instance),
        ).then(
          (result) => {
            // Drop the result if the user moved on (different daf or
            // instance) — the new effect run already queued a fresh task
            // for the current stamp.
            if (stamp() !== s) return;
            setRun(d.id, { kind: 'ok', stamp: s, result });
            // For aggregate enrichments: server returns each dep's parsed
            // output in `deps_resolved` (enrichments) and `anchors_resolved`
            // (marks). Populate per-leaf run state so the dev dropdown can
            // render leaves instantly without a second /api/studio/run call.
            // Forward both maps to onResolved so parent sidebars can render
            // mark-specific UI from the same data.
            const resolved = result.deps_resolved;
            if (resolved || result.anchors_resolved) {
              props.onResolved?.({
                deps_resolved: resolved,
                anchors_resolved: result.anchors_resolved,
              });
            }
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
          (err) => {
            if (stamp() !== s) return;
            setRun(d.id, { kind: 'error', stamp: s, error: String((err as Error)?.message ?? err) });
          },
        );
      }
    });
  });

  // Pretty-print "rabbi.bio" → "Bio", "rabbi.daf-role" → "Daf role".
  const prettyDepLabel = (depId: string, markId: string): string => {
    const tail = depId.startsWith(`${markId}.`) ? depId.slice(markId.length + 1) : depId;
    return tail.replace(/[-_]/g, ' ').replace(/\b\w/, (m) => m.toUpperCase());
  };

  // Which enrichment is currently the focal one? In dev mode this follows
  // the dropdown / badge selection; otherwise it's the first aggregate
  // (= synthesis) or, if none, the first leaf.
  const currentView = (): EnrichmentDef | null => {
    const sel = selectedDevView();
    if (sel) return allMatching().find((d) => d.id === sel) ?? null;
    const a = aggregates();
    if (a.length > 0) return a[0];
    const l = leaves();
    return l.length > 0 ? l[0] : null;
  };
  const currentRun = (): RunState =>
    runs()[currentView()?.id ?? ''] ?? { kind: 'idle' };

  // Dependencies that fed the current view. For a synthesis-style aggregate
  // the deps are the leaves it consumed (taken from deps_resolved on the
  // run); for a leaf with no upstream deps we surface its own id so the
  // tray always shows what produced the text.
  const currentDepBadges = (): string[] => {
    const v = currentView();
    if (!v) return [];
    const r = currentRun();
    if (r.kind === 'ok' && r.result.deps_resolved) {
      return Object.keys(r.result.deps_resolved);
    }
    // Pull enrichment-typed dep IDs out of the unified dependencies array
    // (also covers source-tag deps and mark deps, but those don't render as
    // leaf badges).
    const enrichmentDeps = (v.dependencies ?? [])
      .map((d) => (d && typeof d === 'object' && 'enrichment' in d) ? (d as { enrichment: string }).enrichment : null)
      .filter((s): s is string => !!s);
    if (enrichmentDeps.length > 0) return enrichmentDeps;
    return [v.id];
  };

  // Loading copy: pick something evocative based on what's being worked on.
  const loadingCopy = (): string => {
    if (props.markId === 'rabbi') {
      const inst = props.instance as { name?: string } | null;
      return inst?.name ? `Interviewing ${inst.name}…` : 'Interviewing the Rabbi…';
    }
    if (props.markId === 'argument') {
      const inst = props.instance as { fields?: { title?: string } } | null;
      const title = inst?.fields?.title;
      return title ? `Tracing the argument: ${title}…` : 'Tracing the argument…';
    }
    if (props.markId === 'pesukim') {
      const inst = props.instance as { fields?: { verseRef?: string } } | null;
      const ref = inst?.fields?.verseRef;
      return ref ? `Reading ${ref} in context…` : 'Reading the verse in context…';
    }
    return 'Generating…';
  };

  // Body renderer shared across dev / non-dev: loading state, error, or
  // the content paragraph (Hebraized + parsed JSON aware).
  const renderBody = (): JSX.Element => {
    const r = currentRun();
    if (r.kind === 'loading' || r.kind === 'idle') {
      return (
        <div style={{
          display: 'flex', 'align-items': 'center', gap: '0.6rem',
          padding: '0.7rem 0.2rem', color: '#666', 'font-size': '0.88rem',
          'font-style': 'italic',
        }}>
          <span style={{
            display: 'inline-block', width: '0.85rem', height: '0.85rem',
            'border-radius': '50%',
            border: '2px solid #d6d3d1', 'border-top-color': '#8a2a2b',
            animation: 'daf-spin 0.8s linear infinite',
          }} />
          {loadingCopy()}
        </div>
      );
    }
    if (r.kind === 'error') {
      return (
        <div style={{ color: '#c00', 'font-family': 'monospace', 'font-size': '0.78rem', padding: '0.4rem 0' }}>
          {r.error}
        </div>
      );
    }
    const result = r.result;
    if (result.parsed && typeof result.parsed === 'object') {
      return <ParsedFieldView parsed={result.parsed as Record<string, unknown>} />;
    }
    return (
      <p style={{ margin: 0, 'font-size': '0.92rem', 'line-height': 1.6, color: '#222' }}>
        <Hebraized text={result.content} />
      </p>
    );
  };

  // Badges container — one-line scrollable strip of pill-shaped chips
  // showing what produced the current view.
  const renderDepsTray = (): JSX.Element => (
    <div style={{
      display: 'flex', gap: '0.25rem',
      'overflow-x': 'auto', 'overflow-y': 'hidden',
      'white-space': 'nowrap',
      'border-top': '1px solid #f0f0f0',
      'margin-top': '0.6rem',
      'padding-top': '0.5rem',
    }}>
      <span style={{ 'font-size': '0.65rem', color: '#aaa', 'flex-shrink': 0, 'padding-top': '2px' }}>built from</span>
      <For each={currentDepBadges()}>{(depId) => (
        <button
          onClick={() => setSelectedDevView(depId === currentView()?.id ? null : depId)}
          title={`View ${depId}`}
          style={{
            'flex-shrink': 0,
            padding: '1px 8px', 'font-size': '0.7rem', cursor: 'pointer',
            background: selectedDevView() === depId ? '#000' : '#f0f0f0',
            color: selectedDevView() === depId ? '#fff' : '#444',
            border: '1px solid #ddd', 'border-radius': '10px',
            'font-family': 'inherit',
          }}
        >
          {prettyDepLabel(depId, props.markId)}
        </button>
      )}</For>
    </div>
  );

  // ===== DEV MODE =====
  // Dropdown + body + deps tray.
  const renderDev = (): JSX.Element => (
    <div>
      <div style={{ 'font-size': '0.7rem', color: '#888', display: 'flex', 'align-items': 'center', gap: '0.4rem', 'margin-bottom': '0.5rem' }}>
        <span>view:</span>
        <select
          value={selectedDevView() ?? ''}
          onChange={(e) => setSelectedDevView(e.currentTarget.value || null)}
          style={{ 'font-size': '0.75rem', padding: '1px 4px', 'font-family': 'inherit' }}
        >
          <Show when={aggregates().length > 0}>
            <option value="">{`[${aggregates()[0]?.scope ?? 'local'}] synthesis`}</option>
          </Show>
          <For each={leaves()}>{(d) => (
            <option value={d.id}>{`[${d.scope ?? 'global'}] ${prettyDepLabel(d.id, props.markId)}`}</option>
          )}</For>
        </select>
        <Show when={currentRun().kind === 'ok'}>
          <span style={{ color: '#bbb', 'font-size': '0.7rem', 'margin-left': 'auto' }}>
            {(currentRun() as Extract<RunState, { kind: 'ok' }>).result.total_ms}ms
          </span>
        </Show>
      </div>
      <div style={{
        background: '#fafafa',
        border: '1px solid #eee',
        'border-radius': '6px',
        padding: '0.7rem 0.85rem',
      }}>
        {renderBody()}
        {renderDepsTray()}
      </div>
    </div>
  );

  // ===== PRODUCTION =====
  // Just the synthesis output (or loading) in a subtle container — no
  // dropdown, no header, no deps tray.
  const renderProd = (): JSX.Element => (
    <div style={{
      background: '#fafafa',
      border: '1px solid #eee',
      'border-radius': '6px',
      padding: '0.85rem 1rem',
    }}>
      {renderBody()}
    </div>
  );

  return (
    <Show when={devModeActive()} fallback={renderProd()}>
      {renderDev()}
    </Show>
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
