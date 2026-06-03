/**
 * MarksRegistryPanel — toggle list of KV-defined marks/enrichments, mounted
 * inside the DafViewer's existing "Options" disclosure. Each toggle:
 *
 *   - off (default for all): nothing fetches, no daf decoration
 *   - on:  fetches /api/run for the current tractate/page, stores
 *          the result, exposes a status pill (loading / ok / error)
 *
 * Per-instance prompt/output inspection lives on the synthesis card (via
 * the 'i' button → InstanceInspectorShelf), not here. This list is just
 * the toggle surface.
 *
 * Toggle state persists in localStorage globally — flipping rabbi on
 * carries across pages. Re-runs only fire when the daf changes or the def
 * hash changes (server-side cache key includes the def hash), not on every
 * state mutation.
 *
 * Renderers per (anchor, render) kind are NOT here yet; this slice just
 * wires the loop end-to-end. Phase 2 of the daf integration adds proper
 * renderers that decorate the daf in place.
 */

import { createResource, createSignal, createEffect, createMemo, onMount, onCleanup, untrack, For, Show, type JSX } from 'solid-js';
import { trackAI } from './aiActivity';
import { lang } from './i18n';
import { devModeActive } from './DevModeShelf';
import type { SeedMark } from './seed-marks';
import type { SidebarRecipe } from '../lib/sidebar/recipe';
import type { MarkDef as RendererMarkDef, MarkRunOutput as RendererMarkRunOutput } from './renderers/dispatch';
import { producerNodesFrom, reverseDependencyIndex, type RawDependency } from '../lib/registry/depGraph';

type LLMModelId = `@cf/${string}` | `openrouter/${string}`;

export interface EnrichmentDefinition {
  id: string;
  label: string;
  description?: string;
  mark: string;
  /** What this enrichment is built from — source inputs + producer refs.
   *  Used to detect which enrichments are *consumed* by another producer
   *  (a synthesis), so the panel shows them as passive status, not a switch. */
  dependencies?: RawDependency[];
  system_prompt: string;
  user_prompt_template: string;
  model?: LLMModelId;
  output_schema?: unknown;
  thinking_off?: boolean;
  cache_version: string;
  source: 'kv' | 'code';
  updated_at: string;
  status?: 'draft' | 'promoted';
}

/** Worker-side mark definition (code or KV) returned by /api/marks.
 *  Carries the full anchor+render+extractor schema. */
export interface WorkerMarkDefinition {
  id: string;
  label: string;
  description?: string;
  category?: string;
  /** UI nesting hint — when set, the panel groups this mark under that parent. */
  parent_mark?: string;
  /** What this mark is built from (source inputs + producer refs) — feeds the
   *  reverse-dependency index that classifies consumed-vs-standalone enrichments. */
  dependencies?: RawDependency[];
  /** Experimental feature flag — hidden from readers; only surfaces in dev mode. */
  experimental?: boolean;
  anchor: 'segment' | 'segment-range' | 'phrase' | 'multi-anchor' | 'cross-daf' | 'external' | 'whole-daf';
  render: { kind: string; [k: string]: unknown };
  /** Declarative sidebar-card recipe, when the mark's card is recipe-driven. */
  recipe?: SidebarRecipe;
  extractor: {
    kind: 'llm' | 'sefaria' | 'computed' | 'manual';
    model?: LLMModelId;
    system_prompt?: string;
    user_prompt_template?: string;
    output_schema?: unknown;
    thinking_off?: boolean;
  };
  status: 'draft' | 'promoted';
  def_hash: string;
  cache_version: string;
  source: 'kv' | 'code';
  updated_at: string;
}

/** Internal row: a code-defined seed (legacy DafViewer signal), a KV/code
 *  worker-defined mark, or a KV-defined enrichment. */
type Row =
  | { source: 'seed'; seed: SeedMark }
  | { source: 'mark'; def: WorkerMarkDefinition }
  | { source: 'enrichment'; def: EnrichmentDefinition };

// ---------------------------------------------------------------------------
// Shared signals — exported so DafViewer can read the current run state and
// apply renderers in its tokenized() pipeline.
// ---------------------------------------------------------------------------

const [globalMarkRuns, setGlobalMarkRuns] = createSignal<Record<string, RendererMarkRunOutput | undefined>>({});
const [globalEnabledMarks, setGlobalEnabledMarks] = createSignal<RendererMarkDef[]>([]);

/** Accessor for DafViewer: which marks (with their anchor/render config) are
 *  currently enabled. Renderer dispatcher uses this to know what to apply. */
export function enabledMarkDefs() { return globalEnabledMarks(); }

/** Accessor for DafViewer: the most recent run output per mark id. */
export function markRunsByMarkId() { return globalMarkRuns(); }

/** Lightweight per-mark status (idle/loading/ok/error + label) so the
 *  daf-page can show inline loading/error indicators without needing the
 *  full run output. */
export interface MarkStatusEntry {
  id: string;
  label: string;
  kind: 'idle' | 'loading' | 'ok' | 'error';
  ms?: number;
  error?: string;
}

const [globalMarkStatuses, setGlobalMarkStatuses] = createSignal<MarkStatusEntry[]>([]);
export function markStatuses() { return globalMarkStatuses(); }

export interface RunResult {
  content: string;
  reasoning?: string;
  parsed: unknown;
  parse_error: string | null;
  model: LLMModelId;
  transport: string;
  attempts: number;
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  } | null;
  elapsed_ms: number;
  resolved: { system_prompt: string; user_prompt: string };
  total_ms: number;
  /** True when the worker served this from the KV cache (no LLM call). On a
   *  hit total_ms is injected as 0, but elapsed_ms still carries the original
   *  generation time from when the result was first computed. */
  cache_hit?: boolean;
}

export type RunState =
  | { kind: 'idle' }
  | { kind: 'loading'; stamp: string }
  | { kind: 'ok'; stamp: string; at: number; result: RunResult }
  | { kind: 'error'; stamp: string; at: number; error: string };

const ENABLED_KEY = 'marks-registry:enabled:v1';

/** First-visit detection. When the localStorage key is missing entirely,
 *  we auto-enable every mark in the registry (default-on) once it loads.
 *  After any user toggle writes the key, this flag flips off so the
 *  user's explicit choice is respected (including "all off"). */
function hasEverSavedEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) !== null; } catch { return true; }
}

function readEnabled(): Set<string> {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set(parsed.filter((s): s is string => typeof s === 'string'));
  } catch { /* ignore */ }
  return new Set();
}

function writeEnabled(s: Set<string>) {
  try { localStorage.setItem(ENABLED_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

// Marks introduced after the "enable all on first visit" default should still
// turn ON for users who already have a saved set (otherwise a new mark is
// invisible to every existing user). Each entry is applied AT MOST ONCE — its
// tag is recorded so a later explicit toggle-off sticks. Append a new entry
// (with a fresh tag) whenever a new default-on mark ships.
const DEFAULTS_APPLIED_KEY = 'marks-registry:defaults-applied:v1';
const FORCE_ON_DEFAULTS: { tag: string; ids: string[] }[] = [
  { tag: 'argument-overview-2026-05', ids: ['argument-overview'] },
  { tag: 'daf-background-2026-05', ids: ['daf-background'] },
  { tag: 'tidbit-2026-06', ids: ['tidbit'] },
  { tag: 'biyun-2026-06', ids: ['biyun'] },
  { tag: 'yerushalmi-2026-06', ids: ['yerushalmi'] },
];

function readAppliedDefaults(): Set<string> {
  try {
    const raw = localStorage.getItem(DEFAULTS_APPLIED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return new Set(parsed.filter((s): s is string => typeof s === 'string'));
    }
  } catch { /* ignore */ }
  return new Set();
}

function writeAppliedDefaults(tags: Iterable<string>) {
  try { localStorage.setItem(DEFAULTS_APPLIED_KEY, JSON.stringify([...tags])); } catch { /* ignore */ }
}

async function fetchAll(): Promise<{ marks: WorkerMarkDefinition[]; enrichments: EnrichmentDefinition[] }> {
  const [m, e] = await Promise.all([
    fetch('/api/marks').then((r) => r.ok ? r.json() : { marks: [] }),
    fetch('/api/enrichments').then((r) => r.ok ? r.json() : { enrichments: [] }),
  ]);
  return {
    marks: ((m as { marks?: WorkerMarkDefinition[] }).marks) ?? [],
    enrichments: ((e as { enrichments?: EnrichmentDefinition[] }).enrichments) ?? [],
  };
}

// /api/run is now async (queue-backed). Three response shapes:
//   { status: 'ok', result }                            ← cache hit, immediate
//   { status: 'pending', runId, cacheKey? } (HTTP 202)  ← enqueued, poll run-status
//   { status: 'error', error }
// cacheKey is forwarded to run-status so the polling recovers the result
// from the canonical cache when the queue consumer never wrote job:{runId}.
type RunResponse =
  | { status: 'ok'; result: RunResult; total_ms?: number }
  | { status: 'pending'; runId: string; cacheKey?: string }
  | { status: 'error'; error: string };

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 180_000;

/** Studio secret for the privileged /api/run knobs (bypass_cache here).
 *  The owner sets it once via
 *  `localStorage.setItem('talmud_studio_secret', '<secret>')` in the browser
 *  console; it rides along as the x-studio-secret header so the server treats
 *  these requests as trusted. Absent => the server simply downgrades
 *  bypass_cache to a cache-respecting run (no error), so this panel still works
 *  read-only for everyone else. */
function studioHeaders(): Record<string, string> {
  try {
    const s = localStorage.getItem('talmud_studio_secret');
    return s ? { 'x-studio-secret': s } : {};
  } catch {
    return {};
  }
}

async function postAndAwait(body: unknown): Promise<RunResult> {
  const r = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...studioHeaders() },
    body: JSON.stringify(body),
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
  // Back-compat: legacy synchronous shape — treat the whole body as RunResult.
  return j as unknown as RunResult;
}

async function pollJob(runId: string, cacheKey?: string): Promise<RunResult> {
  const start = Date.now();
  const qs = cacheKey ? `?k=${encodeURIComponent(cacheKey)}` : '';
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const r = await fetch(`/api/run-status/${encodeURIComponent(runId)}${qs}`);
    const j = await r.json() as RunResponse;
    if ('status' in j) {
      if (j.status === 'ok') return (j as { result: RunResult }).result;
      if (j.status === 'error') throw new Error((j as { error: string }).error);
      // pending — keep polling
    }
  }
  throw new Error(`job ${runId} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

// Output language threads into every run. The worker namespaces the :he cache
// + selects the *_he prompt variant; the lang also tags the activityId so the
// client-side run cache + trackAI dedup don't serve an EN result for HE.
async function runMark(id: string, tractate: string, page: string, bypassCache = false): Promise<RunResult> {
  const l = lang();
  const activityId = `mark:${id}:${tractate}:${page}:${l}${bypassCache ? ':fresh' : ''}`;
  const label = `${id} · ${tractate} ${page}`;
  return trackAI(activityId, label, () => postAndAwait({ mark_id: id, tractate, page, bypass_cache: bypassCache, lang: l }));
}

async function runEnrichment(id: string, tractate: string, page: string, bypassCache = false): Promise<RunResult> {
  const l = lang();
  const activityId = `enrichment:${id}:${tractate}:${page}:${l}${bypassCache ? ':fresh' : ''}`;
  const label = `${id} · ${tractate} ${page}`;
  return trackAI(activityId, label, () => postAndAwait({ enrichment_id: id, tractate, page, bypass_cache: bypassCache, lang: l }));
}

interface Props {
  tractate: string;
  page: string;
  seedMarks: SeedMark[];
}

export default function MarksRegistryPanel(props: Props) {
  const [registry, { refetch: refetchDefs }] = createResource(fetchAll);
  // Experimental marks (e.g. the whole-daf argument map) are hidden from readers
  // and only surface in dev mode — across the toggle list, rendering, status,
  // the auto-run loop, and first-visit default-on. devModeActive() is reactive,
  // so flipping dev mode shows/hides them live without a reload.
  const visibleMarks = (reg: { marks: WorkerMarkDefinition[] } | undefined): WorkerMarkDefinition[] =>
    reg ? reg.marks.filter((m) => !m.experimental || devModeActive()) : [];
  // An enrichment is hidden when its parent mark is experimental and dev is off
  // — so a hidden mark's enrichments neither show in the panel nor auto-run.
  const hiddenEnrichment = (markId: string | undefined): boolean => {
    if (devModeActive() || !markId) return false;
    const reg = registry();
    return (reg?.marks ?? []).some((m) => m.id === markId && m.experimental === true);
  };
  const [enabled, setEnabled] = createSignal<Set<string>>(readEnabled());
  const [runs, setRuns] = createSignal<Record<string, RunState>>({});
  // Expand state per mark id — enrichments under each mark are hidden
  // until the user clicks the mark row's chevron. Default collapsed so the
  // top-level list reads as just the major anchors.
  const [expandedMarks, setExpandedMarks] = createSignal<Set<string>>(new Set());
  const toggleExpanded = (markId: string) => {
    setExpandedMarks((prev) => {
      const next = new Set(prev);
      if (next.has(markId)) next.delete(markId);
      else next.add(markId);
      return next;
    });
  };

  const setRun = (id: string, state: RunState) =>
    setRuns((prev) => ({ ...prev, [id]: state }));

  // External invalidation: settings page (or anywhere else that mutates the
  // model registry / settings KV) dispatches `marks-runs-invalidate` after
  // a successful save. We clear all panel-side run state so enabled marks
  // re-fire under the new model. Without this, switching default models
  // leaves stale results visible until the user navigates pages.
  onMount(() => {
    const onInv = () => setRuns({});
    window.addEventListener('marks-runs-invalidate', onInv);
    onCleanup(() => window.removeEventListener('marks-runs-invalidate', onInv));
  });

  // Default-on for first-time visitors. When the user has never explicitly
  // toggled anything (localStorage key absent), turn every promoted mark
  // on automatically once the registry loads. Subsequent visits with a
  // saved set — even "all off" — are respected. Effect runs once: it
  // checks the sentinel before writing.
  createEffect(() => {
    const reg = registry();
    if (!reg) return;
    const promoted = visibleMarks(reg).filter((m) => m.status !== 'draft').map((m) => m.id);
    if (promoted.length === 0) return;

    if (!hasEverSavedEnabled()) {
      // First visit: every promoted mark on. Record all force-on tags as
      // applied so the migration below never re-enables them later.
      const next = new Set([...enabled(), ...promoted]);
      setEnabled(next);
      writeEnabled(next);
      writeAppliedDefaults(FORCE_ON_DEFAULTS.map((d) => d.tag));
      return;
    }

    // Returning user with a saved set: apply any not-yet-applied force-on
    // defaults exactly once, so newly-shipped default-on marks turn on without
    // clobbering the user's explicit choices for everything else.
    const applied = readAppliedDefaults();
    const pending = FORCE_ON_DEFAULTS.filter((d) => !applied.has(d.tag));
    if (pending.length === 0) return;
    const ids = pending.flatMap((d) => d.ids).filter((id) => promoted.includes(id));
    if (ids.length > 0) {
      const next = new Set([...enabled(), ...ids]);
      setEnabled(next);
      writeEnabled(next);
    }
    writeAppliedDefaults([...applied, ...pending.map((d) => d.tag)]);
  });

  // Re-publish enabled marks (with their definitions) and the parsed run
  // outputs to the global signals so DafViewer's renderer dispatcher can
  // pick them up.
  createEffect(() => {
    const reg = registry();
    if (!reg) return;
    const on = enabled();
    const defs: RendererMarkDef[] = [];
    for (const m of visibleMarks(reg)) {
      if (!on.has(m.id)) continue;
      defs.push({ id: m.id, anchor: m.anchor, render: m.render });
    }
    setGlobalEnabledMarks(defs);
  });

  createEffect(() => {
    const next: Record<string, RendererMarkRunOutput | undefined> = {};
    const r = runs();
    for (const id of Object.keys(r)) {
      const s = r[id];
      if (s?.kind === 'ok') {
        const parsed = s.result.parsed as { instances?: unknown } | null;
        if (parsed && Array.isArray((parsed as { instances?: unknown }).instances)) {
          next[id] = { parsed: parsed as { instances: never[] } };
        }
      }
    }
    setGlobalMarkRuns(next);
  });

  // Publish a slim per-mark status feed for the daf header indicator. Only
  // includes worker-defined marks (from the registry); legacy seeds drive
  // their own loading via existing createResource calls.
  createEffect(() => {
    const reg = registry();
    if (!reg) return;
    const on = enabled();
    const r = runs();
    const out: MarkStatusEntry[] = [];
    for (const m of visibleMarks(reg)) {
      if (!on.has(m.id)) continue;
      const s = r[m.id];
      if (!s || s.kind === 'idle') {
        out.push({ id: m.id, label: m.label, kind: 'idle' });
      } else if (s.kind === 'loading') {
        out.push({ id: m.id, label: m.label, kind: 'loading' });
      } else if (s.kind === 'ok') {
        out.push({ id: m.id, label: m.label, kind: 'ok', ms: s.result.total_ms });
      } else {
        out.push({ id: m.id, label: m.label, kind: 'error', error: s.error });
      }
    }
    setGlobalMarkStatuses(out);
  });

  const toggle = (id: string) => {
    const next = new Set(enabled());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setEnabled(next);
    writeEnabled(next);
  };

  // Enrichments that some other producer (a synthesis mark/enrichment) lists as
  // a dependency. The worker resolves these unconditionally as part of the
  // consumer's run and renders them out of `deps_resolved` — so an independent
  // on/off here would be a lie: toggling it changes nothing the reader sees,
  // and re-running it standalone just duplicates work the consumer already does.
  // Such rows get a passive status glyph instead of a switch, and the auto-run
  // loop skips them. An enrichment that nothing consumes is genuinely
  // standalone — it keeps its real toggle.
  const dependencyFed = createMemo<Set<string>>(() => {
    const reg = registry();
    if (!reg) return new Set();
    const rev = reverseDependencyIndex(producerNodesFrom([...reg.marks, ...reg.enrichments]));
    const fed = new Set<string>();
    for (const e of reg.enrichments) {
      if ((rev.get(e.id)?.size ?? 0) > 0) fed.add(e.id);
    }
    return fed;
  });

  // Fire a run for any enabled mark or enrichment, on mount + on daf change.
  // untrack() around the runs() read + setRun() write so the effect doesn't
  // self-trigger on its own writes. The stamp (`tractate/page`) is stored on
  // every non-idle state so we can cheaply detect "already done for this
  // daf" and skip duplicate fires.
  /** Resolve callbacks ignore stale results — if the user navigated to a
   *  different daf while a job was in flight, the job's eventual success
   *  or failure (often a 180s timeout) MUST NOT overwrite the new daf's
   *  state. Without this guard, switching from Keritot 2a to Niddah 2a
   *  while Keritot's rabbi run was pending would, 180s later, paint
   *  Niddah's rabbi row as "failed" with the Keritot job's timeout
   *  message. Compare against `props.tractate/${props.page}` at
   *  resolve-time (reactive — reflects the current daf). */
  const currentStamp = () => `${props.tractate}/${props.page}/${lang()}`;

  createEffect(() => {
    const reg = registry();
    if (!reg) return;
    const on = enabled();
    // lang() is in the stamp so a language switch re-fires every enabled mark
    // and enrichment under the new lang (each run threads lang() into the
    // request + the worker's :he cache namespace). Without it, switching
    // EN↔HE left the previous language's mark output rendered until reload.
    const stamp = `${props.tractate}/${props.page}/${lang()}`;

    untrack(() => {
      for (const m of visibleMarks(reg)) {
        if (!on.has(m.id)) continue;
        const cur = runs()[m.id];
        if (cur && cur.kind !== 'idle' && cur.stamp === stamp) continue;
        setRun(m.id, { kind: 'loading', stamp });
        void runMark(m.id, props.tractate, props.page).then(
          (result) => { if (currentStamp() === stamp) setRun(m.id, { kind: 'ok', stamp, at: Date.now(), result }); },
          (err) => { if (currentStamp() === stamp) setRun(m.id, { kind: 'error', stamp, at: Date.now(), error: String((err as Error)?.message ?? err) }); },
        );
      }
      for (const e of reg.enrichments) {
        if (hiddenEnrichment(e.mark)) continue; // experimental mark, dev off
        if (dependencyFed().has(e.id)) continue; // produced via its consumer; no standalone run
        if (!on.has(e.id)) continue;
        const cur = runs()[e.id];
        if (cur && cur.kind !== 'idle' && cur.stamp === stamp) continue;
        setRun(e.id, { kind: 'loading', stamp });
        void runEnrichment(e.id, props.tractate, props.page).then(
          (result) => { if (currentStamp() === stamp) setRun(e.id, { kind: 'ok', stamp, at: Date.now(), result }); },
          (err) => { if (currentStamp() === stamp) setRun(e.id, { kind: 'error', stamp, at: Date.now(), error: String((err as Error)?.message ?? err) }); },
        );
      }
    });
  });

  /** Merge legacy seeds + worker-side marks (code + KV) + KV enrichments.
   *  Worker-side marks take priority over a same-id legacy seed (so a
   *  proper port replaces the legacy wrapper). */
  const rows = (): Row[] => {
    const reg = registry();
    const marks = visibleMarks(reg); // experimental marks gated to dev mode
    const portedIds = new Set(marks.map((m) => m.id));
    // Hide enrichments belonging to a hidden (experimental, non-dev) mark.
    const enrichments = (reg?.enrichments ?? []).filter((e) => !hiddenEnrichment(e.mark));
    const seeds: Row[] = props.seedMarks
      .filter((s) => !portedIds.has(s.id))
      .map((s) => ({ source: 'seed' as const, seed: s }));
    return [
      ...marks.map((d): Row => ({ source: 'mark', def: d })),
      ...seeds,
      ...enrichments.map((d): Row => ({ source: 'enrichment', def: d })),
    ];
  };

  /** Hierarchical grouping for the toggle list:
   *    - `top`: top-level rows (marks without a parent_mark, plus seeds).
   *    - `subMarksByParent`: marks whose `parent_mark` matches a top row's id.
   *      Rendered nested under the parent's expand section. Falls back to
   *      top-level if the named parent isn't in the registry.
   *    - `childrenByMark`: enrichments keyed by their target mark id.
   *      Orphan enrichments (no matching mark) fall under '__orphan__'.
   */
  type TopRow =
    | { source: 'seed'; seed: SeedMark }
    | { source: 'mark'; def: WorkerMarkDefinition };
  const grouped = (): {
    top: TopRow[];
    subMarksByParent: Map<string, WorkerMarkDefinition[]>;
    childrenByMark: Map<string, EnrichmentDefinition[]>;
  } => {
    const rs = rows();
    const top: TopRow[] = [];
    const subMarksByParent = new Map<string, WorkerMarkDefinition[]>();
    const childrenByMark = new Map<string, EnrichmentDefinition[]>();
    const markIds = new Set<string>();
    for (const r of rs) if (r.source === 'mark') markIds.add(r.def.id);
    for (const r of rs) {
      if (r.source === 'enrichment') {
        const targetId = r.def.mark ?? '__orphan__';
        const list = childrenByMark.get(targetId) ?? [];
        list.push(r.def);
        childrenByMark.set(targetId, list);
      } else if (r.source === 'mark') {
        const parent = r.def.parent_mark;
        if (parent && markIds.has(parent)) {
          const list = subMarksByParent.get(parent) ?? [];
          list.push(r.def);
          subMarksByParent.set(parent, list);
        } else {
          top.push({ source: 'mark', def: r.def });
        }
      } else {
        top.push({ source: 'seed', seed: r.seed });
      }
    }
    return { top, subMarksByParent, childrenByMark };
  };

  /** Aggregate run-state for a mark's enrichment children + its sub-marks'
   *  enrichments — for the "X done · Y pending" badge on the collapsed
   *  mark row. Recurses through one level of nesting (parent → sub-mark
   *  → its enrichments). */
  const childRunSummary = (markId: string): { loading: number; ok: number; error: number; total: number } => {
    const g = grouped();
    const kids: { id: string }[] = [...(g.childrenByMark.get(markId) ?? [])];
    for (const sub of g.subMarksByParent.get(markId) ?? []) {
      kids.push(sub);
      kids.push(...(g.childrenByMark.get(sub.id) ?? []));
    }
    // Drop dependency-fed enrichments: this panel never runs them standalone
    // (their producer is fired by the sidebar card), so they'd permanently
    // count as "pending" and under-report the badge. Sub-mark ids aren't in
    // the set, so they stay counted.
    const fed = dependencyFed();
    const runnable = kids.filter((k) => !fed.has(k.id));
    const summary = { loading: 0, ok: 0, error: 0, total: runnable.length };
    const r = runs();
    for (const k of runnable) {
      const st = r[k.id];
      if (st?.kind === 'loading') summary.loading++;
      else if (st?.kind === 'ok') summary.ok++;
      else if (st?.kind === 'error') summary.error++;
    }
    return summary;
  };

  const enabledCount = () => {
    let n = 0;
    for (const s of props.seedMarks) if (s.getValue()) n++;
    n += enabled().size;
    return n;
  };

  return (
    <>
      <div class="marks-registry-panel" style={{ 'margin-top': '0.5rem', 'font-size': '0.85rem' }}>
        <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'margin-bottom': '0.5rem' }}>
          <strong style={{ 'font-size': '0.9rem', color: '#222' }}>
            Marks
            <span style={{ color: '#888', 'margin-left': '0.5rem', 'font-size': '0.8rem', 'font-weight': 'normal' }}>
              ({rows().length}, {enabledCount()} on)
            </span>
          </strong>
        </div>

        <Show when={registry.error}>{(err) => (
          <div style={{ color: '#c00', 'font-family': 'monospace', 'font-size': '12px' }}>
            failed to load registry: {String(err())}
          </div>
        )}</Show>

        {/* Render a single Row (mark / seed / enrichment) with the
            on/off switch, status, re-run, etc. Used for both top-level marks
            and the nested enrichments. */}
        {(() => {
          const renderRow = (row: Row, nested: boolean): JSX.Element => {
            const id = () => row.source === 'seed' ? row.seed.id : row.def.id;
            const label = () => row.source === 'seed' ? row.seed.label : (row.def.label || row.def.id);
            const anchor = () => {
              if (row.source === 'seed') return row.seed.anchor;
              if (row.source === 'mark') return row.def.anchor;
              return row.def.mark ?? 'daf';
            };
            const render = () => {
              if (row.source === 'seed') return row.seed.render;
              if (row.source === 'mark') return row.def.render.kind;
              return 'inline';
            };
            const isOn = () => {
              if (row.source === 'seed') return row.seed.getValue();
              return enabled().has(row.def.id);
            };
            const state = () => {
              if (row.source === 'seed') return { kind: 'idle' } as RunState;
              return runs()[row.def.id] ?? { kind: 'idle' as const };
            };
            const isFail = () => state().kind === 'error';
            const setOn = (v: boolean) => {
              if (row.source === 'seed') row.seed.setValue(v);
              else toggle(row.def.id);
            };
            const isDraft = () =>
              (row.source === 'mark' || row.source === 'enrichment') && row.def.status === 'draft';
            // A dependency-fed enrichment is consumed by another producer (a
            // synthesis) and surfaced through that consumer's card, not run
            // standalone from this panel — so there's no independent on/off to
            // make. We deliberately do NOT paint a run-state here: the panel's
            // own runs() never holds these leaves (their producer is fired by
            // the sidebar card, invisibly to this panel), so any "produced/not"
            // light would be guessing. The marker just signals "derived, not a
            // switch"; the tooltip names where it comes from.
            const isDepFed = () => row.source === 'enrichment' && dependencyFed().has(row.def.id);
            const parentLabel = () => {
              if (row.source !== 'enrichment') return '';
              return registry()?.marks.find((m) => m.id === row.def.mark)?.label ?? row.def.mark;
            };
            const childCount = () => {
              if (row.source !== 'mark') return 0;
              const g = grouped();
              const enrichments = g.childrenByMark.get(row.def.id)?.length ?? 0;
              const subs = g.subMarksByParent.get(row.def.id) ?? [];
              let subEnrichments = 0;
              for (const s of subs) subEnrichments += g.childrenByMark.get(s.id)?.length ?? 0;
              return enrichments + subs.length + subEnrichments;
            };
            const isExpandable = () => row.source === 'mark' && childCount() > 0;
            const isExpanded = () => row.source === 'mark' && expandedMarks().has(row.def.id);
            const summary = () => row.source === 'mark' ? childRunSummary(row.def.id) : null;
            return (
              <li style={{
                'border-left': isFail() ? '2px solid #c00' : isDraft() ? '2px solid #fa0' : '2px solid transparent',
                'padding-left': nested ? '1.5rem' : '0.4rem',
              }}>
                <div style={{ display: 'flex', 'align-items': 'center', gap: '0.4rem' }}>
                  <Show when={isExpandable()} fallback={
                    <span style={{ display: 'inline-block', width: '0.9rem' }} />
                  }>
                    <button
                      type="button"
                      onClick={() => row.source === 'mark' && toggleExpanded(row.def.id)}
                      title={isExpanded() ? 'Collapse enrichments' : 'Expand enrichments'}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        padding: 0, width: '0.9rem', height: '0.9rem',
                        color: '#888', 'font-size': '0.7rem',
                        display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center',
                      }}
                    >{isExpanded() ? '▾' : '▸'}</button>
                  </Show>
                  <Show
                    when={!isDepFed()}
                    fallback={
                      // Passive marker, NOT a switch: a dimmed middot signals
                      // "derived from its mark's card" — no on/off choice here.
                      <span
                        aria-hidden="true"
                        title={`derived from the "${parentLabel()}" card (a synthesis consumes it) — not an independent toggle`}
                        style={{
                          width: '0.9rem', 'flex-shrink': 0, 'text-align': 'center',
                          color: '#cfcfcf', 'font-size': '0.7rem', 'line-height': 1,
                          cursor: 'default', 'user-select': 'none',
                        }}
                      >·</span>
                    }
                  >
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isOn()}
                      onClick={() => setOn(!isOn())}
                      title={isOn() ? 'turn off' : 'turn on'}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        padding: 0, width: '0.9rem', 'flex-shrink': 0,
                        color: isOn() ? '#15803d' : '#ccc', 'font-size': '0.7rem',
                        'line-height': 1,
                      }}
                    >{isOn() ? '●' : '○'}</button>
                  </Show>
                  <span style={{
                    'font-weight': nested ? 400 : 500, 'font-size': nested ? '0.8rem' : '0.85rem',
                    // Truncate on one line instead of wrapping: a long label that
                    // wraps flips between 1 and 2 lines as the status badge's width
                    // changes (spinner → "✓ 1234ms"), which reads as row jitter.
                    flex: 1, 'min-width': 0, 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis',
                  }} title={label()}>
                    {label()}
                  </span>
                  <span title={`anchored on ${anchor()} · rendered ${render()}`} style={{ color: '#aaa', 'font-size': '0.7rem', 'font-family': 'monospace', 'flex-shrink': 0 }}>
                    {anchor()[0]}/{String(render())[0]}
                  </span>
                  <Show when={row.source !== 'seed' && isOn() && !isDepFed()}>
                    <span style={{ 'font-size': '0.7rem', display: 'inline-flex', 'align-items': 'center', gap: '0.3rem', 'flex-shrink': 0, color: state().kind === 'error' ? '#c00' : state().kind === 'loading' ? '#888' : state().kind === 'ok' ? '#15803d' : '#aaa' }}>
                      <Show when={state().kind === 'loading'}>
                        <span style={{
                          display: 'inline-block', width: '0.65rem', height: '0.65rem',
                          'border-radius': '50%',
                          border: '2px solid #d6d3d1', 'border-top-color': '#8a2a2b',
                          animation: 'daf-spin 0.8s linear infinite',
                          'flex-shrink': 0,
                        }} />
                      </Show>
                      <Show when={state().kind === 'ok'}>
                        {(() => {
                          const res = () => (state() as Extract<RunState, { kind: 'ok' }>).result;
                          return (
                            <Show when={res().cache_hit} fallback={<span>✓ {res().elapsed_ms}ms</span>}>
                              <span style={{ 'font-size': '0.62rem', color: '#15803d', background: '#dcfce7', padding: '0 0.3rem', 'border-radius': '3px' }}>cached</span>
                              <span style={{ color: '#888' }}>{res().elapsed_ms}ms</span>
                            </Show>
                          );
                        })()}
                      </Show>
                      <Show when={state().kind === 'error'}>
                        <span>✗</span>
                      </Show>
                    </span>
                  </Show>
                  {/* Summary badge on collapsed mark rows showing enrichment progress */}
                  <Show when={row.source === 'mark' && !isExpanded() && childCount() > 0}>
                    <span style={{ 'font-size': '0.68rem', color: '#aaa', 'margin-left': '0.1rem', 'flex-shrink': 0, 'white-space': 'nowrap' }}>
                      {childCount()} enrich{childCount() === 1 ? '' : 'ments'}
                      <Show when={summary()!.loading > 0}> · {summary()!.loading}…</Show>
                      <Show when={summary()!.ok > 0}> · {summary()!.ok} done</Show>
                      <Show when={summary()!.error > 0}> · {summary()!.error} err</Show>
                    </span>
                  </Show>
                  <Show when={row.source !== 'seed' && isOn() && !isDepFed()}>
                    <button
                      onClick={() => {
                        if (row.source === 'seed') return;
                        const mid = row.def.id;
                        const stamp = `${props.tractate}/${props.page}`;
                        setRun(mid, { kind: 'loading', stamp });
                        const fn = row.source === 'mark' ? runMark : runEnrichment;
                        fn(mid, props.tractate, props.page, true).then(
                          (result) => { if (currentStamp() === stamp) setRun(mid, { kind: 'ok', stamp, at: Date.now(), result }); },
                          (err) => { if (currentStamp() === stamp) setRun(mid, { kind: 'error', stamp, at: Date.now(), error: String((err as Error)?.message ?? err) }); },
                        );
                      }}
                      title="Re-run (skip Gateway cache)"
                      disabled={state().kind === 'loading'}
                      style={{ 'margin-left': 'auto', padding: '1px 6px', 'font-size': '0.7rem', cursor: state().kind === 'loading' ? 'wait' : 'pointer', background: 'transparent', color: '#888', border: '1px solid #ddd', 'border-radius': '3px' }}
                    >
                      ↻
                    </button>
                  </Show>
                </div>
              </li>
            );
          };

          return (
            <ul style={{ 'list-style': 'none', padding: 0, margin: 0, display: 'flex', 'flex-direction': 'column', gap: '0.25rem' }}>
              <For each={grouped().top}>{(top) => {
                const topRow: Row = top.source === 'mark'
                  ? { source: 'mark', def: top.def }
                  : { source: 'seed', seed: top.seed };
                const markId = top.source === 'mark' ? top.def.id : null;
                const ownEnrichments = markId ? (grouped().childrenByMark.get(markId) ?? []) : [];
                const subMarks = markId ? (grouped().subMarksByParent.get(markId) ?? []) : [];
                const showKids = () => markId !== null && expandedMarks().has(markId);
                return (
                  <>
                    {renderRow(topRow, false)}
                    <Show when={showKids()}>
                      <For each={ownEnrichments}>{(e) => renderRow({ source: 'enrichment', def: e }, true)}</For>
                      <For each={subMarks}>{(sub) => {
                        const subEnrichments = grouped().childrenByMark.get(sub.id) ?? [];
                        // Gate the sub-mark's enrichments on the sub-mark's OWN
                        // chevron, not just the parent's. Without this the
                        // sub-mark chevron is a no-op (its enrichments showed
                        // unconditionally whenever the parent was expanded).
                        const showSubKids = () => expandedMarks().has(sub.id);
                        return (
                          <>
                            {renderRow({ source: 'mark', def: sub }, true)}
                            <Show when={showSubKids()}>
                              <For each={subEnrichments}>{(e) => renderRow({ source: 'enrichment', def: e }, true)}</For>
                            </Show>
                          </>
                        );
                      }}</For>
                    </Show>
                  </>
                );
              }}</For>
              {/* Orphan enrichments (target_mark not in registry) — rare. */}
              <Show when={(grouped().childrenByMark.get('__orphan__') ?? []).length > 0}>
                <li style={{ 'font-size': '0.7rem', color: '#aaa', 'padding-left': '0.4rem', 'margin-top': '0.4rem' }}>
                  Orphan enrichments (no matching mark in registry):
                </li>
                <For each={grouped().childrenByMark.get('__orphan__') ?? []}>{(e) =>
                  renderRow({ source: 'enrichment', def: e }, true)
                }</For>
              </Show>
            </ul>
          );
        })()}

        <div style={{ display: 'flex', gap: '0.4rem', 'margin-top': '0.4rem', 'flex-wrap': 'wrap' }}>
          <button
            onClick={() => refetchDefs()}
            title="Re-fetch the mark/enrichment definitions from the server (use after editing a def). Does not re-run anything."
            style={{ padding: '2px 8px', 'font-size': '0.7rem', cursor: 'pointer', background: 'transparent', border: '1px solid #ddd', 'border-radius': '3px', color: '#888' }}
          >
            reload defs
          </button>
          <button
            onClick={() => setRuns({})}
            title="Clear cached results so every mark re-fetches for this daf (cache-respecting). For a true bypass-cache re-run of one mark, use its ↻."
            style={{ padding: '2px 8px', 'font-size': '0.7rem', cursor: 'pointer', background: 'transparent', border: '1px solid #ddd', 'border-radius': '3px', color: '#888' }}
          >
            refresh results
          </button>
        </div>
      </div>
    </>
  );
}

export type { Row };
