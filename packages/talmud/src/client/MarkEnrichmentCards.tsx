/**
 * MarkEnrichmentCards — generic, mark-agnostic component that renders all
 * registered enrichments for a given mark instance.
 *
 * Architecture: pulls /api/enrichments, filters to entries whose
 * `mark` field matches the props.markId, then for each promoted enrichment
 * fires /api/run with `{ enrichment_id, tractate, page, mark_input
 * = props.instance }` and renders the parsed JSON output.
 *
 * Adding a new enrichment for a mark = drop a row into CODE_ENRICHMENTS
 * (worker/code-marks.ts) or save one via PUT /api/enrichments. The
 * sidebar picks it up automatically. No UI code changes per new
 * enrichment.
 *
 * Each enrichment renders as a collapsible card with status + content. The
 * card's body is rendered by a per-enrichment renderer if registered, or
 * falls back to a generic key/value dump of the parsed JSON.
 */

import { instanceIdOf } from '@corpus/core/cache/keys';
import {
  createEffect,
  createResource,
  createSignal,
  For,
  type JSX,
  onCleanup,
  Show,
  untrack,
} from 'solid-js';
import { devModeActive } from './DevModeShelf';
import {
  dafViewLoaded,
  dafViewPieceResult,
  dafViewVersion,
  dafViewWholeDafResult,
  isViewDriven,
} from './dafViewStore';
import { ErrorBadge } from './ErrorBadge';
import {
  isAbort,
  isServiceUnavailableError,
  PAUSED_ERROR,
  QUEUE_PRIORITY,
  RequestQueue,
  type RunResult,
  runCacheKey,
  runResultCache,
} from './enrichmentQueue';
import { lang, t } from './i18n';
import { requestInspect } from './inspectBridge';
import { HebraizedWithRabbis as Hebraized } from './rabbiLinks';
import { runProducer } from './runProducer';

// Single global "which card has the inspector open?" signal — keyed by the
// card's instanceKey. Only one drawer at a time across the whole page.
const [openInspectorKey, _setOpenInspectorKey] = createSignal<string | null>(null);
// Which leaf the open inspector is focused on (null = the synthesis aggregate).
// Module-level so a section card rendered OUTSIDE the owning MarkEnrichmentCards
// (e.g. a recipe's special block, like halacha's Codification) can open the
// drawer focused on its leaf.
const [inspectorView, _setInspectorView] = createSignal<string | null>(null);

/** Open the build inspector focused on `leafId` — the ENRICHMENT (the
 *  generation), e.g. 'argument.voices' / 'rabbi.relationships'. Focus that, not
 *  its parent mark, so the DAG shows the generation + its sub-enrichments rather
 *  than the raw source extraction. Routes to RunTreeDock (the old per-instance
 *  bottom drawer is retired). */
export function openInstanceInspector(instanceKey: string, leafId: string | null = null): void {
  requestInspect(leafId ?? instanceKey);
}

/** The small circular "i" affordance. Dev-mode only. Drop next to any section
 *  (a SectionCard label, a viz header) to open the inspector focused on that
 *  section's leaf. Highlights when its target is the one currently shown. */
export function InspectDot(props: {
  instanceKey: string;
  leafId?: string | null;
  title?: string;
  style?: JSX.CSSProperties;
}): JSX.Element {
  const active = () =>
    openInspectorKey() === props.instanceKey &&
    (inspectorView() ?? null) === (props.leafId ?? null);
  return (
    <Show when={devModeActive()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openInstanceInspector(props.instanceKey, props.leafId ?? null);
        }}
        title={props.title ?? 'Inspect this section'}
        aria-label={props.title ?? 'Inspect this section'}
        style={{
          width: '1.25rem',
          height: '1.25rem',
          padding: 0,
          cursor: 'pointer',
          background: active() ? '#000' : 'transparent',
          color: active() ? '#fff' : '#aaa',
          border: '1px solid #ddd',
          'border-radius': '50%',
          'font-size': '0.62rem',
          'font-family': 'ui-serif, Georgia, serif',
          'font-style': 'italic',
          'line-height': 1,
          'flex-shrink': 0,
          ...(props.style ?? {}),
        }}
      >
        i
      </button>
    </Show>
  );
}

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

type RunState =
  | { kind: 'idle' }
  | { kind: 'loading'; stamp: string }
  | { kind: 'ok'; stamp: string; result: RunResult }
  | { kind: 'error'; stamp: string; error: string };

async function fetchEnrichments(): Promise<EnrichmentDef[]> {
  const r = await fetch('/api/enrichments');
  if (!r.ok) return [];
  const j = (await r.json()) as { enrichments: EnrichmentDef[] };
  return j.enrichments;
}

// Cold-page syntheses (e.g. pesukim.synthesis) can run 60+ seconds end-to-end
// once their leaves + anchor marks queue behind other in-flight jobs. With
// client enrichmentQueue concurrency=4 and ~5–10 instances per page, the
// last card in line can wait ~3–5 min. 600s gives enough headroom that
// users don't see the synthesis card time out before the worker finishes.
const POLL_TIMEOUT_MS = 600_000;

// Short backoffs (ms) for retrying ONLY the initial POST when the edge returns
// a non-JSON error page (isolate recycled / OOM). One transient blip then
// self-heals instead of failing the card. Once a job is `pending`, polling
// takes over and is NOT retried here (it would re-enqueue generation).
const RUN_POST_BACKOFF_MS = [500, 1500];

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
  const inst = markInput as {
    name?: string;
    fields?: { id?: string; name?: string; verseRef?: string; topic?: string };
  } | null;
  const instanceTag =
    inst?.fields?.id ??
    inst?.fields?.name ??
    inst?.fields?.verseRef ??
    inst?.fields?.topic ??
    inst?.name ??
    '';
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
export async function runEnrichment(
  enrichmentId: string,
  tractate: string,
  page: string,
  markInput: unknown,
  instanceKey: string,
  signal?: AbortSignal,
): Promise<RunResult> {
  const { id, label } = enrichmentActivityKey(enrichmentId, tractate, page, markInput, instanceKey);
  // Delegate POST + poll + banner to the shared runProducer; this component keeps
  // only its fan-out concerns (the queue below, the result cache, per-card abort).
  // A couple of short POST retries cover a recycled-isolate edge page on a cold,
  // dense daf; the 10-min poll budget covers a slow cold generation.
  return runProducer(
    { enrichment_id: enrichmentId, tractate, page, mark_input: markInput, lang: lang() },
    {
      signal,
      postRetryBackoffs: RUN_POST_BACKOFF_MS,
      pollTimeoutMs: POLL_TIMEOUT_MS,
      activity: { id, label },
    },
  );
}

// On a WARM daf each run is a single KV read, so a high gate just fills cards
// faster. But on a COLD daf each in-flight slot triggers a fresh generation
// that loads the daf's heavy source slices (the rishonim commentary bundle is
// several MB on a dense daf) into the SHARED Cloudflare isolate. At 16 those
// concurrent loads blew the hard 128 MB per-isolate memory limit — the isolate
// was killed and every in-flight card got `error code: 1101`. 6 keeps warm-daf
// fill snappy (a viewport rarely shows >6 cards needing fetch) while cutting
// the cold-daf memory pressure well under the limit; the server now also
// coalesces same-daf slice loads, so concurrent runs share one copy instead
// of N.
const enrichmentQueue = new RequestQueue(6);

/**
 * Enqueue one enrichment run on the shared queue from OUTSIDE this component
 * (e.g. the daf-load prefetcher). Same queue + same activity tracking the
 * cards use, so prefetch and user-triggered work share one concurrency budget
 * and warm the same server-side cache — a later card mount for the same
 * (enrichment, instance) gets a fast KV hit instead of a cold generation.
 * Enqueued at LOW priority so a user opening an anchor always drains ahead of
 * speculative prefetch work.
 */
export function enqueueEnrichmentRun(
  enrichmentId: string,
  tractate: string,
  page: string,
  instance: unknown,
  instanceKey: string,
  signal?: AbortSignal,
): Promise<RunResult> {
  const { id, label } = enrichmentActivityKey(enrichmentId, tractate, page, instance, instanceKey);
  return enrichmentQueue.enqueue(
    id,
    label,
    (sig) => runEnrichment(enrichmentId, tractate, page, instance, instanceKey, sig),
    signal,
    QUEUE_PRIORITY.low,
  );
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
  /** Fired with the aggregate's `deps_resolved` + `anchors_resolved` once
   *  the synthesis run lands. Lets the parent sidebar render mark-specific
   *  UI (e.g. argument subsection pills) from the same fetch that produced
   *  the synthesis paragraph — no duplicate `/api/run` call.
   *  `deps_resolved` keys are enrichment ids; `anchors_resolved` keys are
   *  mark ids. Either may be undefined. */
  onResolved?: (resolved: {
    deps_resolved?: Record<string, unknown>;
    anchors_resolved?: Record<string, unknown>;
  }) => void;
}

// Pluggable per-mark renderers for the primary (aggregate) card body. When a
// mark registers one, its parsed JSON is rendered by that component instead of
// the generic ParsedFieldView — the seam for bespoke layouts (e.g. the Tidbit
// essay) without each mark reimplementing the run/cache/poll plumbing. Bodies
// register from their own module at import time (no circular dependency: this
// file never imports them back).
export type EnrichmentRenderer = (parsed: Record<string, unknown>) => JSX.Element;
const MARK_RENDERERS: Record<string, EnrichmentRenderer> = {};
export function registerMarkRenderer(markId: string, render: EnrichmentRenderer): void {
  MARK_RENDERERS[markId] = render;
}

export default function MarkEnrichmentCards(props: Props) {
  const [defs] = createResource(fetchEnrichments);
  const [runs, setRuns] = createSignal<Record<string, RunState>>({});

  const setRun = (id: string, state: RunState) => setRuns((cur) => ({ ...cur, [id]: state }));

  // Is THIS instance's inspector open, and which leaf is it focused on? Reads
  // the module-level signals so section cards (which live outside this
  // component) can drive the drawer. inspectorSelectedId() is null when the
  // synthesis is shown.
  const isInspectorOpen = () => openInspectorKey() === props.instanceKey;
  const inspectorSelectedId = () => (isInspectorOpen() ? inspectorView() : null);

  const allMatching = () =>
    (defs() ?? []).filter((d) => d.mark === props.markId && d.status !== 'draft');
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
  // The card body + auto-fire always track the PRIMARY (synthesis) view. The
  // inspector's leaf selection is independent (it fetches the leaf on demand),
  // so opening a section's inspector never mutates the synthesis card.
  const matching = () => primary();

  // lang() is part of the stamp so a language switch re-runs the auto-fire
  // effect below and re-fetches the card under the new lang (the worker keys
  // its cache per-lang too). Without it, switching EN↔HE left the old
  // language's text rendered until a full reload.
  const stamp = () => `${props.tractate}/${props.page}/${props.instanceKey}/${lang()}`;

  // Apply a finished result to this card's run state: set the run `ok`, fan
  // out the aggregate's resolved deps to per-leaf run state, and forward
  // deps/anchors to the parent sidebar. Shared by the cache-hit and
  // fresh-fetch paths so both behave identically.
  const applyResult = (d: EnrichmentDef, s: string, result: RunResult) => {
    if (stamp() !== s) return;
    setRun(d.id, { kind: 'ok', stamp: s, result });
    // For aggregate enrichments: server returns each dep's parsed output in
    // `deps_resolved` (enrichments) and `anchors_resolved` (marks). Populate
    // per-leaf run state so the dev dropdown can render leaves instantly
    // without a second /api/run call. Forward both maps to onResolved
    // so parent sidebars can render mark-specific UI from the same data.
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
  };

  // Auto-fire each enrichment on mount + when the daf or instance changes.
  // Order of operations per def:
  //   1. Client-cache hit → apply synchronously, no spinner, no queue slot.
  //   2. Already-ok for this exact stamp → skip.
  //   3. Otherwise enqueue a fetch on the shared `enrichmentQueue`.
  // A per-run AbortController is aborted on cleanup (stamp change / unmount)
  // so a closed sidebar or switched anchor frees its concurrency slot
  // immediately instead of polling a pending job for up to 600s.
  //
  // Priority: the synthesis a user just opened jumps ahead of background
  // prefetch (LOW). The exception is `argument-move` cards — an argument
  // mounts 15-40 of them, scroll-deferred, so they're NORMAL (still above
  // prefetch, but they don't starve the primary synthesis or another anchor
  // the user opens next).
  const cardPriority =
    props.markId === 'argument-move' ? QUEUE_PRIORITY.normal : QUEUE_PRIORITY.high;

  // Stale-while-revalidate follow-up. The server serves the PREVIOUS
  // cache_version (tagged `refreshing`) on a version-bump miss while the new one
  // recomputes in the enrichment-jobs queue. We show that stale value
  // immediately, then re-fetch on a short backoff to swap in the fresh version
  // the moment it lands — no reload needed. Bounded attempts: if the recompute
  // never lands (budget paused → server keeps serving stale), we stop and leave
  // the stale value shown; a later reload or re-warm fills it. Timers are tied
  // to the effect's AbortController so a daf/anchor change cancels them.
  const REFRESH_BACKOFF_MS = [4000, 8000, 16000];
  const scheduleRefresh = (
    d: EnrichmentDef,
    s: string,
    curLang: string,
    controller: AbortController,
    attempt: number,
  ) => {
    if (attempt >= REFRESH_BACKOFF_MS.length) return;
    if (controller.signal.aborted || stamp() !== s) return;
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => clearTimeout(timer);
    timer = setTimeout(() => {
      controller.signal.removeEventListener('abort', onAbort);
      if (controller.signal.aborted || stamp() !== s) return;
      const { id: actId, label: actLabel } = enrichmentActivityKey(
        d.id,
        props.tractate,
        props.page,
        props.instance,
        props.instanceKey,
      );
      void enrichmentQueue
        .enqueue(
          actId,
          actLabel,
          (sig) =>
            runEnrichment(d.id, props.tractate, props.page, props.instance, props.instanceKey, sig),
          controller.signal,
          cardPriority,
        )
        .then(
          (result) => {
            if (stamp() !== s) return;
            if (result.refreshing) {
              scheduleRefresh(d, s, curLang, controller, attempt + 1);
              return;
            }
            runResultCache.set(
              runCacheKey(d.id, props.tractate, props.page, props.instanceKey, curLang),
              result,
            );
            applyResult(d, s, result);
          },
          // Aborted / superseded / transient error — keep the stale value visible.
          () => {},
        );
    }, REFRESH_BACKOFF_MS[attempt]);
    controller.signal.addEventListener('abort', onAbort, { once: true });
  };

  // Server instance id (the `instanceIdOf` hash the daf-view stores per-instance
  // pieces under) for THIS card's instance. Computed async (recomputed if the
  // instance changes); '' on the rare hash error so the gate below still
  // resolves and the card fetches. `undefined` = not settled yet.
  const [instIid, setInstIid] = createSignal<string | undefined>(undefined);
  createEffect(() => {
    const inst = props.instance;
    setInstIid(undefined);
    void instanceIdOf(inst).then(setInstIid, () => setInstIid(''));
  });

  createEffect(() => {
    const list = matching();
    if (list.length === 0) return;
    const s = stamp();
    // Capture lang at fire time so the async cache-write below keys under the
    // language the request was actually fired with (not whatever lang is active
    // when the promise resolves, which may have flipped mid-flight).
    const curLang = lang();
    // Tracked reads (outside untrack) so this effect re-runs when the daf-view
    // loads or the instance-id hash settles — that's what lets per-instance
    // cards render from the view instead of fetching.
    const iid = instIid();
    const viewReady = dafViewLoaded(props.tractate, props.page, curLang);
    // Tracked reads: re-run as the cold-generation poll fills the view in
    // (dafViewVersion bumps per poll), and when view-driven mode flips off (the
    // daf finished / stalled / timed out) so we then fall through and fetch any
    // straggler. On a cold daf we render entirely from the Workflow + poll.
    dafViewVersion();
    const viewDriven = isViewDriven(props.tractate, props.page, curLang);
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    untrack(() => {
      for (const d of list) {
        const cached = runResultCache.get(
          runCacheKey(d.id, props.tractate, props.page, props.instanceKey, curLang),
        );
        if (cached) {
          applyResult(d, s, cached);
          continue;
        }
        // Wait for the materialized daf-view to settle before firing /api/run.
        // It's ONE fetch that serves every cached piece; firing per-card before
        // it lands just races it and wastes a request (the warm-daf fan-out the
        // view was meant to eliminate). This effect re-runs when the view settles
        // (viewReady is a tracked read above). Fail-safe: loadDafView ALWAYS
        // settles (empty on failure), so a hit becomes possible OR we fall
        // through and fetch as before — the gate never hangs.
        if (!viewReady) continue;
        // Second tier: the materialized daf-view (one fetch on daf open). Serves
        // WHOLE-DAF pieces (keyed by producer id) so they render without their
        // own /api/run. Best-effort + guaranteed-correct key — a miss (a
        // per-instance piece) just falls through to the per-instance tier below.
        const fromView = dafViewWholeDafResult(d.id, props.tractate, props.page, curLang);
        if (fromView) {
          runResultCache.set(
            runCacheKey(d.id, props.tractate, props.page, props.instanceKey, curLang),
            fromView,
          );
          applyResult(d, s, fromView);
          continue;
        }
        // Third tier: PER-INSTANCE daf-view pieces (keyed producerId::instanceId).
        // The view is loaded here (gated above), so a hit is possible — gate on
        // the instanceId hash: if it hasn't settled, wait (this effect re-runs
        // when it does) rather than fetch-then-miss. The hash settles in ~1ms, so
        // the gate is imperceptible. Fail-safe: any miss falls through to fetch.
        if (iid === undefined) continue; // hash not settled yet — re-runs on settle
        const fromInstance = iid
          ? dafViewPieceResult(d.id, iid, props.tractate, props.page, curLang)
          : undefined;
        if (fromInstance) {
          runResultCache.set(
            runCacheKey(d.id, props.tractate, props.page, props.instanceKey, curLang),
            fromInstance,
          );
          applyResult(d, s, fromInstance);
          continue;
        }
        // Cold daf, view-driven: the parallel Workflow is generating every piece
        // (POST /api/daf-generate) and the poll fills the view in. WAIT for it
        // rather than firing our own /api/run — that's the no-fan-out cutover.
        // Show a loading state meanwhile. When generation settles (complete /
        // stalled / timed out) viewDriven flips off and this effect re-runs and
        // falls through to fetch any straggler. (viewDriven is a tracked read.)
        if (viewDriven) {
          const prev = runs()[d.id];
          if (!prev || prev.kind === 'idle') setRun(d.id, { kind: 'loading', stamp: s });
          continue;
        }
        const cur = runs()[d.id];
        if (cur && cur.kind !== 'idle' && cur.stamp === s) continue;
        setRun(d.id, { kind: 'loading', stamp: s });
        const { id: actId, label: actLabel } = enrichmentActivityKey(
          d.id,
          props.tractate,
          props.page,
          props.instance,
          props.instanceKey,
        );
        void enrichmentQueue
          .enqueue(
            actId,
            actLabel,
            (sig) =>
              runEnrichment(
                d.id,
                props.tractate,
                props.page,
                props.instance,
                props.instanceKey,
                sig,
              ),
            controller.signal,
            cardPriority,
          )
          .then(
            (result) => {
              // A `refreshing` result is the stale previous version (SWR). Show it,
              // but don't persist it (it would pin the stale value in the run
              // cache); instead re-fetch shortly to pick up the fresh version.
              if (result.refreshing) {
                applyResult(d, s, result);
                scheduleRefresh(d, s, curLang, controller, 0);
                return;
              }
              runResultCache.set(
                runCacheKey(d.id, props.tractate, props.page, props.instanceKey, curLang),
                result,
              );
              applyResult(d, s, result);
            },
            (err) => {
              // Aborted (sidebar closed / anchor switched) or superseded — leave
              // the run state alone; a fresh effect run owns the current stamp.
              if (isAbort(err) || stamp() !== s) return;
              setRun(d.id, {
                kind: 'error',
                stamp: s,
                error: String((err as Error)?.message ?? err),
              });
            },
          );
      }
    });
  });

  // The synthesis/aggregate view — what the sidebar card always shows.
  const primaryView = (): EnrichmentDef | null => {
    const a = aggregates();
    if (a.length > 0) return a[0];
    const l = leaves();
    return l.length > 0 ? l[0] : null;
  };
  const primaryRun = (): RunState => runs()[primaryView()?.id ?? ''] ?? { kind: 'idle' };

  // The inspector's focal view — follows its leaf selection, else the primary.
  const currentView = (): EnrichmentDef | null => {
    const sel = inspectorSelectedId();
    if (sel) return allMatching().find((d) => d.id === sel) ?? null;
    return primaryView();
  };

  // When a leaf is selected in the inspector, make sure we have its FULL run
  // (prompt + telemetry). Leaves fanned out from the aggregate's deps_resolved
  // carry only content — no `resolved` — so fetch the leaf directly. The worker
  // cached it under its own key during dep resolution (with the same
  // mark_input), so this is a cache hit, not a fresh LLM call. Fetched in the
  // background so the visible content doesn't flicker to a spinner.
  createEffect(() => {
    const id = inspectorSelectedId();
    if (!id) return;
    const def = untrack(() => allMatching().find((d) => d.id === id));
    if (!def) return;
    const cur = untrack(() => runs()[id]);
    if (cur?.kind === 'loading') return;
    if (cur?.kind === 'ok' && cur.result.resolved) return; // already have prompts
    const s = stamp();
    const curLang = lang();
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    const { id: actId, label: actLabel } = enrichmentActivityKey(
      id,
      props.tractate,
      props.page,
      props.instance,
      props.instanceKey,
    );
    void enrichmentQueue
      .enqueue(
        actId,
        actLabel,
        (sig) =>
          runEnrichment(id, props.tractate, props.page, props.instance, props.instanceKey, sig),
        controller.signal,
        QUEUE_PRIORITY.high,
      )
      .then(
        (result) => {
          // Don't pin a stale SWR value in the cache (see the auto-fire path).
          if (!result.refreshing) {
            runResultCache.set(
              runCacheKey(id, props.tractate, props.page, props.instanceKey, curLang),
              result,
            );
          }
          if (stamp() === s) setRun(id, { kind: 'ok', stamp: s, result });
        },
        (err) => {
          if (!isAbort(err) && stamp() === s) {
            /* keep synthetic content; inspection just lacks prompts */
          }
        },
      );
  });

  // Source TEXTS that fed the inspector's current view (gemara / commentaries /
  // mishna / halacha-refs / yerushalmi-text / aggregated context). Fetched on
  // demand from the read-only /api/run-sources companion — deliberately NOT a
  // field on the cached RunResult, since the texts are KB-scale and only the dev
  // inspector wants them (every reader's card fetch would otherwise carry them).
  // Re-fetches when the focal view changes; null while loading or closed.
  const [_inspectorSources, setInspectorSources] = createSignal<Record<
    string,
    { chars: number; content: string }
  > | null>(null);
  createEffect(() => {
    if (!(devModeActive() && isInspectorOpen())) {
      setInspectorSources(null);
      return;
    }
    const view = currentView();
    if (!view) {
      setInspectorSources(null);
      return;
    }
    const curLang = lang();
    const inst = props.instance;
    const tractate = props.tractate;
    const page = props.page;
    setInspectorSources(null); // show "loading" on a view switch
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    void fetch('/api/run-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enrichment_id: view.id,
        tractate,
        page,
        mark_input: inst,
        lang: curLang,
      }),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (controller.signal.aborted) return;
        const sources =
          j && typeof j === 'object' && 'sources' in j
            ? (j as { sources: Record<string, { chars: number; content: string }> }).sources
            : {};
        setInspectorSources(sources);
      })
      .catch(() => {
        /* inspector just shows no sources */
      });
  });

  // Loading copy: pick something evocative based on what's being worked on.
  const loadingCopy = (): string => {
    if (props.markId === 'rabbi') {
      const inst = props.instance as { name?: string } | null;
      return inst?.name ? t('loading.rabbi.named', { name: inst.name }) : t('loading.rabbi');
    }
    if (props.markId === 'argument') {
      const inst = props.instance as { fields?: { title?: string } } | null;
      const title = inst?.fields?.title;
      return title ? t('loading.argument.named', { title }) : t('loading.argument');
    }
    if (props.markId === 'argument-move') {
      const inst = props.instance as { fields?: { voice?: string } } | null;
      const voice = inst?.fields?.voice;
      return voice ? t('loading.move.named', { voice }) : t('loading.move');
    }
    if (props.markId === 'halacha') {
      const inst = props.instance as { fields?: { title?: string; topic?: string } } | null;
      const title = inst?.fields?.title ?? inst?.fields?.topic;
      return title ? t('loading.halacha.named', { title }) : t('loading.halacha');
    }
    if (props.markId === 'aggadata') {
      const inst = props.instance as { fields?: { title?: string } } | null;
      const title = inst?.fields?.title;
      return title ? t('loading.aggadata.named', { title }) : t('loading.aggadata');
    }
    if (props.markId === 'pesukim') {
      const inst = props.instance as { fields?: { verseRef?: string } } | null;
      const ref = inst?.fields?.verseRef;
      return ref ? t('loading.pesukim.named', { ref }) : t('loading.pesukim');
    }
    if (props.markId === 'places') {
      const inst = props.instance as { fields?: { name?: string } } | null;
      const name = inst?.fields?.name;
      return name ? t('loading.places.named', { name }) : t('loading.places');
    }
    if (props.markId === 'rishonim') {
      return t('loading.rishonim');
    }
    if (props.markId === 'tidbit') {
      return t('loading.tidbit');
    }
    if (props.markId === 'biyun') {
      return t('loading.biyun');
    }
    return t('loading.default');
  };

  // Body renderer for a given run: loading state, error, or the content
  // paragraph (Hebraized + parsed JSON aware). The card renders the primary
  // run; the inspector renders its selected view's run.
  const renderRunBody = (r: RunState): JSX.Element => {
    if (r.kind === 'loading' || r.kind === 'idle') {
      return (
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '0.6rem',
            padding: '0.7rem 0.2rem',
            color: '#666',
            'font-size': '0.88rem',
            'font-style': 'italic',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: '0.85rem',
              height: '0.85rem',
              'border-radius': '50%',
              border: '2px solid #d6d3d1',
              'border-top-color': '#8a2a2b',
              animation: 'daf-spin 0.8s linear infinite',
              'flex-shrink': 0,
            }}
          />
          {loadingCopy()}
        </div>
      );
    }
    if (r.kind === 'error') {
      const paused = r.error === PAUSED_ERROR;
      const unavailable = !paused && isServiceUnavailableError(r.error);
      // Both paused and provider-outage are calm, expected states (amber); a
      // genuine bug (parse/schema/unknown) is loud (red). Either way the failure
      // shows as a compact badge — not a block of text shoved into the reading
      // flow — with the full message revealed on hover/focus (ErrorBadge).
      const calm = paused || unavailable;
      return (
        <div style={{ padding: '0.3rem 0' }}>
          <ErrorBadge
            tone={calm ? 'calm' : 'error'}
            label={
              paused
                ? t('enrich.badge.paused')
                : unavailable
                  ? t('enrich.badge.unavailable')
                  : t('enrich.badge.failed')
            }
            detail={
              paused ? t('qa.error.paused') : unavailable ? t('enrich.error.unavailable') : r.error
            }
          />
        </div>
      );
    }
    const result = r.result;
    if (result.parsed && typeof result.parsed === 'object') {
      const parsed = result.parsed as Record<string, unknown>;
      const custom = MARK_RENDERERS[props.markId];
      if (custom) return custom(parsed);
      return <ParsedFieldView parsed={parsed} />;
    }
    return (
      <p style={{ margin: 0, 'font-size': '0.92rem', 'line-height': 1.6, color: '#222' }}>
        <Hebraized text={result.content} />
      </p>
    );
  };
  const renderCardBody = (): JSX.Element => renderRunBody(primaryRun());

  const openInspector = (e?: MouseEvent) => {
    // Cards may live inside an outer click-target (e.g. ArgumentMoveCard's
    // toggleHighlight wrapper). Stop propagation so the inspector affordance
    // doesn't double as a highlight toggle.
    if (e) e.stopPropagation();
    // The card's own (i) inspects this card's GENERATION — its aggregate
    // (synthesis) enrichment, at THIS instance — so the DAG shows the synthesis
    // breaking down into its sub-enrichments, with the real cached output.
    requestInspect(aggregates()[0]?.id ?? props.markId, props.instance);
  };

  // Sidebar card: production view in all modes — clean synthesis output in
  // a subtle container. The dev-mode 'i' affordance overlays the top-right
  // and opens the InstanceInspectorShelf bottom drawer with leaf-walk
  // controls, prompts, and telemetry.
  return (
    <div
      style={{
        position: 'relative',
        background: '#fafafa',
        border: '1px solid #eee',
        'border-radius': '6px',
        padding: '0.85rem 1rem',
      }}
    >
      {renderCardBody()}
      <Show
        when={(() => {
          const r = primaryRun();
          return r.kind === 'ok' && r.result.refreshing;
        })()}
      >
        {/* Stale-while-revalidate: the value above is the previous version,
            served while the new one recomputes. scheduleRefresh swaps it in. */}
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '0.4rem',
            'margin-top': '0.5rem',
            color: '#a16207',
            'font-size': '0.72rem',
            'font-style': 'italic',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: '0.6rem',
              height: '0.6rem',
              'border-radius': '50%',
              border: '2px solid #e7d9b0',
              'border-top-color': '#a16207',
              animation: 'daf-spin 0.8s linear infinite',
              'flex-shrink': 0,
            }}
          />
          {t('enrichment.updating')}
        </div>
      </Show>
      <Show when={devModeActive()}>
        <button
          type="button"
          onClick={openInspector}
          title="Inspect this synthesis"
          aria-label="Inspect this synthesis"
          style={{
            position: 'absolute',
            top: '0.35rem',
            right: '0.35rem',
            width: '1.4rem',
            height: '1.4rem',
            padding: 0,
            cursor: 'pointer',
            background:
              isInspectorOpen() && inspectorSelectedId() === null ? '#000' : 'transparent',
            color: isInspectorOpen() && inspectorSelectedId() === null ? '#fff' : '#888',
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
  const headKey = HEAD_KEYS.find(
    (k) => typeof obj[k] === 'string' && (obj[k] as string).length > 0,
  );
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
        <Show
          when={headKey === 'excerpt'}
          fallback={
            <span style={{ 'font-weight': 500 }}>
              <Hebraized text={head as string} />
            </span>
          }
        >
          <span dir="rtl" lang="he" style={{ 'font-family': '"Mekorot Vilna", serif' }}>
            {head}
          </span>
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
                <Show when={typeof val === 'string'} fallback={JSON.stringify(val)}>
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
  const entries = () =>
    Object.entries(props.parsed).filter(
      ([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0),
    );
  // When the schema has only ONE string field (e.g. rabbi.bio's `bio`), drop
  // the section header and render the text as a clean paragraph. Multi-field
  // schemas keep the per-field labels for clarity.
  const isSingleString = () => {
    const e = entries();
    return e.length === 1 && typeof e[0][1] === 'string';
  };

  return (
    <Show
      when={isSingleString()}
      fallback={
        <div style={{ 'font-size': '0.88rem', 'line-height': 1.55, color: '#222' }}>
          <For each={entries()}>
            {([key, value]) => {
              const isHe = key.endsWith('_he') || key.includes('quote_he');
              const label = key.replace(/_/g, ' ').replace(/\b\w/, (m) => m.toUpperCase());
              if (typeof value === 'string') {
                return (
                  <div style={{ 'margin-bottom': '0.7rem' }}>
                    <div
                      style={{
                        'font-size': '0.7rem',
                        color: '#888',
                        'margin-bottom': '0.15rem',
                        'font-weight': 500,
                      }}
                    >
                      {label}
                    </div>
                    <Show
                      when={isHe}
                      fallback={
                        <p style={{ margin: 0 }}>
                          <Hebraized text={value} />
                        </p>
                      }
                    >
                      <p
                        dir="rtl"
                        lang="he"
                        style={{
                          margin: 0,
                          'font-family': '"Mekorot Vilna", serif',
                          'font-size': '1rem',
                          color: '#222',
                        }}
                      >
                        {value}
                      </p>
                    </Show>
                  </div>
                );
              }
              if (Array.isArray(value)) {
                return (
                  <div style={{ 'margin-bottom': '0.7rem' }}>
                    <div
                      style={{
                        'font-size': '0.7rem',
                        color: '#888',
                        'margin-bottom': '0.15rem',
                        'font-weight': 500,
                      }}
                    >
                      {label}
                    </div>
                    <ul style={{ margin: 0, 'padding-left': '1rem' }}>
                      <For each={value}>
                        {(v) => (
                          <li>
                            <ArrayItem item={v} />
                          </li>
                        )}
                      </For>
                    </ul>
                  </div>
                );
              }
              return null;
            }}
          </For>
        </div>
      }
    >
      <p style={{ margin: 0, 'font-size': '0.92rem', 'line-height': 1.6, color: '#222' }}>
        <Hebraized text={String(entries()[0][1])} />
      </p>
    </Show>
  );
}
