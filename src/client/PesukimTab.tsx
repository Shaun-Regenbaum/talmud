/**
 * Pesukim tab in EnrichmentPage. Daf-scoped. First-pass loads
 * /api/pesukim/:t/:p (verse citations on the daf). Five strategies layer
 * tanach-context / peshat / gemara-usage / exegesis / synthesize, slicing
 * per-pasuk into each card's "individual strategies" expansion.
 */
import { createEffect, createResource, createSignal, For, Show, type JSX } from 'solid-js';
import { StrategyRow } from './StrategyRow';
import { Hebraized } from './Hebraized';
import { anchorMatches } from './DafTextPanel';
import { ProvenanceBadge } from './ProvenanceBadge';
import { EnrichmentToggle } from './EnrichmentToggle';

interface Pasuk {
  verseRef: string;
  verseHe?: string;
  citationMarker?: string;
  citationStyle?: string;
  excerpt: string;
  endExcerpt?: string;
  startSegIdx?: number;
  endSegIdx?: number;
  summary: string;
  tanachContext?: unknown;
  peshat?: unknown;
  gemaraUsage?: unknown;
  exegesis?: unknown;
  synthesize?: unknown;
}

interface PesukimResult {
  pesukim: Pasuk[];
  _cached?: boolean;
}

const STRATEGIES = [
  { id: 'tanach-context', label: 'Tanach context', desc: 'Surrounding verses + parashah context for the cited pasuk.' },
  { id: 'peshat',         label: 'Peshat',         desc: 'Plain-meaning reading of the verse.' },
  { id: 'gemara-usage',   label: 'Gemara usage',   desc: 'How this verse is used in the sugya — derash / proof / allusion.' },
  { id: 'exegesis',       label: 'Exegesis',       desc: 'Hermeneutical move(s) by the Gemara on this verse.' },
  { id: 'synthesize',     label: 'Synthesize',     desc: 'One-paragraph synthesis combining the other strategies.' },
] as const;

function sliceForPasuk(strategy: string, p: Pasuk | undefined): unknown {
  if (!p) return null;
  switch (strategy) {
    case 'tanach-context': return p.tanachContext ?? null;
    case 'peshat':         return p.peshat ?? null;
    case 'gemara-usage':   return p.gemaraUsage ?? null;
    case 'exegesis':       return p.exegesis ?? null;
    case 'synthesize':     return p.synthesize ?? null;
    default: return null;
  }
}

export function PesukimTab(props: {
  tractate: string;
  page: string;
  loadKey: number;
  refreshNonce?: number;
  onReloadSkeleton?: () => void;
  selectedSegment?: number | null;
  setSelectedSegment?: (n: number | null) => void;
}): JSX.Element {
  const dafKey = () => `${props.tractate}|${props.page}|${props.loadKey}|${props.refreshNonce ?? 0}`;
  // Resource swallows fetch errors and returns null instead of throwing.
  // Throwing here would propagate through every consumer that calls
  // pesukim() (createEffect, runStrategy, preload effect) as an uncaught
  // promise rejection — Solid's resource accessor re-raises stored errors.
  // Logging keeps the failure visible without breaking the tab.
  const [pesukim, { mutate, refetch }] = createResource(dafKey, async (): Promise<PesukimResult | null> => {
    if (props.loadKey === 0) return null;
    const refresh = (props.refreshNonce ?? 0) > 0 ? '?refresh=1' : '';
    try {
      const res = await fetch(`/api/pesukim/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}${refresh}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string; attempts?: string[]; detail?: string } | null;
        // Surface the per-model attempt reasons (the worker tries each LLM
        // and stuffs each failure into `attempts`) plus any detail field —
        // otherwise we just see the generic top-level error.
        // eslint-disable-next-line no-console
        console.warn(
          '[pesukim] HTTP', res.status,
          body?.error ?? '',
          body?.attempts ? `· attempts: ${body.attempts.join(' | ')}` : '',
          body?.detail ?? '',
        );
        return null;
      }
      return res.json();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[pesukim]', err);
      return null;
    }
  });

  const [running, setRunning] = createSignal<Partial<Record<string, boolean>>>({});
  const [errors, setErrors] = createSignal<Partial<Record<string, string>>>({});
  const [included, setIncluded] = createSignal<Set<string>>(new Set());

  // Phase B preload — fold cached strategies into the verses on load. Also
  // returns whether `synthesize` was already cached so Phase E knows whether
  // to auto-fire on first load.
  let synthesizeWasCached = false;
  createResource(dafKey, async () => {
    if (props.loadKey === 0) return null;
    try {
      const res = await fetch(`/api/enrich-cached-daf/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}`);
      if (!res.ok) return null;
      const snap = await res.json() as { pesukim?: { perStrategy?: Record<string, { pesukim?: Pasuk[] } | null> } };
      const cached = snap.pesukim?.perStrategy ?? {};
      synthesizeWasCached = Boolean(cached['synthesize']);
      const current = pesukim();
      if (!current) return null;
      const byRef = new Map<string, Pasuk>();
      for (const p of current.pesukim) byRef.set(p.verseRef.toLowerCase(), { ...p });
      for (const [, data] of Object.entries(cached)) {
        if (!data?.pesukim) continue;
        for (const p of data.pesukim) {
          const ex = byRef.get(p.verseRef.toLowerCase());
          if (!ex) continue;
          if (p.tanachContext !== undefined) ex.tanachContext = p.tanachContext;
          if (p.peshat !== undefined)        ex.peshat        = p.peshat;
          if (p.gemaraUsage !== undefined)   ex.gemaraUsage   = p.gemaraUsage;
          if (p.exegesis !== undefined)      ex.exegesis      = p.exegesis;
          if (p.synthesize !== undefined)    ex.synthesize    = p.synthesize;
        }
      }
      mutate({ ...current, pesukim: [...byRef.values()] });
    } catch { /* skip */ }
    return null;
  });

  // Auto-fire synthesize once first-pass identifies the pesukim, unless it
  // was already cached. Defaults the include set to whatever's already
  // cached so the synthesis reflects existing context out of the box.
  createEffect(() => {
    const p = pesukim();
    if (!p || p.pesukim.length === 0) return;
    if (synthesizeWasCached) return;
    if (running()['pesukim:synthesize']) return;
    if (p.pesukim.some((x) => x.synthesize !== undefined)) return;
    const defaultIncluded = STRATEGIES
      .filter((s) => s.id !== 'synthesize')
      .filter((s) => p.pesukim.some((px) => sliceForPasuk(s.id, px) !== null))
      .map((s) => s.id);
    if (defaultIncluded.length === 0) return; // nothing to synthesize from yet
    setIncluded(new Set(defaultIncluded));
    runStrategy('synthesize', { silent: true, refresh: true, include: defaultIncluded }).catch(() => {});
  });

  const runStrategy = async (strategy: string, opts: { silent?: boolean; refresh?: boolean; include?: string[] } = {}) => {
    const k = `pesukim:${strategy}`;
    if (!opts.silent) setRunning((r) => ({ ...r, [k]: true }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    try {
      const includeQs = strategy === 'synthesize' && opts.include
        ? `&include=${encodeURIComponent(opts.include.slice().sort().join(','))}`
        : '';
      const res = await fetch(
        `/api/enrich-pesukim/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}?strategy=${strategy}${opts.refresh ? '&refresh=1' : ''}${includeQs}`,
        { method: 'POST' },
      );
      const body = await res.json() as { pesukim?: Pasuk[]; error?: string };
      if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
      const current = pesukim();
      if (current && body.pesukim) {
        const byRef = new Map<string, Pasuk>();
        for (const p of current.pesukim) byRef.set(p.verseRef.toLowerCase(), { ...p });
        for (const p of body.pesukim) {
          const ex = byRef.get(p.verseRef.toLowerCase());
          if (!ex) continue;
          if (strategy === 'tanach-context' && p.tanachContext !== undefined) ex.tanachContext = p.tanachContext;
          if (strategy === 'peshat' && p.peshat !== undefined)                ex.peshat        = p.peshat;
          if (strategy === 'gemara-usage' && p.gemaraUsage !== undefined)     ex.gemaraUsage   = p.gemaraUsage;
          if (strategy === 'exegesis' && p.exegesis !== undefined)            ex.exegesis      = p.exegesis;
          if (strategy === 'synthesize' && p.synthesize !== undefined)        ex.synthesize    = p.synthesize;
        }
        mutate({ ...current, pesukim: [...byRef.values()] });
      } else {
        await refetch();
      }
    } catch (err) {
      setErrors((e) => ({ ...e, [k]: String(err) }));
    } finally {
      if (!opts.silent) setRunning((r) => ({ ...r, [k]: false }));
    }
  };

  const toggle = async (strategy: string) => {
    const cur = included();
    const isOn = cur.has(strategy);
    const next = new Set(cur);
    const cur2 = pesukim()?.pesukim ?? [];
    const cached = cur2.some((p) => sliceForPasuk(strategy, p) !== null);
    if (isOn) {
      next.delete(strategy);
    } else {
      next.add(strategy);
      if (!cached) await runStrategy(strategy);
    }
    setIncluded(next);
    runStrategy('synthesize', { silent: true, refresh: true, include: [...next] }).catch(() => {});
  };

  return (
    <>
      <section class="panel enrich-bar">
        <Show when={props.onReloadSkeleton}>
          <button class="toggle-pill toggle-off-empty reload-skel" onClick={() => props.onReloadSkeleton?.()} title="Re-run pesukim first-pass detection from scratch.">
            <span class="toggle-mark">↻</span>
            <span class="toggle-label">Reload skeleton</span>
          </button>
        </Show>
        <span class="enrich-label">Synthesis sources</span>
        <For each={STRATEGIES.filter((s) => s.id !== 'synthesize')}>{(s) => {
          const k = `pesukim:${s.id}`;
          const isCached = () => {
            const ps = pesukim()?.pesukim ?? [];
            return ps.some((p) => sliceForPasuk(s.id, p) !== null);
          };
          return (
            <EnrichmentToggle
              id={s.id}
              label={s.label}
              desc={s.desc}
              cached={isCached()}
              included={included().has(s.id)}
              running={!!running()[k]}
              error={errors()[k]}
              onClick={() => toggle(s.id)}
            />
          );
        }}</For>
        <Show when={running()['pesukim:synthesize']}>
          <span class="enrich-status">synthesizing…</span>
        </Show>
        <Show when={errors()['pesukim:synthesize']}>
          <span class="enrich-btn-err">synth err: {errors()['pesukim:synthesize']}</span>
        </Show>
      </section>

      <Show when={pesukim.loading}><p class="loading">Loading pesukim…</p></Show>
      <Show when={!pesukim.loading && pesukim.error}><p class="err-msg">{String(pesukim.error)}</p></Show>
      <Show when={pesukim() && pesukim()!.pesukim.length === 0}>
        <section class="panel empty">No verse citations on this daf.</section>
      </Show>
      <Show when={pesukim() && pesukim()!.pesukim.length > 0}>
        <section class="panel">
          <For each={pesukim()!.pesukim}>{(p, i) => (
            <PasukCard
              pasuk={p}
              idx={i()}
              running={running()}
              errors={errors()}
              onRun={runStrategy}
              selectedSegment={props.selectedSegment ?? null}
              setSelectedSegment={props.setSelectedSegment}
            />
          )}</For>
        </section>
      </Show>
    </>
  );
}

function PasukCard(props: {
  pasuk: Pasuk;
  idx: number;
  running: Partial<Record<string, boolean>>;
  errors: Partial<Record<string, string>>;
  onRun: (strategy: string) => void;
  selectedSegment: number | null;
  setSelectedSegment?: (n: number | null) => void;
}): JSX.Element {
  const p = () => props.pasuk;
  const anchor = (): { segmentIdx?: number; segmentRange?: [number, number]; quote?: string } => {
    const s = p().startSegIdx;
    const e = p().endSegIdx;
    if (typeof s === 'number' && typeof e === 'number') return { segmentIdx: s, segmentRange: [s, e] };
    if (typeof s === 'number') return { segmentIdx: s };
    return { quote: p().excerpt };
  };
  const highlighted = () => props.selectedSegment != null && anchorMatches(anchor(), props.selectedSegment);
  return (
    <div
      class="card"
      classList={{ 'card-highlighted': highlighted() }}
      onClick={() => {
        const a = anchor();
        if (a.segmentIdx !== undefined) props.setSelectedSegment?.(a.segmentIdx);
      }}
    >
      <div class="card-head">
        <span class="card-num">§{props.idx + 1}</span>
        <span class="card-title">{p().verseRef}</span>
        <Show when={p().citationStyle}><span class="theme-tag">{p().citationStyle}</span></Show>
      </div>
      <Show when={p().verseHe}>
        <div class="d-excerpt" dir="rtl">{p().verseHe}</div>
      </Show>
      <Show when={p().citationMarker}>
        <div class="card-who" dir="rtl">cited via "{p().citationMarker}"</div>
      </Show>
      <p class="card-summary"><Hebraized text={p().summary} /></p>
      <ProvenanceBadge
        strategies={STRATEGIES.filter((s) => sliceForPasuk(s.id, p()) !== null).map((s) => s.id)}
        firstPass="pesukim first-pass"
      />

      <details class="strat-expand" onClick={(e) => e.stopPropagation()}>
        <summary onClick={(e) => e.stopPropagation()}>raw enrichments</summary>
        <div class="strat-expand-body">
          <For each={STRATEGIES}>{(strat) => (
            <StrategyRow
              id={strat.id}
              label={strat.label}
              desc={strat.desc}
              data={sliceForPasuk(strat.id, p())}
              running={!!props.running[`pesukim:${strat.id}`]}
              error={props.errors[`pesukim:${strat.id}`]}
              onRun={() => props.onRun(strat.id)}
            />
          )}</For>
        </div>
      </details>
    </div>
  );
}
