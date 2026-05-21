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
import { Portal } from 'solid-js/web';
import { HebraizedWithRabbis as Hebraized } from './rabbiLinks';
import { devModeActive } from './DevModeShelf';
import { trackAI, queueActivity } from './aiActivity';
import InstanceInspectorShelf from './InstanceInspectorShelf';

// Single global "which card has the inspector open?" signal — keyed by the
// card's instanceKey. Only one drawer at a time across the whole page.
const [openInspectorKey, setOpenInspectorKey] = createSignal<string | null>(null);

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
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number } | null;
  transport?: string;
  attempts?: number;
  elapsed_ms?: number;
  resolved?: { system_prompt: string; user_prompt: string };
  /** Aggregate-only: parsed output of each dep enrichment, keyed by dep id.
   *  Lets the client surface leaves in the inspector without a second
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
//   { status: 'ok', result: RunResult, total_ms? }            ← cache hit, immediate
//   { status: 'pending', runId: string, cacheKey?: string }   ← enqueued, poll
//   { status: 'error', error: string }
//
// `cacheKey` (when present) is the canonical KV key that runEnrichmentOnce
// writes to right before the queue handler writes `job:{runId}`. The
// polling helper passes it back so run-status can recover the result via
// canonical cache if the consumer was terminated in that write gap.
type RunResponse =
  | { status: 'ok'; result: RunResult; total_ms?: number }
  | { status: 'pending'; runId: string; cacheKey?: string }
  | { status: 'error'; error: string };

const POLL_INTERVAL_MS = 1500;
// Cold-page syntheses (e.g. pesukim.synthesis) can run 60+ seconds end-to-end
// once their leaves + anchor marks queue behind other in-flight jobs. With
// client enrichmentQueue concurrency=4 and ~5–10 instances per page, the
// last card in line can wait ~3–5 min. 600s gives enough headroom that
// users don't see the synthesis card time out before the worker finishes.
const POLL_TIMEOUT_MS = 600_000;

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
    if (j.status === 'pending') return pollJob(j.runId, j.cacheKey);
  }
  // Legacy/synchronous shape — treat the whole body as RunResult for back-compat.
  return j as unknown as RunResult;
}

// Builds the activity-store id + label for an enrichment run. Pulled out
// of runEnrichment() so the request queue can mark the entry `queued` the
// moment it's pushed onto the FIFO (before a slot is free) — the same id
// is later promoted to `loading` by trackAI() when the task actually fires.
function enrichmentActivityKey(
  enrichmentId: string,
  tractate: string,
  page: string,
  markInput: unknown,
  instanceKey: string,
): { id: string; label: string } {
  const inst = markInput as
    | { name?: string; fields?: { id?: string; name?: string; verseRef?: string; topic?: string } }
    | null;
  const instanceTag =
    inst?.fields?.id
    ?? inst?.fields?.name
    ?? inst?.fields?.verseRef
    ?? inst?.fields?.topic
    ?? inst?.name
    ?? '';
  const id = `${enrichmentId}:${tractate}:${page}:${instanceKey}`;
  const label = instanceTag
    ? `${enrichmentId} · ${instanceTag} · ${tractate} ${page}`
    : `${enrichmentId} · ${tractate} ${page}`;
  return { id, label };
}

// Wraps the actual run in `trackAI` so the AIActivityPanel sees the
// loading→ok lifecycle and the dev-shelf log captures [ai] lines.
//
// The activity store keys by `id`, so two concurrent runs with the same id
// collapse into one entry — the second overwrites the first's start time
// and the user only sees one spinner. Use `instanceKey` (always unique per
// mark+instance, e.g. "Chullin:11a:0:Source for rov") in the id so clicking
// rapidly between halacha topics, or between halacha and rabbi, surfaces
// every in-flight job separately in the panel.
async function runEnrichment(
  enrichmentId: string,
  tractate: string,
  page: string,
  markInput: unknown,
  instanceKey: string,
): Promise<RunResult> {
  const { id, label } = enrichmentActivityKey(enrichmentId, tractate, page, markInput, instanceKey);
  return trackAI(id, label, () => runEnrichmentImpl(enrichmentId, tractate, page, markInput));
}

async function pollJob(runId: string, cacheKey?: string): Promise<RunResult> {
  const start = Date.now();
  const qs = cacheKey ? `?k=${encodeURIComponent(cacheKey)}` : '';
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const r = await fetch(`/api/studio/run-status/${encodeURIComponent(runId)}${qs}`);
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
  // `activityId` + `activityLabel` are reported to the shared activity
  // store as a `queued` entry the instant the task is pushed onto the
  // FIFO. When pump() finally invokes the task, trackAI() inside the work
  // function promotes the same id to `loading`. If a slot is free
  // immediately (active < concurrency), the queued state is set then
  // overwritten on the same tick — that's fine; the panel just never
  // shows a flash of "queued" for fast-path enqueues.
  enqueue<T>(activityId: string, activityLabel: string, task: () => Promise<T>): Promise<T> {
    queueActivity(activityId, activityLabel);
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

// Server max_concurrency=10 on the enrichment queue, so client can dispatch
// more in parallel without overwhelming workerd. 4 gives a 2× speedup on
// pages with many pesukim/argument-move instances without risking the
// 2026-05-07 simultaneous-fan-out incident.
const enrichmentQueue = new RequestQueue(4);

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
        const { id: actId, label: actLabel } = enrichmentActivityKey(
          d.id, props.tractate, props.page, props.instance, props.instanceKey,
        );
        void enrichmentQueue.enqueue(actId, actLabel, () =>
          runEnrichment(d.id, props.tractate, props.page, props.instance, props.instanceKey),
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
    if (props.markId === 'argument-move') {
      const inst = props.instance as { fields?: { voice?: string } } | null;
      const voice = inst?.fields?.voice;
      return voice ? `Listening to ${voice}…` : 'Tracing the flow…';
    }
    if (props.markId === 'halacha') {
      const inst = props.instance as { fields?: { title?: string; topic?: string } } | null;
      const title = inst?.fields?.title ?? inst?.fields?.topic;
      return title ? `Asking a Rav about ${title}…` : 'Asking the Rav…';
    }
    if (props.markId === 'aggadata') {
      const inst = props.instance as { fields?: { title?: string } } | null;
      const title = inst?.fields?.title;
      return title ? `Pondering ${title}…` : 'Wondering…';
    }
    if (props.markId === 'pesukim') {
      const inst = props.instance as { fields?: { verseRef?: string } } | null;
      const ref = inst?.fields?.verseRef;
      return ref ? `Reading ${ref} in context…` : 'Reading the verse in context…';
    }
    if (props.markId === 'places') {
      const inst = props.instance as { fields?: { name?: string } } | null;
      const name = inst?.fields?.name;
      return name ? `Visiting ${name}…` : 'Travelling…';
    }
    if (props.markId === 'rishonim') {
      return 'Listening to Rashi and Tosafot…';
    }
    return 'Learning…';
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
            'flex-shrink': 0,
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

  // Human-friendly label for the instance (used in the inspector header).
  const instanceLabel = (): string => {
    const inst = props.instance as { name?: string; fields?: { title?: string; verseRef?: string; topic?: string; name?: string; id?: string } } | null;
    return (
      inst?.fields?.title
      ?? inst?.fields?.verseRef
      ?? inst?.fields?.topic
      ?? inst?.fields?.name
      ?? inst?.name
      ?? inst?.fields?.id
      ?? props.instanceKey
    );
  };

  const isInspectorOpen = () => openInspectorKey() === props.instanceKey;
  const closeInspector = () => setOpenInspectorKey(null);
  const openInspector = (e?: MouseEvent) => {
    // Cards may live inside an outer click-target (e.g. ArgumentMoveCard's
    // toggleHighlight wrapper). Stop propagation so the inspector affordance
    // doesn't double as a highlight toggle.
    if (e) e.stopPropagation();
    setOpenInspectorKey(props.instanceKey);
  };

  // Sidebar card: production view in all modes — clean synthesis output in
  // a subtle container. The dev-mode 'i' affordance overlays the top-right
  // and opens the InstanceInspectorShelf bottom drawer with leaf-walk
  // controls, prompts, and telemetry.
  return (
    <>
      <div style={{
        position: 'relative',
        background: '#fafafa',
        border: '1px solid #eee',
        'border-radius': '6px',
        padding: '0.85rem 1rem',
      }}>
        {renderBody()}
        <Show when={devModeActive()}>
          <button
            onClick={openInspector}
            title="Inspect this synthesis"
            aria-label="Inspect this synthesis"
            style={{
              position: 'absolute',
              top: '0.35rem', right: '0.35rem',
              width: '1.4rem', height: '1.4rem',
              padding: 0,
              cursor: 'pointer',
              background: isInspectorOpen() ? '#000' : 'transparent',
              color: isInspectorOpen() ? '#fff' : '#888',
              border: '1px solid #ddd',
              'border-radius': '50%',
              'font-size': '0.7rem',
              'font-family': 'ui-serif, Georgia, serif',
              'font-style': 'italic',
              'line-height': 1,
            }}
          >
            i
          </button>
        </Show>
      </div>
      <Show when={devModeActive() && isInspectorOpen()}>
        {/* Portal to document.body so the drawer escapes whatever stacking
            context the host card lives in (e.g. .daf-aside is position:
            sticky, which clamps a nested fixed-positioned element's
            z-index to the sticky's context — and DevModeShelf at z 900
            otherwise wins over an in-context z 1000). */}
        <Portal>
          <InstanceInspectorShelf
            instanceLabel={instanceLabel()}
            markId={props.markId}
            aggregates={aggregates()}
            leaves={leaves()}
            selected={selectedDevView()}
            onSelect={(id) => setSelectedDevView(id)}
            currentView={currentView()}
            currentRun={currentRun()}
            depBadges={currentDepBadges()}
            prettyDepLabel={(depId) => prettyDepLabel(depId, props.markId)}
            renderBody={renderBody}
            onClose={closeInspector}
          />
        </Portal>
      </Show>
    </>
  );
}

/**
 * Generic field-by-field renderer for parsed JSON enrichment output.
 * Uses field name conventions to format common shapes nicely:
 *   - field ending in `_he` or named `*_quote_he` → render dir=rtl Hebrew
 *   - field starting with `historical_*`, `role_*`, `bio*` → paragraph
 *   - arrays of strings → bulleted list
 */
/**
 * Render an item inside the array branch of ParsedFieldView. Items are
 * usually either strings (legacy / simple lists) or objects (rabbi
 * relationships/geography/evidence). Picks a primary-identifier field
 * (name, place, title, label, excerpt) for the headline and renders any
 * remaining fields as a small comma-separated suffix. Falls back to
 * stringified JSON for anything we don't recognize so the user sees real
 * data instead of "[object Object]".
 */
function ArrayItem(props: { item: unknown }) {
  const v = props.item;
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return <>{String(v)}</>;
  }
  if (typeof v !== 'object') return <>{String(v)}</>;
  const obj = v as Record<string, unknown>;
  // Hebrew/Aramaic excerpts get RTL treatment — evidence enrichments use
  // {excerpt, refStub, etc.}; the excerpt is the only field worth seeing
  // first.
  const HEAD_KEYS = ['name', 'place', 'title', 'label', 'excerpt', 'id'];
  const headKey = HEAD_KEYS.find((k) => typeof obj[k] === 'string' && (obj[k] as string).length > 0);
  const head = headKey ? (obj[headKey] as string) : null;
  const restEntries = Object.entries(obj).filter(([k, val]) => {
    if (k === headKey) return false;
    if (val === null || val === undefined || val === '') return false;
    if (typeof val === 'boolean' && !val) return false;
    return true;
  });
  if (!head && restEntries.length === 0) return null;
  return (
    <span>
      <Show when={head}>
        <Show when={headKey === 'excerpt'} fallback={<span style={{ 'font-weight': 500 }}><Hebraized text={head as string} /></span>}>
          <span dir="rtl" lang="he" style={{ 'font-family': '"Mekorot Vilna", serif' }}>{head}</span>
        </Show>
      </Show>
      <Show when={restEntries.length > 0}>
        <span style={{ color: '#666', 'font-size': '0.85em' }}>
          {head ? ' — ' : ''}
          <For each={restEntries}>
            {([k, val], i) => (
              <>
                {i() > 0 ? ', ' : ''}
                <span style={{ color: '#888' }}>{k}:</span>{' '}
                <Show when={typeof val === 'string'} fallback={<>{JSON.stringify(val)}</>}>
                  <Hebraized text={val as string} />
                </Show>
              </>
            )}
          </For>
        </span>
      </Show>
    </span>
  );
}

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
                  <For each={value}>{(v) => <li><ArrayItem item={v} /></li>}</For>
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
