/**
 * Enrichment lab — tabs for the three content types the daf produces:
 *   Argument  — sections + rabbis + dispute structure
 *   Halacha   — practical topics with rulings (MT / SA / Rema + modern)
 *   Aggadata  — narrative stories (+ parallels + historical context)
 *
 * Each tab loads its own stage-1 endpoint, then lets the user click
 * "enrich" buttons attached to each section/topic/story. Enrichment
 * results attach inline under the item they enriched.
 */
import { createEffect, createResource, createSignal, For, Show, type JSX, type Resource } from 'solid-js';
import { TRACTATE_OPTIONS } from '../lib/sefref';
import { ARGUMENT_FLOW_CSS } from './ArgumentFlowSidebar';
import { RabbiTab } from './RabbiTab';
import { PesukimTab } from './PesukimTab';
import { EraTab } from './EraTab';
import { MesorahTab } from './MesorahTab';
import { DafTextPanel, anchorMatches } from './DafTextPanel';
import { StrategyRow, STRATEGY_ROW_CSS } from './StrategyRow';
import { ProvenanceBadge, PROVENANCE_CSS } from './ProvenanceBadge';
import { EnrichmentToggle, ENRICHMENT_TOGGLE_CSS } from './EnrichmentToggle';
import { Hebraized } from './Hebraized';

// ---- types ---------------------------------------------------------------

interface ArgumentSkeleton {
  summary: string;
  sections: Array<{
    title: string;
    summary: string;
    excerpt: string;
    rabbiNames: string[];
    startSegIdx?: number;
    endSegIdx?: number;
  }>;
}

interface BiblicalRef { ref: string; hebrewRef?: string; hebrewQuote?: string; }
interface DifficultyRating { score: 1 | 2 | 3 | 4 | 5; reason: string; }
interface EnrichedRabbi {
  name: string; nameHe?: string; period?: string; location?: string;
  role?: string; opinionStart?: string; opinionEnd?: string;
  generation?: string;
  agreesWith?: string[]; disagreesWith?: string[];
}
interface CommentaryNote { source: string; ref?: string; question: string }
interface SynthesisOutput { explanation?: string; groundedIn?: string[] }
interface BiggerPicture { explanation?: string; groundedIn?: string[] }
interface BackgroundContext { explanation?: string; groundedIn?: string[] }

interface EnrichedArgumentSection {
  title: string; summary: string; excerpt?: string;
  references?: BiblicalRef[]; parallels?: string[]; difficulty?: DifficultyRating;
  rabbis: EnrichedRabbi[];
  commentaries?: CommentaryNote[];
  biggerPicture?: BiggerPicture;
  background?: BackgroundContext;
  synthesize?: SynthesisOutput;
  startSegIdx?: number;
  endSegIdx?: number;
}
interface EnrichedArgumentAnalysis {
  summary: string; difficulty?: DifficultyRating;
  sections: EnrichedArgumentSection[];
  _strategy?: string; _elapsed_ms?: number; _warnings?: string[];
}

interface HalachaRuling { ref: string; summary: string; }
interface ModernAuthority { source: string; ref?: string; summary: string; }
interface RishonNote { rishon: string; note: string; ref?: string; }
interface SaCommentaryNote { commentator: string; note: string; ref?: string; }
interface HalachaSynthesis { explanation: string; groundedIn?: string[] }
interface HalachaTopic {
  topic: string; topicHe?: string; excerpt?: string;
  rulings: { mishnehTorah?: HalachaRuling; shulchanAruch?: HalachaRuling; rema?: HalachaRuling };
  modernAuthorities?: ModernAuthority[];
  rishonimNotes?: RishonNote[];
  saCommentaryNotes?: SaCommentaryNote[];
  synthesis?: HalachaSynthesis;
  startSegIdx?: number;
  endSegIdx?: number;
}
interface HalachaResult { topics: HalachaTopic[]; _cached?: boolean; }

interface HistoricalContext { era: string; context: string; }
interface AggadataSynthesis { explanation: string; groundedIn?: string[] }
interface AggadataStory {
  title: string; titleHe?: string; summary: string; excerpt: string; endExcerpt?: string; theme?: string;
  parallels?: string[]; historicalContext?: HistoricalContext;
  synthesis?: AggadataSynthesis;
  startSegIdx?: number;
  endSegIdx?: number;
}
interface AggadataResult { stories: AggadataStory[]; _cached?: boolean; }

type Tab = 'argument' | 'pesukim' | 'halacha' | 'aggadata' | 'people' | 'era' | 'tree';

interface PreloadSnapshot {
  tractate: string;
  page: string;
  argument: Record<string, unknown>;
  halacha: { stage1: unknown; perStrategy: Record<string, unknown> };
  aggadata: { stage1: unknown; perStrategy: Record<string, unknown> };
  pesukim: { stage1: unknown; perStrategy: Record<string, unknown> };
  region: Record<string, unknown>;
  mesorah: Record<string, unknown>;
}

// ---- fetchers -------------------------------------------------------------

/** Logs the worker's `attempts[]` + `detail` fields so per-model failure
 *  reasons (empty payload / schema mismatch / 1031) actually reach the
 *  console instead of just the generic top-level error. */
function logFetchError(label: string, status: number, body: { error?: string; attempts?: string[]; detail?: string } | null): void {
  // eslint-disable-next-line no-console
  console.warn(
    `[${label}] HTTP`, status,
    body?.error ?? '',
    body?.attempts ? `· attempts: ${body.attempts.join(' | ')}` : '',
    body?.detail ?? '',
  );
}

async function fetchSkeleton(tractate: string, page: string, refresh = false): Promise<ArgumentSkeleton | null> {
  const qs = refresh ? '&refresh=1' : '';
  const res = await fetch(`/api/analyze/${encodeURIComponent(tractate)}/${page}?skeleton_only=1${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string; attempts?: string[]; detail?: string } | null;
    logFetchError('skeleton', res.status, body);
    return null;
  }
  return res.json();
}

async function fetchHalacha(tractate: string, page: string, refresh = false): Promise<HalachaResult | null> {
  const qs = refresh ? '?refresh=1' : '';
  const res = await fetch(`/api/halacha/${encodeURIComponent(tractate)}/${page}${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string; attempts?: string[]; detail?: string } | null;
    logFetchError('halacha', res.status, body);
    return null;
  }
  return res.json();
}

async function fetchAggadata(tractate: string, page: string, refresh = false): Promise<AggadataResult | null> {
  const qs = refresh ? '?refresh=1' : '';
  const res = await fetch(`/api/aggadata/${encodeURIComponent(tractate)}/${page}${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string; attempts?: string[]; detail?: string } | null;
    logFetchError('aggadata', res.status, body);
    return null;
  }
  return res.json();
}

type HalachaEnrichStrategy = 'modern-authorities' | 'rishonim-condensed' | 'sa-commentary-walk' | 'synthesize';
type AggadataEnrichStrategy = 'parallels' | 'historical-context' | 'synthesize';

// ---- component ------------------------------------------------------------

export function EnrichmentPage(): JSX.Element {
  const [tractate, setTractate] = createSignal('Berakhot');
  const [page, setPage] = createSignal('5a');
  const [tab, setTab] = createSignal<Tab>('argument');
  const [loadKey, setLoadKey] = createSignal(0);
  const dafKey = () => `${tractate()}|${page()}|${loadKey()}`;

  // Per-tab refresh nonces. Bumped by the per-tab refresh button to bust
  // the identify cache and re-run Stage-1. Reset on every Load.
  const [refreshNonces, setRefreshNonces] = createSignal<Record<Tab, number>>({
    argument: 0, pesukim: 0, halacha: 0, aggadata: 0, people: 0, era: 0, tree: 0,
  });
  const tabKey = (t: Tab) => () => `${dafKey()}|${refreshNonces()[t]}`;
  const refreshTab = (t: Tab) => setRefreshNonces((s) => ({ ...s, [t]: s[t] + 1 }));

  const [skeleton, { refetch: refetchSkeleton }] = createResource(tabKey('argument'), async (): Promise<ArgumentSkeleton | null> => {
    if (loadKey() === 0) return null;
    return fetchSkeleton(tractate(), page(), refreshNonces().argument > 0).catch(() => null);
  });
  const [halacha, { mutate: mutateHalacha, refetch: refetchHalacha }] = createResource(tabKey('halacha'), async (): Promise<HalachaResult | null> => {
    if (loadKey() === 0) return null;
    return fetchHalacha(tractate(), page(), refreshNonces().halacha > 0).catch(() => null);
  });
  const [aggadata, { mutate: mutateAggadata, refetch: refetchAggadata }] = createResource(tabKey('aggadata'), async (): Promise<AggadataResult | null> => {
    if (loadKey() === 0) return null;
    return fetchAggadata(tractate(), page(), refreshNonces().aggadata > 0).catch(() => null);
  });
  // Suppress unused-variable warnings for refetchers; consumers may call them.
  void refetchSkeleton; void refetchHalacha; void refetchAggadata;

  const [argumentEnrichments, setArgumentEnrichments] = createSignal<Partial<Record<string, EnrichedArgumentAnalysis>>>({});
  const [running, setRunning] = createSignal<Partial<Record<string, boolean>>>({});
  const [errors, setErrors] = createSignal<Partial<Record<string, string>>>({});

  // Phase C: side-by-side daf text panel + bidirectional segment highlighting.
  const [showText, setShowText] = createSignal(false);
  const [selectedSegment, setSelectedSegment] = createSignal<number | null>(null);

  const handleLoad = () => {
    setArgumentEnrichments({});
    setRunning({});
    setErrors({});
    setRefreshNonces({
      argument: 0, pesukim: 0, halacha: 0, aggadata: 0, people: 0, era: 0, tree: 0,
    });
    setLoadKey(loadKey() + 1);
    void preloadCachedDaf(tractate(), page());
  };

  /** Pre-populate per-strategy state from KV-cached daf-level enrichments,
   *  so cached strategies render immediately on Load and their buttons start
   *  in `↻ re-enrich` state. Pure cache read; no AI calls. Silently skips
   *  whatever isn't cached. */
  async function preloadCachedDaf(t: string, p: string): Promise<void> {
    let snap: PreloadSnapshot | null = null;
    try {
      const res = await fetch(`/api/enrich-cached-daf/${encodeURIComponent(t)}/${encodeURIComponent(p)}`);
      if (!res.ok) return;
      snap = await res.json() as PreloadSnapshot;
    } catch { return; }
    if (!snap) return;
    if (t !== tractate() || p !== page()) return;

    // Argument strategies: each is a full EnrichedArgumentAnalysis blob.
    const argEntries: Partial<Record<string, EnrichedArgumentAnalysis>> = {};
    for (const [strat, data] of Object.entries(snap.argument ?? {})) {
      if (data) argEntries[strat] = data as EnrichedArgumentAnalysis;
    }
    if (Object.keys(argEntries).length > 0) {
      setArgumentEnrichments((prev) => ({ ...argEntries, ...prev }));
      // Default toggles to ON for every cached source strategy. Synthesize
      // is the result, not a source — exclude it from the include set.
      const defaultIncluded = new Set(
        Object.keys(argEntries).filter((s) => s !== 'synthesize' && ARG_STRATEGIES.some((ss) => ss.id === s)),
      );
      if (defaultIncluded.size > 0) {
        setArgIncluded(defaultIncluded);
        // Fire synthesize with the default include set so the prose actually
        // reflects the cached sources. Uses cache if previously synthesized
        // with this exact set; otherwise generates fresh.
        runArg('synthesize', { silent: true, refresh: false, include: [...defaultIncluded] }).catch(() => {});
      }
    }

    // Halacha / aggadata preloads are signals so the merge effect rerruns
    // whenever either the resource lands OR the preload arrives — whichever
    // is later. With a plain let, a fast halacha resource that resolves
    // before the preload fetch would skip the merge forever.
    setPendingHalachaPreload(snap.halacha?.perStrategy ?? null);
    setPendingAggadataPreload(snap.aggadata?.perStrategy ?? null);
  }

  const [pendingHalachaPreload, setPendingHalachaPreload] = createSignal<Record<string, unknown> | null>(null);
  const [pendingAggadataPreload, setPendingAggadataPreload] = createSignal<Record<string, unknown> | null>(null);

  // Once BOTH halacha resource and preload signal have data, fold the cached
  // slices in and default-on the include set. Tracks both reactively so it
  // fires regardless of arrival order.
  createEffect(() => {
    const h = halacha();
    const cached = pendingHalachaPreload();
    if (!h || !cached) return;
    setPendingHalachaPreload(null);
    const byTopic = new Map<string, HalachaTopic>();
    for (const t of h.topics) byTopic.set(t.topic.toLowerCase(), { ...t });
    const cachedStrategies = new Set<string>();
    for (const [strat, data] of Object.entries(cached)) {
      if (!data) continue;
      cachedStrategies.add(strat);
      const sliceResult = data as { topics?: HalachaTopic[] };
      for (const t of sliceResult.topics ?? []) {
        const existing = byTopic.get(t.topic.toLowerCase());
        if (!existing) continue;
        if (t.modernAuthorities !== undefined)  existing.modernAuthorities  = t.modernAuthorities;
        if (t.rishonimNotes !== undefined)      existing.rishonimNotes      = t.rishonimNotes;
        if (t.saCommentaryNotes !== undefined)  existing.saCommentaryNotes  = t.saCommentaryNotes;
      }
    }
    mutateHalacha({ ...h, topics: [...byTopic.values()] });
    const defaults = new Set([...cachedStrategies].filter((s) => s !== 'synthesize'));
    if (defaults.size > 0) {
      setHalachaIncluded(defaults);
      runHalachaEnrich('synthesize', { silent: true, refresh: false, include: [...defaults] }).catch(() => {});
    }
  });

  createEffect(() => {
    const a = aggadata();
    const cached = pendingAggadataPreload();
    if (!a || !cached) return;
    setPendingAggadataPreload(null);
    const byTitle = new Map<string, AggadataStory>();
    for (const s of a.stories) byTitle.set(s.title.toLowerCase(), { ...s });
    const cachedStrategies = new Set<string>();
    for (const [strat, data] of Object.entries(cached)) {
      if (!data) continue;
      cachedStrategies.add(strat);
      const sliceResult = data as { stories?: AggadataStory[] };
      for (const st of sliceResult.stories ?? []) {
        const existing = byTitle.get(st.title.toLowerCase());
        if (!existing) continue;
        if (st.parallels !== undefined)         existing.parallels         = st.parallels;
        if (st.historicalContext !== undefined) existing.historicalContext = st.historicalContext;
      }
    }
    mutateAggadata({ ...a, stories: [...byTitle.values()] });
    const defaults = new Set([...cachedStrategies].filter((s) => s !== 'synthesize'));
    if (defaults.size > 0) {
      setAggIncluded(defaults);
      runAggEnrich('synthesize', { silent: true, refresh: false, include: [...defaults] }).catch(() => {});
    }
  });

  // Argument toggles — the source strategies the synthesis is currently
  // grounded in. Toggling a strategy on (a) fetches it if not cached, then
  // (b) re-fires synthesize with the new include set.
  const [argIncluded, setArgIncluded] = createSignal<Set<string>>(new Set());

  const runArg = async (strategy: string, opts: { silent?: boolean; refresh?: boolean; include?: string[] } = {}) => {
    const key = `arg:${strategy}`;
    if (!opts.silent) setRunning(r => ({ ...r, [key]: true }));
    setErrors(e => ({ ...e, [key]: undefined }));
    try {
      const includeQs = strategy === 'synthesize' && opts.include
        ? `&include=${encodeURIComponent(opts.include.slice().sort().join(','))}`
        : '';
      const url = `/api/enrich/${encodeURIComponent(tractate())}/${page()}?strategy=${strategy}${opts.refresh ? '&refresh=1' : ''}${includeQs}`;
      const res = await fetch(url, { method: 'POST' });
      const body = await res.json().catch(() => null) as (EnrichedArgumentAnalysis & { error?: string }) | null;
      if (!res.ok || !body) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setArgumentEnrichments(prev => ({ ...prev, [strategy]: body }));
    } catch (err) {
      setErrors(e => ({ ...e, [key]: String(err) }));
    } finally {
      if (!opts.silent) setRunning(r => ({ ...r, [key]: false }));
    }
  };

  /** Toggle an argument source strategy on/off. Off→on fetches the strategy
   *  if not cached; on→off just updates the include set. Either way, a new
   *  synthesize call fires with the updated include list. */
  const toggleArg = async (strategy: string) => {
    const cur = argIncluded();
    const isOn = cur.has(strategy);
    const next = new Set(cur);
    const cached = argumentEnrichments()[strategy] !== undefined;
    if (isOn) {
      next.delete(strategy);
    } else {
      next.add(strategy);
      if (!cached) {
        await runArg(strategy);
      }
    }
    setArgIncluded(next);
    // Fire synthesize with the new include set (refresh=1 so the cached
    // synthesize for the OLD include set is bypassed).
    runArg('synthesize', { silent: true, refresh: true, include: [...next] }).catch(() => {});
  };

  const [halachaIncluded, setHalachaIncluded] = createSignal<Set<string>>(new Set());

  const runHalachaEnrich = async (strategy: HalachaEnrichStrategy, opts: { silent?: boolean; refresh?: boolean; include?: string[] } = {}) => {
    const key = `halacha:${strategy}`;
    if (!opts.silent) setRunning(r => ({ ...r, [key]: true }));
    setErrors(e => ({ ...e, [key]: undefined }));
    try {
      const includeQs = strategy === 'synthesize' && opts.include
        ? `&include=${encodeURIComponent(opts.include.slice().sort().join(','))}`
        : '';
      const url = `/api/enrich-halacha/${encodeURIComponent(tractate())}/${page()}?strategy=${strategy}${opts.refresh ? '&refresh=1' : ''}${includeQs}`;
      const res = await fetch(url, { method: 'POST' });
      const result = await res.json() as HalachaResult & { error?: string };
      if (!res.ok || result.error) throw new Error(result.error ?? `HTTP ${res.status}`);
      const prev = halacha();
      if (prev) {
        const byTopic = new Map<string, HalachaTopic>();
        for (const t of result.topics) byTopic.set(t.topic.toLowerCase(), t);
        mutateHalacha({
          ...prev,
          topics: prev.topics.map(t => {
            const hit = byTopic.get(t.topic.toLowerCase());
            if (!hit) return t;
            return {
              ...t,
              ...(hit.modernAuthorities !== undefined ? { modernAuthorities: hit.modernAuthorities } : {}),
              ...(hit.rishonimNotes !== undefined ? { rishonimNotes: hit.rishonimNotes } : {}),
              ...(hit.saCommentaryNotes !== undefined ? { saCommentaryNotes: hit.saCommentaryNotes } : {}),
              ...(hit.synthesis !== undefined ? { synthesis: hit.synthesis } : {}),
            };
          }),
        });
      } else {
        mutateHalacha(result);
      }
    } catch (err) {
      setErrors(e => ({ ...e, [key]: String(err) }));
    } finally {
      if (!opts.silent) setRunning(r => ({ ...r, [key]: false }));
    }
  };

  const toggleHalacha = async (strategy: HalachaEnrichStrategy) => {
    const cur = halachaIncluded();
    const isOn = cur.has(strategy);
    const next = new Set(cur);
    const prev = halacha();
    const cached = !!prev?.topics.some((t) => sliceHalachaForTopic(strategy, t) !== null);
    if (isOn) {
      next.delete(strategy);
    } else {
      next.add(strategy);
      if (!cached) await runHalachaEnrich(strategy);
    }
    setHalachaIncluded(next);
    runHalachaEnrich('synthesize', { silent: true, refresh: true, include: [...next] }).catch(() => {});
  };

  const [aggIncluded, setAggIncluded] = createSignal<Set<string>>(new Set());

  const runAggEnrich = async (strategy: AggadataEnrichStrategy, opts: { silent?: boolean; refresh?: boolean; include?: string[] } = {}) => {
    const key = `aggadata:${strategy}`;
    if (!opts.silent) setRunning(r => ({ ...r, [key]: true }));
    setErrors(e => ({ ...e, [key]: undefined }));
    try {
      const includeQs = strategy === 'synthesize' && opts.include
        ? `&include=${encodeURIComponent(opts.include.slice().sort().join(','))}`
        : '';
      const url = `/api/enrich-aggadata/${encodeURIComponent(tractate())}/${page()}?strategy=${strategy}${opts.refresh ? '&refresh=1' : ''}${includeQs}`;
      const res = await fetch(url, { method: 'POST' });
      const result = await res.json() as AggadataResult & { error?: string };
      if (!res.ok || result.error) throw new Error(result.error ?? `HTTP ${res.status}`);
      const prev = aggadata();
      if (prev) {
        const byTitle = new Map<string, AggadataStory>();
        for (const st of result.stories) byTitle.set(st.title.toLowerCase(), st);
        mutateAggadata({
          ...prev,
          stories: prev.stories.map(st => {
            const hit = byTitle.get(st.title.toLowerCase());
            if (!hit) return st;
            return {
              ...st,
              ...(hit.parallels ? { parallels: hit.parallels } : {}),
              ...(hit.historicalContext ? { historicalContext: hit.historicalContext } : {}),
              ...(hit.synthesis !== undefined ? { synthesis: hit.synthesis } : {}),
            };
          }),
        });
      } else {
        mutateAggadata(result);
      }
    } catch (err) {
      setErrors(e => ({ ...e, [key]: String(err) }));
    } finally {
      if (!opts.silent) setRunning(r => ({ ...r, [key]: false }));
    }
  };

  const toggleAgg = async (strategy: AggadataEnrichStrategy) => {
    const cur = aggIncluded();
    const isOn = cur.has(strategy);
    const next = new Set(cur);
    const prev = aggadata();
    const cached = !!prev?.stories.some((s) => sliceAggadataForStory(strategy, s) !== null);
    if (isOn) {
      next.delete(strategy);
    } else {
      next.add(strategy);
      if (!cached) await runAggEnrich(strategy);
    }
    setAggIncluded(next);
    runAggEnrich('synthesize', { silent: true, refresh: true, include: [...next] }).catch(() => {});
  };

  // Merge all argument strategy outputs so each section card can show
  // whatever fields any strategy has populated.
  const mergedArgument = () => {
    const e = argumentEnrichments();
    const order = [
      'rich-rabbi', 'per-section', 'hybrid', 'baseline',
      'references', 'parallels', 'difficulty',
      'commentaries', 'bigger-picture', 'background',
      'synthesize',
    ];
    const base = order.map(k => e[k]).find(Boolean);
    if (!base) return null;
    const bySec = new Map<string, EnrichedArgumentSection>();
    for (const sec of base.sections) bySec.set(sec.title.toLowerCase(), { ...sec });
    for (const strat of order) {
      const result = e[strat];
      if (!result) continue;
      for (const sec of result.sections) {
        const existing = bySec.get(sec.title.toLowerCase());
        if (!existing) continue;
        if (sec.rabbis && sec.rabbis.length > 0 && (existing.rabbis.length === 0 || strat === 'rich-rabbi')) {
          existing.rabbis = sec.rabbis;
        }
        if (sec.references) existing.references = sec.references;
        if (sec.parallels) existing.parallels = sec.parallels;
        if (sec.difficulty) existing.difficulty = sec.difficulty;
        if (sec.commentaries) existing.commentaries = sec.commentaries;
        if (sec.biggerPicture) existing.biggerPicture = sec.biggerPicture;
        if (sec.background) existing.background = sec.background;
        if (sec.synthesize) existing.synthesize = sec.synthesize;
      }
    }
    const overallDifficulty = order.map(k => e[k]?.difficulty).find(Boolean);
    return {
      summary: base.summary,
      difficulty: overallDifficulty,
      sections: base.sections.map(s => bySec.get(s.title.toLowerCase())!).filter(Boolean),
    };
  };

  return (
    <div class="enrichment-page">
      <style>{PAGE_CSS}</style>
      <style>{ARGUMENT_FLOW_CSS}</style>
      <style>{STRATEGY_ROW_CSS}</style>
      <style>{PROVENANCE_CSS}</style>
      <style>{ENRICHMENT_TOGGLE_CSS}</style>

      <h1>Enrichment Lab</h1>
      <p class="lead">
        Each tab shows the daf's stage-1 output for one content type. Click enrich buttons
        to layer extra fields onto each section/topic/story.
      </p>

      {/* Sticky status indicator — shows all synthesize/strategy runs in flight
          across every tab so the user knows their toggle change is processing. */}
      <SynthStatusBar running={running()} />

      <section class="panel controls">
        <label>Tractate</label>
        <select value={tractate()} onChange={(e) => setTractate(e.currentTarget.value)}>
          <For each={TRACTATE_OPTIONS}>{(t) => <option value={t.value}>{t.value} · {t.label}</option>}</For>
        </select>
        <label>Daf</label>
        <input type="text" value={page()} onInput={(e) => setPage(e.currentTarget.value)} style="width: 5rem;" placeholder="5a" />
        <button class="primary" onClick={handleLoad}>Load</button>
        <Show when={loadKey() > 0}>
          <button class="text-toggle" onClick={() => setShowText(!showText())} title="Toggle daf text panel">
            {showText() ? '⟨ hide text' : 'show text ⟩'}
          </button>
        </Show>
      </section>

      <Show when={loadKey() > 0}>
        <div class="enr-split" classList={{ 'enr-split-open': showText() }}>
          <Show when={showText()}>
            <aside class="enr-text-pane">
              <DafTextPanel
                tractate={tractate()}
                page={page()}
                loadKey={loadKey()}
                selectedSegment={selectedSegment()}
                setSelectedSegment={setSelectedSegment}
              />
            </aside>
          </Show>
          <div class="enr-tabs-pane">
        <div class="tabs">
          <TabButton tab="argument" current={tab()} onSelect={setTab} onRefresh={() => refreshTab('argument')}>
            Argument
            <Show when={skeleton()}><span class="tab-count">{skeleton()!.sections.length}</span></Show>
          </TabButton>
          <TabButton tab="pesukim" current={tab()} onSelect={setTab} onRefresh={() => refreshTab('pesukim')}>
            Pesukim
          </TabButton>
          <TabButton tab="halacha" current={tab()} onSelect={setTab} onRefresh={() => refreshTab('halacha')}>
            Halacha
            <Show when={halacha()}><span class="tab-count">{halacha()!.topics.length}</span></Show>
          </TabButton>
          <TabButton tab="aggadata" current={tab()} onSelect={setTab} onRefresh={() => refreshTab('aggadata')}>
            Aggadata
            <Show when={aggadata()}><span class="tab-count">{aggadata()!.stories.length}</span></Show>
          </TabButton>
          <TabButton tab="people" current={tab()} onSelect={setTab} onRefresh={() => refreshTab('people')}>
            People
          </TabButton>
          <TabButton tab="era" current={tab()} onSelect={setTab} onRefresh={() => refreshTab('era')}>
            Era
          </TabButton>
          <TabButton tab="tree" current={tab()} onSelect={setTab} onRefresh={() => refreshTab('tree')}>
            Tree
          </TabButton>
        </div>

        <Show when={tab() === 'argument'}>
          <ArgumentTab
            tractate={tractate()}
            page={page()}
            skeleton={skeleton}
            merged={mergedArgument()}
            enrichments={argumentEnrichments()}
            included={argIncluded()}
            running={running()}
            errors={errors()}
            onRun={runArg}
            onToggle={toggleArg}
            onReloadSkeleton={() => refreshTab('argument')}
            selectedSegment={selectedSegment()}
            setSelectedSegment={setSelectedSegment}
          />
        </Show>
        <Show when={tab() === 'halacha'}>
          <HalachaTab
            halacha={halacha}
            included={halachaIncluded()}
            running={running()}
            errors={errors()}
            onEnrich={runHalachaEnrich}
            onToggle={toggleHalacha}
            onReloadSkeleton={() => refreshTab('halacha')}
            selectedSegment={selectedSegment()}
            setSelectedSegment={setSelectedSegment}
          />
        </Show>
        <Show when={tab() === 'aggadata'}>
          <AggadataTab
            aggadata={aggadata}
            included={aggIncluded()}
            running={running()}
            errors={errors()}
            onEnrich={runAggEnrich}
            onToggle={toggleAgg}
            onReloadSkeleton={() => refreshTab('aggadata')}
            selectedSegment={selectedSegment()}
            setSelectedSegment={setSelectedSegment}
          />
        </Show>
        <Show when={tab() === 'pesukim'}>
          <PesukimTab
            tractate={tractate()}
            page={page()}
            loadKey={loadKey()}
            refreshNonce={refreshNonces().pesukim}
            onReloadSkeleton={() => refreshTab('pesukim')}
            selectedSegment={selectedSegment()}
            setSelectedSegment={setSelectedSegment}
          />
        </Show>
        <Show when={tab() === 'era'}>
          <EraTab tractate={tractate()} page={page()} loadKey={loadKey()} refreshNonce={refreshNonces().era} onReloadSkeleton={() => refreshTab('era')} />
        </Show>
        <Show when={tab() === 'tree'}>
          <MesorahTab tractate={tractate()} page={page()} loadKey={loadKey()} refreshNonce={refreshNonces().tree} onReloadSkeleton={() => refreshTab('tree')} />
        </Show>
        <Show when={tab() === 'people'}>
          <RabbiTab tractate={tractate()} page={page()} loadKey={loadKey()} refreshNonce={refreshNonces().people} onReloadSkeleton={() => refreshTab('people')} />
        </Show>
          </div>
        </div>
      </Show>

      <Show when={loadKey() === 0}>
        <section class="panel empty">Pick a tractate + daf and click <b>Load</b>.</section>
      </Show>
    </div>
  );
}

// ---- tabs -----------------------------------------------------------------

const ARG_STRATEGIES = [
  { id: 'rich-rabbi',     label: 'Rich rabbi',     desc: 'Rabbi identity + role + opinionStart/End + agreesWith/disagreesWith.' },
  { id: 'references',     label: 'References',     desc: 'Biblical verses per section.' },
  { id: 'parallels',      label: 'Parallels',      desc: 'Parallel sugyot in other masechtot.' },
  { id: 'commentaries',   label: 'Commentaries',   desc: 'Questions/difficulties raised by Rashi, Tosafot, Rishonim on this section.' },
  { id: 'bigger-picture', label: 'Bigger picture', desc: 'How this section fits the daf\'s structural arc + neighbor amudim.' },
  { id: 'background',     label: 'Background',     desc: 'Why this subject matters and why the Talmud engages with it here.' },
  { id: 'difficulty',     label: 'Difficulty',     desc: '1-5 per section + overall.' },
  { id: 'synthesize',     label: 'Synthesize',     desc: 'One-paragraph synthesis combining all other strategies. Auto-refires on every other strategy run.' },
] as const;

/** For a given strategy, slice the daf-level result to just THIS section's data. */
function sliceArgumentForSection(
  strategy: string,
  result: EnrichedArgumentAnalysis | undefined,
  title: string,
): unknown {
  if (!result) return null;
  const sec = result.sections.find((s) => s.title.toLowerCase() === title.toLowerCase());
  if (!sec) return null;
  switch (strategy) {
    case 'rich-rabbi':     return sec.rabbis ?? null;
    case 'references':     return sec.references ?? null;
    case 'parallels':      return sec.parallels ?? null;
    case 'difficulty':     return sec.difficulty ?? null;
    case 'commentaries':   return sec.commentaries ?? null;
    case 'bigger-picture': return sec.biggerPicture ?? null;
    case 'background':     return sec.background ?? null;
    case 'synthesize':     return sec.synthesize ?? null;
    default: return sec;
  }
}

function SynthStatusBar(props: { running: Partial<Record<string, boolean>> }): JSX.Element {
  const active = (): string[] => {
    const tags: Record<string, string> = {
      'arg:synthesize':       'argument',
      'halacha:synthesize':   'halacha',
      'aggadata:synthesize':  'aggadata',
      'pesukim:synthesize':   'pesukim',
    };
    const synth: string[] = [];
    const other: string[] = [];
    for (const [k, v] of Object.entries(props.running)) {
      if (!v) continue;
      if (k in tags) synth.push(tags[k]);
      else if (k.endsWith(':synthesize')) synth.push(k.replace(':synthesize', ''));
      else {
        const m = k.match(/^([a-z]+):(.+)$/);
        if (m) other.push(`${m[1]} · ${m[2]}`);
      }
    }
    return [...synth.map((s) => `synthesizing ${s}`), ...other.map((s) => `running ${s}`)];
  };
  return (
    <Show when={active().length > 0}>
      <div class="synth-status-bar">
        <span class="synth-status-spinner" />
        <For each={active()}>{(label, i) => (
          <>
            <Show when={i() > 0}><span class="synth-status-sep">·</span></Show>
            <span class="synth-status-tag">{label}</span>
          </>
        )}</For>
      </div>
    </Show>
  );
}

function TabButton(props: {
  tab: Tab;
  current: Tab;
  onSelect: (t: Tab) => void;
  /** Kept for call-site compatibility but no longer renders. The "Reload
   *  skeleton" button now lives inside each tab's enrichment toggle bar. */
  onRefresh?: () => void;
  children: JSX.Element;
}): JSX.Element {
  void props.onRefresh;
  return (
    <div class="tab-wrap" classList={{ 'tab-wrap-active': props.current === props.tab }}>
      <button
        class="tab"
        classList={{ 'tab-active': props.current === props.tab }}
        onClick={() => props.onSelect(props.tab)}
      >
        {props.children}
      </button>
    </div>
  );
}

interface SectionAnchor {
  startSegIdx?: number;
  endSegIdx?: number;
  excerpt?: string;
}
function rangeAnchor(s: SectionAnchor): { segmentIdx?: number; segmentRange?: [number, number]; quote?: string } {
  const start = s.startSegIdx;
  const end = s.endSegIdx;
  if (typeof start === 'number' && typeof end === 'number') {
    return { segmentIdx: start, segmentRange: [start, end] };
  }
  if (typeof start === 'number') return { segmentIdx: start };
  return { quote: s.excerpt };
}

/** Strategies that actually rewrite the prose `summary` field. The merger
 *  uses the first one that ran in priority order; if none ran the displayed
 *  summary is still the skeleton text. rich-rabbi / references / parallels /
 *  difficulty / commentaries / bigger-picture / background DON'T rewrite the
 *  summary — they only fill OTHER fields. So they should not be credited as
 *  provenance for the displayed prose. */
const ARG_SUMMARY_REWRITERS = ['baseline', 'per-section', 'hybrid'] as const;

function argDafSummaryProvenance(enrichments: Partial<Record<string, EnrichedArgumentAnalysis>>): string[] {
  return ARG_SUMMARY_REWRITERS.filter((s) => enrichments[s] !== undefined);
}

function argSectionSummaryProvenance(
  enrichments: Partial<Record<string, EnrichedArgumentAnalysis>>,
  title: string,
): string[] {
  const out: string[] = [];
  for (const s of ARG_SUMMARY_REWRITERS) {
    const result = enrichments[s];
    if (!result) continue;
    if (result.sections.some((sec) => sec.title.toLowerCase() === title.toLowerCase())) out.push(s);
  }
  return out;
}

function ArgumentTab(props: {
  tractate: string;
  page: string;
  skeleton: Resource<ArgumentSkeleton | null>;
  merged: { summary: string; difficulty?: DifficultyRating; sections: EnrichedArgumentSection[] } | null;
  enrichments: Partial<Record<string, EnrichedArgumentAnalysis>>;
  included: Set<string>;
  running: Partial<Record<string, boolean>>;
  errors: Partial<Record<string, string>>;
  onRun: (strategy: string) => void;
  onToggle: (strategy: string) => void;
  onReloadSkeleton: () => void;
  selectedSegment: number | null;
  setSelectedSegment: (n: number | null) => void;
}): JSX.Element {
  return (
    <>
      <section class="panel enrich-bar">
        <button class="toggle-pill toggle-off-empty reload-skel" onClick={props.onReloadSkeleton} title="Re-run the skeleton/first-pass detection from scratch.">
          <span class="toggle-mark">↻</span>
          <span class="toggle-label">Reload skeleton</span>
        </button>
        <span class="enrich-label">Synthesis sources</span>
        <For each={ARG_STRATEGIES.filter((s) => s.id !== 'synthesize')}>{(s) => {
          const runKey = `arg:${s.id}`;
          return (
            <EnrichmentToggle
              id={s.id}
              label={s.label}
              desc={s.desc}
              cached={props.enrichments[s.id] !== undefined}
              included={props.included.has(s.id)}
              running={!!props.running[runKey]}
              error={props.errors[runKey]}
              onClick={() => props.onToggle(s.id)}
            />
          );
        }}</For>
        <Show when={props.running['arg:synthesize']}>
          <span class="enrich-status">synthesizing…</span>
        </Show>
        <Show when={props.errors['arg:synthesize']}>
          <span class="enrich-btn-err">synth err: {props.errors['arg:synthesize']}</span>
        </Show>
        <Show when={(props.enrichments['synthesize']?._warnings?.length ?? 0) > 0}>
          <details class="synth-warnings">
            <summary>{props.enrichments['synthesize']!._warnings!.length} section(s) failed</summary>
            <ul>
              <For each={props.enrichments['synthesize']!._warnings}>{(w) => <li>{w}</li>}</For>
            </ul>
          </details>
        </Show>
      </section>

      <Show when={props.skeleton.loading}><p class="loading">Loading skeleton…</p></Show>

      {/* Title + Summary (daf-level) — always visible once any data exists. */}
      <Show when={props.skeleton() || props.merged}>
        <section class="panel arg-header">
          <h2 class="arg-title">{props.tractate} {props.page}</h2>
          <Show when={props.merged}>
            {(m) => (
              <>
                <p class="daf-summary"><Hebraized text={m().summary} /></p>
                <ProvenanceBadge strategies={argDafSummaryProvenance(props.enrichments)} firstPass="skeleton" />
              </>
            )}
          </Show>
          <Show when={!props.merged && props.skeleton()}>
            {(s) => (
              <>
                <p class="daf-summary"><Hebraized text={s().summary} /></p>
                <ProvenanceBadge strategies={[]} firstPass="skeleton" />
              </>
            )}
          </Show>
        </section>
      </Show>

      {/* Sections list. Falls back to skeleton-only rendering when no enrichment has run. */}
      <Show when={!props.merged && props.skeleton()}>
        {(s) => (
          <section class="panel">
            <h3 class="arg-section-head">Sections</h3>
            <For each={s().sections}>{(sec, i) => {
              const anchor = rangeAnchor(sec);
              const highlighted = () => props.selectedSegment != null && anchorMatches(anchor, props.selectedSegment);
              return (
                <div
                  class="card"
                  classList={{ 'card-highlighted': highlighted() }}
                  onClick={() => anchor.segmentIdx !== undefined && props.setSelectedSegment(anchor.segmentIdx)}
                >
                  <div class="card-head">
                    <span class="card-num">§{i() + 1}</span>
                    <span class="card-title">{sec.title}</span>
                  </div>
                  <Show when={sec.rabbiNames.length > 0}>
                    <div class="card-who">{sec.rabbiNames.join(', ')}</div>
                  </Show>
                  <p class="card-summary"><Hebraized text={sec.summary} /></p>
                  <ProvenanceBadge strategies={[]} firstPass="skeleton" />
                  <ArgumentRawEnrichments
                    title={sec.title}
                    enrichments={props.enrichments}
                    running={props.running}
                    errors={props.errors}
                    onRun={props.onRun}
                  />
                </div>
              );
            }}</For>
          </section>
        )}
      </Show>

      <Show when={props.merged}>
        {(m) => (
          <section class="panel">
            <h3 class="arg-section-head">Sections</h3>
            <For each={m().sections}>{(sec, i) => (
              <ArgumentSectionCard
                sec={sec}
                idx={i()}
                enrichments={props.enrichments}
                running={props.running}
                errors={props.errors}
                onRun={props.onRun}
                selectedSegment={props.selectedSegment}
                setSelectedSegment={props.setSelectedSegment}
              />
            )}</For>
          </section>
        )}
      </Show>
    </>
  );
}

function ArgumentRawEnrichments(props: {
  title: string;
  enrichments: Partial<Record<string, EnrichedArgumentAnalysis>>;
  running: Partial<Record<string, boolean>>;
  errors: Partial<Record<string, string>>;
  onRun: (strategy: string) => void;
}): JSX.Element {
  return (
    <details class="strat-expand" onClick={(e) => e.stopPropagation()}>
      <summary onClick={(e) => e.stopPropagation()}>raw enrichments</summary>
      <div class="strat-expand-body">
        <For each={ARG_STRATEGIES}>{(s) => (
          <StrategyRow
            id={s.id}
            label={s.label}
            desc={s.desc}
            data={sliceArgumentForSection(s.id, props.enrichments[s.id], props.title)}
            running={!!props.running[`arg:${s.id}`]}
            error={props.errors[`arg:${s.id}`]}
            onRun={() => props.onRun(s.id)}
          />
        )}</For>
      </div>
    </details>
  );
}

function ArgumentSectionCard(props: {
  sec: EnrichedArgumentSection;
  idx: number;
  enrichments: Partial<Record<string, EnrichedArgumentAnalysis>>;
  running: Partial<Record<string, boolean>>;
  errors: Partial<Record<string, string>>;
  onRun: (strategy: string) => void;
  selectedSegment: number | null;
  setSelectedSegment: (n: number | null) => void;
}): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const sec = () => props.sec;
  const hasSectionDetail = () => !!(
    (sec().references && sec().references!.length > 0)
    || (sec().parallels && sec().parallels!.length > 0)
    || sec().difficulty
  );
  const anchor = () => rangeAnchor(sec());
  const highlighted = () => props.selectedSegment != null && anchorMatches(anchor(), props.selectedSegment);
  return (
    <div
      class="card"
      classList={{ 'card-highlighted': highlighted() }}
      onClick={() => {
        const a = anchor();
        if (a.segmentIdx !== undefined) props.setSelectedSegment(a.segmentIdx);
      }}
    >
      <div class="card-head">
        <span class="card-num">§{props.idx + 1}</span>
        <span class="card-title">{sec().title}</span>
      </div>
      <Show when={sec().rabbis && sec().rabbis.length > 0}>
        <div class="card-who">{sec().rabbis.map(r => r.name).join(', ')}</div>
      </Show>
      <Show
        when={sec().synthesize?.explanation}
        fallback={
          <>
            <p class="card-summary"><Hebraized text={sec().summary} /></p>
            <ProvenanceBadge
              strategies={argSectionSummaryProvenance(props.enrichments, sec().title)}
              firstPass="skeleton"
            />
          </>
        }
      >
        <p class="card-summary"><Hebraized text={sec().synthesize!.explanation!} /></p>
        <ProvenanceBadge
          strategies={sec().synthesize?.groundedIn ?? []}
          firstPass={(sec().synthesize?.groundedIn ?? []).length === 0 ? 'synthesize (no sources)' : undefined}
        />
      </Show>

      <Show when={sec().biggerPicture?.explanation}>
        <div class="enrich-section"><span class="enrich-section-label">Bigger picture</span>
          <p class="enrich-row" style="line-height: 1.5;"><Hebraized text={sec().biggerPicture!.explanation!} /></p>
          <ProvenanceBadge strategies={['bigger-picture']} />
        </div>
      </Show>

      <Show when={sec().background?.explanation}>
        <div class="enrich-section"><span class="enrich-section-label">Background</span>
          <p class="enrich-row" style="line-height: 1.5;"><Hebraized text={sec().background!.explanation!} /></p>
          <ProvenanceBadge strategies={['background']} />
        </div>
      </Show>

      <Show when={sec().commentaries && sec().commentaries!.length > 0}>
        <div class="enrich-section"><span class="enrich-section-label">Commentaries</span>
          <For each={sec().commentaries!}>{(c) => (
            <div class="enrich-row">
              <span class="enrich-src">{c.source}</span>
              <Show when={c.ref}><span class="enrich-ref"> [{c.ref}]</span></Show>
              <span class="enrich-txt"> — {c.question}</span>
            </div>
          )}</For>
          <ProvenanceBadge strategies={['commentaries']} />
        </div>
      </Show>

      {/* Per-rabbi sub-cards intentionally omitted — sage detail lives in
          the People tab. Argument cards focus on the flow of the section. */}

      <Show when={hasSectionDetail()}>
        <div class="section-more">
          <button class="more-btn" onClick={(e) => { e.stopPropagation(); setOpen(!open()); }}>{open() ? '−' : '…'}</button>
        </div>
        <Show when={open()}>
          <div class="detail">
            <Show when={sec().references && sec().references!.length > 0}>
              <div class="d-row"><span class="d-label">Pesukim</span>
                <div class="d-body d-wrap">
                  <For each={sec().references!}>{(ref) => <span class="d-ref" title={ref.hebrewQuote || ref.ref}>{ref.hebrewRef || ref.ref}</span>}</For>
                  <ProvenanceBadge strategies={['references']} />
                </div>
              </div>
            </Show>
            <Show when={sec().parallels && sec().parallels!.length > 0}>
              <div class="d-row"><span class="d-label">See also</span>
                <div class="d-body d-wrap">
                  <For each={sec().parallels!}>{(p) => <span class="d-parallel">{p}</span>}</For>
                  <ProvenanceBadge strategies={['parallels']} />
                </div>
              </div>
            </Show>
            <Show when={sec().difficulty}>
              <div class="d-row"><span class="d-label">Difficulty</span>
                <div class="d-body">
                  <span class="d-stars">{'★'.repeat(sec().difficulty!.score)}{'☆'.repeat(5 - sec().difficulty!.score)}</span>
                  <span class="d-diff-reason"> {sec().difficulty!.reason}</span>
                  <ProvenanceBadge strategies={['difficulty']} />
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </Show>

      <ArgumentRawEnrichments
        title={sec().title}
        enrichments={props.enrichments}
        running={props.running}
        errors={props.errors}
        onRun={props.onRun}
      />
    </div>
  );
}

function RabbiSubcard(props: { rabbi: EnrichedRabbi }): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const r = () => props.rabbi;
  const hasDetail = () => !!(
    r().opinionStart || r().opinionEnd
    || (r().agreesWith && r().agreesWith!.length > 0)
    || (r().disagreesWith && r().disagreesWith!.length > 0)
    || r().location
  );
  return (
    <div class="sub-card">
      <div class="sub-head">
        <span class="sub-name">{r().name}</span>
        <Show when={r().nameHe}><span class="sub-he"> · {r().nameHe}</span></Show>
        <Show when={r().period}><span class="sub-era">{r().period!.replace(/,.*$/, '')}</span></Show>
      </div>
      <Show when={r().role}><div class="sub-role">{r().role}</div></Show>
      <Show when={hasDetail()}>
        <button class="sub-toggle" onClick={(e) => { e.stopPropagation(); setOpen(!open()); }}>{open() ? '−' : '…'}</button>
        <Show when={open()}>
          <div class="sub-detail">
            <Show when={r().opinionStart || r().opinionEnd}>
              <div class="sub-span">
                <Show when={r().opinionStart}><span>{r().opinionStart}</span></Show>
                <Show when={r().opinionStart && r().opinionEnd}><span class="sub-span-gap">&nbsp;…&nbsp;</span></Show>
                <Show when={r().opinionEnd}><span>{r().opinionEnd}</span></Show>
              </div>
            </Show>
            <Show when={r().agreesWith && r().agreesWith!.length > 0}>
              <div class="sub-rel"><span class="plus">+</span><span class="prep"> with </span>{r().agreesWith!.join(', ')}</div>
            </Show>
            <Show when={r().disagreesWith && r().disagreesWith!.length > 0}>
              <div class="sub-rel"><span class="minus">−</span><span class="prep"> vs </span>{r().disagreesWith!.join(', ')}</div>
            </Show>
            <Show when={r().location}><div class="sub-loc">{r().location}</div></Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}

const HALACHA_STRATEGIES = [
  { id: 'modern-authorities',  label: 'Modern authorities',  desc: 'Mishnah Berurah, Peninei Halakhah, Aruch HaShulchan, Igrot Moshe, etc.' },
  { id: 'rishonim-condensed',  label: 'Rishonim condensed',  desc: "One sentence per Rishon's position (Rashba, Ritva, Ramban, Meiri, Rosh, Maharsha)." },
  { id: 'sa-commentary-walk',  label: 'SA commentary',       desc: 'Shulchan Aruch commentary chain per topic.' },
  { id: 'synthesize',          label: 'Synthesize',          desc: 'Per-topic gist combining rulings + rishonim + sa-commentary + modern-authorities. Auto-refires on every other strategy.' },
] as const;

function sliceHalachaForTopic(strategy: string, topic: HalachaTopic | undefined): unknown {
  if (!topic) return null;
  switch (strategy) {
    case 'modern-authorities':  return topic.modernAuthorities ?? null;
    case 'rishonim-condensed':  return topic.rishonimNotes ?? null;
    case 'sa-commentary-walk':  return topic.saCommentaryNotes ?? null;
    case 'synthesize':          return topic.synthesis ?? null;
    default: return null;
  }
}

function HalachaTab(props: {
  halacha: Resource<HalachaResult | null>;
  included: Set<string>;
  running: Partial<Record<string, boolean>>;
  errors: Partial<Record<string, string>>;
  onEnrich: (strategy: HalachaEnrichStrategy) => void;
  onToggle: (strategy: HalachaEnrichStrategy) => void;
  onReloadSkeleton: () => void;
  selectedSegment: number | null;
  setSelectedSegment: (n: number | null) => void;
}): JSX.Element {
  const halachaCached = (strategy: HalachaEnrichStrategy): boolean => {
    const h = props.halacha();
    if (!h) return false;
    return h.topics.some((t) => sliceHalachaForTopic(strategy, t) !== null);
  };
  return (
    <>
      <section class="panel enrich-bar">
        <button class="toggle-pill toggle-off-empty reload-skel" onClick={props.onReloadSkeleton} title="Re-run halacha first-pass detection from scratch.">
          <span class="toggle-mark">↻</span>
          <span class="toggle-label">Reload skeleton</span>
        </button>
        <span class="enrich-label">Synthesis sources</span>
        <For each={HALACHA_STRATEGIES.filter((s) => s.id !== 'synthesize')}>{(s) => {
          const runKey = `halacha:${s.id}`;
          return (
            <EnrichmentToggle
              id={s.id}
              label={s.label}
              desc={s.desc}
              cached={halachaCached(s.id as HalachaEnrichStrategy)}
              included={props.included.has(s.id)}
              running={!!props.running[runKey]}
              error={props.errors[runKey]}
              onClick={() => props.onToggle(s.id as HalachaEnrichStrategy)}
            />
          );
        }}</For>
        <Show when={props.running['halacha:synthesize']}>
          <span class="enrich-status">synthesizing…</span>
        </Show>
        <Show when={props.errors['halacha:synthesize']}>
          <span class="enrich-btn-err">synth err: {props.errors['halacha:synthesize']}</span>
        </Show>
      </section>
      <Show when={props.halacha.loading}><p class="loading">Loading halacha…</p></Show>
      <Show when={!props.halacha.loading && props.halacha.error}><p class="err-msg">{String(props.halacha.error)}</p></Show>
      <Show when={props.halacha() && props.halacha()!.topics.length === 0}>
        <section class="panel empty">No halacha topics on this daf.</section>
      </Show>
      <Show when={props.halacha() && props.halacha()!.topics.length > 0}>
        <section class="panel">
          <For each={props.halacha()!.topics}>{(t, i) => (
            <HalachaCard
              topic={t}
              idx={i()}
              running={props.running}
              errors={props.errors}
              onEnrich={props.onEnrich}
              selectedSegment={props.selectedSegment}
              setSelectedSegment={props.setSelectedSegment}
            />
          )}</For>
        </section>
      </Show>
    </>
  );
}

function HalachaCard(props: {
  topic: HalachaTopic;
  idx: number;
  running: Partial<Record<string, boolean>>;
  errors: Partial<Record<string, string>>;
  onEnrich: (strategy: HalachaEnrichStrategy) => void;
  selectedSegment: number | null;
  setSelectedSegment: (n: number | null) => void;
}): JSX.Element {
  const t = () => props.topic;
  const rulings = () => {
    const out: Array<{ code: string; ref: string; summary: string }> = [];
    if (t().rulings.mishnehTorah) out.push({ code: 'Rambam MT', ref: t().rulings.mishnehTorah!.ref, summary: t().rulings.mishnehTorah!.summary });
    if (t().rulings.shulchanAruch) out.push({ code: 'Shulchan Aruch', ref: t().rulings.shulchanAruch!.ref, summary: t().rulings.shulchanAruch!.summary });
    if (t().rulings.rema) out.push({ code: 'Rema', ref: t().rulings.rema!.ref, summary: t().rulings.rema!.summary });
    return out;
  };
  const hasMore = () => !!(t().modernAuthorities && t().modernAuthorities!.length > 0)
    || !!(t().rishonimNotes && t().rishonimNotes!.length > 0)
    || !!(t().saCommentaryNotes && t().saCommentaryNotes!.length > 0)
    || !!t().excerpt;
  const anchor = () => rangeAnchor(t());
  const highlighted = () => props.selectedSegment != null && anchorMatches(anchor(), props.selectedSegment);
  return (
    <div
      class="card"
      classList={{ 'card-highlighted': highlighted() }}
      onClick={() => {
        const a = anchor();
        if (a.segmentIdx !== undefined) props.setSelectedSegment(a.segmentIdx);
      }}
    >
      <div class="card-head">
        <span class="card-num">§{props.idx + 1}</span>
        <span class="card-title">
          {t().topic}
          <Show when={t().topicHe}><span class="card-title-he"> · {t().topicHe}</span></Show>
        </span>
      </div>
      <Show when={t().synthesis?.explanation}>
        <p class="card-summary"><Hebraized text={t().synthesis!.explanation} /></p>
        <ProvenanceBadge
          strategies={t().synthesis?.groundedIn ?? []}
          firstPass={(t().synthesis?.groundedIn ?? []).length === 0 ? 'synthesize (no sources)' : undefined}
        />
      </Show>

      <Show when={rulings().length > 0}>
        <ul class="ruling-list">
          <For each={rulings()}>{(rul) => (
            <li class="ruling">
              <span class="ruling-code">{rul.code}</span>
              <span class="ruling-ref">{rul.ref}</span>
              <div class="ruling-summary"><Hebraized text={rul.summary} /></div>
            </li>
          )}</For>
        </ul>
        <ProvenanceBadge strategies={[]} firstPass="halacha first-pass" />
      </Show>

      {/* Enrichment outputs — always visible when populated (no collapse) */}
      <Show when={t().rishonimNotes && t().rishonimNotes!.length > 0}>
        <div class="enrich-section"><span class="enrich-section-label">Rishonim</span>
          <For each={t().rishonimNotes!}>{(n) => (
            <div class="enrich-row">
              <span class="enrich-src">{n.rishon}</span>
              <span class="enrich-txt"> — {n.note}</span>
            </div>
          )}</For>
          <ProvenanceBadge strategies={['rishonim-condensed']} />
        </div>
      </Show>
      <Show when={t().saCommentaryNotes && t().saCommentaryNotes!.length > 0}>
        <div class="enrich-section"><span class="enrich-section-label">SA commentary</span>
          <For each={t().saCommentaryNotes!}>{(n) => (
            <div class="enrich-row">
              <span class="enrich-src">{n.commentator}</span>
              <span class="enrich-txt"> — {n.note}</span>
              <Show when={n.ref}><span class="enrich-ref"> [{n.ref}]</span></Show>
            </div>
          )}</For>
          <ProvenanceBadge strategies={['sa-commentary-walk']} />
        </div>
      </Show>
      <Show when={t().modernAuthorities && t().modernAuthorities!.length > 0}>
        <div class="enrich-section"><span class="enrich-section-label">Modern authorities</span>
          <For each={t().modernAuthorities!}>{(a) => (
            <div class="enrich-row">
              <span class="enrich-src">{a.source}</span>
              <span class="enrich-txt"> — {a.summary}</span>
            </div>
          )}</For>
          <ProvenanceBadge strategies={['modern-authorities']} />
        </div>
      </Show>

      <details class="strat-expand" onClick={(e) => e.stopPropagation()}>
        <summary onClick={(e) => e.stopPropagation()}>raw enrichments</summary>
        <div class="strat-expand-body">
          <For each={HALACHA_STRATEGIES}>{(s) => (
            <StrategyRow
              id={s.id}
              label={s.label}
              desc={s.desc}
              data={sliceHalachaForTopic(s.id, t())}
              running={!!props.running[`halacha:${s.id}`]}
              error={props.errors[`halacha:${s.id}`]}
              onRun={() => props.onEnrich(s.id as HalachaEnrichStrategy)}
            />
          )}</For>
        </div>
      </details>
    </div>
  );
}

const AGGADATA_STRATEGIES = [
  { id: 'parallels',          label: 'Parallels',          desc: 'Parallel narratives in Bavli/Yerushalmi/Midrash for this story.' },
  { id: 'historical-context', label: 'Historical context', desc: 'Era and surrounding circumstances when relevant.' },
  { id: 'synthesize',         label: 'Synthesize',         desc: 'Per-story gist combining parallels + historical-context. Auto-refires on every other strategy.' },
] as const;

function sliceAggadataForStory(strategy: string, story: AggadataStory | undefined): unknown {
  if (!story) return null;
  switch (strategy) {
    case 'parallels':          return story.parallels ?? null;
    case 'historical-context': return story.historicalContext ?? null;
    case 'synthesize':         return story.synthesis ?? null;
    default: return null;
  }
}

function AggadataTab(props: {
  aggadata: Resource<AggadataResult | null>;
  included: Set<string>;
  running: Partial<Record<string, boolean>>;
  errors: Partial<Record<string, string>>;
  onEnrich: (strategy: AggadataEnrichStrategy) => void;
  onToggle: (strategy: AggadataEnrichStrategy) => void;
  onReloadSkeleton: () => void;
  selectedSegment: number | null;
  setSelectedSegment: (n: number | null) => void;
}): JSX.Element {
  const aggadataCached = (strategy: AggadataEnrichStrategy): boolean => {
    const a = props.aggadata();
    if (!a) return false;
    return a.stories.some((s) => sliceAggadataForStory(strategy, s) !== null);
  };
  return (
    <>
      <section class="panel enrich-bar">
        <button class="toggle-pill toggle-off-empty reload-skel" onClick={props.onReloadSkeleton} title="Re-run aggadata first-pass detection from scratch.">
          <span class="toggle-mark">↻</span>
          <span class="toggle-label">Reload skeleton</span>
        </button>
        <span class="enrich-label">Synthesis sources</span>
        <For each={AGGADATA_STRATEGIES.filter((s) => s.id !== 'synthesize')}>{(s) => {
          const runKey = `aggadata:${s.id}`;
          return (
            <EnrichmentToggle
              id={s.id}
              label={s.label}
              desc={s.desc}
              cached={aggadataCached(s.id as AggadataEnrichStrategy)}
              included={props.included.has(s.id)}
              running={!!props.running[runKey]}
              error={props.errors[runKey]}
              onClick={() => props.onToggle(s.id as AggadataEnrichStrategy)}
            />
          );
        }}</For>
        <Show when={props.running['aggadata:synthesize']}>
          <span class="enrich-status">synthesizing…</span>
        </Show>
        <Show when={props.errors['aggadata:synthesize']}>
          <span class="enrich-btn-err">synth err: {props.errors['aggadata:synthesize']}</span>
        </Show>
      </section>
      <Show when={props.aggadata.loading}><p class="loading">Loading aggadata…</p></Show>
      <Show when={!props.aggadata.loading && props.aggadata.error}><p class="err-msg">{String(props.aggadata.error)}</p></Show>
      <Show when={props.aggadata() && props.aggadata()!.stories.length === 0}>
        <section class="panel empty">No aggadic stories on this daf.</section>
      </Show>
      <Show when={props.aggadata() && props.aggadata()!.stories.length > 0}>
        <section class="panel">
          <For each={props.aggadata()!.stories}>{(s, i) => (
            <AggadataCard
              story={s}
              idx={i()}
              running={props.running}
              errors={props.errors}
              onEnrich={props.onEnrich}
              selectedSegment={props.selectedSegment}
              setSelectedSegment={props.setSelectedSegment}
            />
          )}</For>
        </section>
      </Show>
    </>
  );
}

function AggadataCard(props: {
  story: AggadataStory;
  idx: number;
  running: Partial<Record<string, boolean>>;
  errors: Partial<Record<string, string>>;
  onEnrich: (strategy: AggadataEnrichStrategy) => void;
  selectedSegment: number | null;
  setSelectedSegment: (n: number | null) => void;
}): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const s = () => props.story;
  const hasMore = () => !!((s().parallels && s().parallels!.length > 0) || s().historicalContext);
  const anchor = () => rangeAnchor(s());
  const highlighted = () => props.selectedSegment != null && anchorMatches(anchor(), props.selectedSegment);
  return (
    <div
      class="card"
      classList={{ 'card-highlighted': highlighted() }}
      onClick={() => {
        const a = anchor();
        if (a.segmentIdx !== undefined) props.setSelectedSegment(a.segmentIdx);
      }}
    >
      <div class="card-head">
        <span class="card-num">§{props.idx + 1}</span>
        <span class="card-title">
          {s().title}
          <Show when={s().titleHe}><span class="card-title-he"> · {s().titleHe}</span></Show>
        </span>
        <Show when={s().theme}><span class="theme-tag">{s().theme}</span></Show>
      </div>
      <Show
        when={s().synthesis?.explanation}
        fallback={
          <>
            <p class="card-summary"><Hebraized text={s().summary} /></p>
            <ProvenanceBadge strategies={[]} firstPass="aggadata first-pass" />
          </>
        }
      >
        <p class="card-summary"><Hebraized text={s().synthesis!.explanation} /></p>
        <ProvenanceBadge
          strategies={s().synthesis?.groundedIn ?? []}
          firstPass={(s().synthesis?.groundedIn ?? []).length === 0 ? 'synthesize (no sources)' : undefined}
        />
      </Show>

      <Show when={hasMore()}>
        <div class="section-more">
          <button class="more-btn" onClick={(e) => { e.stopPropagation(); setOpen(!open()); }}>{open() ? '−' : '…'}</button>
        </div>
        <Show when={open()}>
          <div class="detail">
            <Show when={s().parallels && s().parallels!.length > 0}>
              <div class="d-row"><span class="d-label">Parallels</span>
                <div class="d-body d-wrap">
                  <For each={s().parallels!}>{(p) => <span class="d-parallel">{p}</span>}</For>
                  <ProvenanceBadge strategies={['parallels']} />
                </div>
              </div>
            </Show>
            <Show when={s().historicalContext}>
              <div class="d-row"><span class="d-label">Historical</span>
                <div class="d-body">
                  <div class="hist-era">{s().historicalContext!.era}</div>
                  <div class="hist-ctx">{s().historicalContext!.context}</div>
                  <ProvenanceBadge strategies={['historical-context']} />
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </Show>

      <details class="strat-expand" onClick={(e) => e.stopPropagation()}>
        <summary onClick={(e) => e.stopPropagation()}>raw enrichments</summary>
        <div class="strat-expand-body">
          <For each={AGGADATA_STRATEGIES}>{(strat) => (
            <StrategyRow
              id={strat.id}
              label={strat.label}
              desc={strat.desc}
              data={sliceAggadataForStory(strat.id, s())}
              running={!!props.running[`aggadata:${strat.id}`]}
              error={props.errors[`aggadata:${strat.id}`]}
              onRun={() => props.onEnrich(strat.id as AggadataEnrichStrategy)}
            />
          )}</For>
        </div>
      </details>
    </div>
  );
}

// ---- styles ---------------------------------------------------------------

const PAGE_CSS = `
.enrichment-page { font-family: system-ui, -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 1rem; color: #1e293b; }
.enrichment-page .text-toggle { margin-left: auto; font-size: 11.5px; color: #64748b; padding: 0.25rem 0.55rem; }
.enrichment-page .text-toggle:hover { background: #f1f5f9; color: #1e293b; }

.enr-split { display: block; }
.enr-split-open { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 0.75rem; max-width: 1500px; margin: 0 auto 0 -200px; }
@media (max-width: 1200px) { .enr-split-open { grid-template-columns: minmax(0, 1fr); margin: 0; } }
.enr-text-pane { min-width: 0; position: sticky; top: 1rem; align-self: flex-start; max-height: calc(100vh - 100px); overflow-y: auto; }
.enr-tabs-pane { min-width: 0; }
.enr-tabs-pane .panel:last-child { margin-bottom: 0; }
.card-highlighted { outline: 2px solid #fbbf24; outline-offset: 2px; }
.enrichment-page h1 { margin: 0 0 0.3rem; font-size: 22px; }
.enrichment-page .lead { color: #475569; margin: 0 0 1rem; font-size: 13px; }
.enrichment-page .panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 1rem; }
.enrichment-page .empty { text-align: center; color: #94a3b8; padding: 2rem; }
.enrichment-page .controls { display: flex; gap: 0.5rem; align-items: center; padding: 0.6rem 0.8rem; flex-wrap: wrap; }
.enrichment-page .controls label { font-weight: 500; font-size: 12px; color: #475569; margin-right: 0.2rem; }
.enrichment-page select, .enrichment-page input[type="text"] { padding: 0.3rem 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; }
.enrichment-page button { padding: 0.3rem 0.7rem; border: 1px solid #cbd5e1; background: white; border-radius: 4px; cursor: pointer; font-size: 13px; color: #1e293b; }
.enrichment-page button:hover:not(:disabled) { background: #f1f5f9; }
.enrichment-page button:disabled { opacity: 0.5; cursor: not-allowed; }
.enrichment-page button.primary { background: #1e293b; color: white; border-color: #0f172a; }
.enrichment-page button.primary:hover:not(:disabled) { background: #0f172a; }

.enrichment-page .tabs { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; border-bottom: 1px solid #e5e7eb; flex-wrap: wrap; padding: 0; }
.enrichment-page .tab-wrap { display: inline-flex; align-items: center; margin-bottom: -1px; border-bottom: 2px solid transparent; gap: 0; }
.enrichment-page .tab-wrap-active { border-bottom-color: #1e293b; }
.enrichment-page .tab-wrap .tab { border: none; background: transparent; padding: 0.45rem 0.25rem 0.45rem 0; font-size: 13.5px; color: #64748b; border-radius: 0; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; line-height: 1.2; }
.enrichment-page .tab-wrap .tab:hover { color: #1e293b; background: transparent; }
.enrichment-page .tab-active { color: #1e293b; font-weight: 600; }
.enrichment-page .tab-count { background: #e2e8f0; color: #475569; font-size: 10.5px; padding: 1px 6px; border-radius: 10px; font-weight: 500; }
.enrichment-page .tab-wrap .tab-refresh { border: none; background: transparent; padding: 0.45rem 0 0.45rem 0; color: #cbd5e1; font-size: 11px; cursor: pointer; line-height: 1; border-radius: 0; opacity: 0; transition: opacity 0.12s, color 0.12s; }
.enrichment-page .tab-wrap:hover .tab-refresh,
.enrichment-page .tab-wrap-active .tab-refresh { opacity: 1; }
.enrichment-page .tab-wrap .tab-refresh:hover { color: #1e293b; background: transparent; }

.enrich-bar { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; padding: 0.5rem 0.8rem; background: #f8fafc; }
.enrich-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-right: 0.3rem; }
.enrich-btn { background: white; border: 1px solid #cbd5e1; font-size: 12px; padding: 0.25rem 0.6rem; }
.enrich-btn-cached { background: #f0fdf4; border-color: #86efac; color: #166534; }
.enrich-btn-cached:hover:not(:disabled) { background: #dcfce7; }
.enrich-btn-err { color: #b91c1c; margin-left: 0.35rem; font-size: 10px; }

/* "Reload skeleton" pill — reuses .toggle-pill / .toggle-off-empty for
 * visual parity with the EnrichmentToggle row next to it. */
.reload-skel { margin-right: 0.3rem; }
.enrich-status { font-size: 11px; color: #92400e; font-style: italic; margin-left: 0.4rem; }

.synth-status-bar { position: sticky; top: 0; z-index: 10; display: flex; gap: 0.5rem; align-items: center; padding: 0.45rem 0.85rem; margin: 0 0 0.6rem; background: linear-gradient(90deg, #fef3c7, #fde68a); border: 1px solid #fcd34d; border-radius: 4px; font-size: 11.5px; color: #92400e; box-shadow: 0 2px 6px rgba(0,0,0,0.04); flex-wrap: wrap; }
.synth-status-spinner { width: 12px; height: 12px; border: 2px solid #fcd34d; border-top-color: #92400e; border-radius: 50%; animation: synth-spin 0.8s linear infinite; flex-shrink: 0; }
.synth-status-tag { font-family: ui-monospace, Menlo, monospace; font-size: 11px; padding: 1px 7px; background: rgba(255,255,255,0.6); border-radius: 10px; color: #78350f; }
.synth-status-sep { color: #d97706; }
@keyframes synth-spin { to { transform: rotate(360deg); } }
.synth-warnings { font-size: 10.5px; margin-left: 0.4rem; }
.synth-warnings > summary { color: #b91c1c; cursor: pointer; }
.synth-warnings ul { margin: 0.3rem 0 0 0; padding-left: 1.2rem; color: #7f1d1d; }
.synth-warnings li { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; line-height: 1.4; }

.daf-summary { font-size: 13.5px; color: #475569; margin: 0 0 0.4rem; line-height: 1.5; font-style: italic; }
.arg-header { padding: 0.85rem 1rem 0.75rem; }
.arg-title { margin: 0 0 0.4rem; font-size: 16px; font-weight: 600; color: #1e293b; letter-spacing: -0.01em; }
.arg-section-head { margin: 0 0 0.6rem; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }

.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; padding: 0.6rem 0.75rem; margin-bottom: 0.5rem; position: relative; }
.card-head { display: flex; align-items: baseline; gap: 0.4rem; margin-bottom: 0.25rem; flex-wrap: wrap; }
.card-num { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #94a3b8; }
.card-title { font-weight: 600; font-size: 14px; color: #1e293b; flex: 1; }
.card-title-he { font-family: Arial Hebrew, David, serif; color: #64748b; font-weight: 500; }
.card-who { font-size: 12px; color: #64748b; margin-bottom: 0.35rem; }
.card-summary { font-size: 13px; color: #334155; margin: 0 0 0.25rem; line-height: 1.5; }

.theme-tag { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; background: #e2e8f0; color: #475569; padding: 1px 7px; border-radius: 10px; font-weight: 500; }

.ruling-list { list-style: none; padding: 0; margin: 0.35rem 0 0; display: flex; flex-direction: column; gap: 0.3rem; }
.ruling { padding: 0.3rem 0.4rem; background: #fafafa; border-radius: 3px; font-size: 12px; }
.ruling-code { font-weight: 600; color: #1e293b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; margin-right: 0.4rem; }
.ruling-ref { font-family: ui-monospace, Menlo, monospace; color: #475569; font-size: 11.5px; }
.ruling-summary { color: #475569; font-size: 12px; margin-top: 0.15rem; line-height: 1.45; }

.sub-cards { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.5rem; }
.sub-card { background: #fafafa; border: 1px solid #e5e7eb; border-radius: 3px; padding: 0.35rem 0.55rem; position: relative; }
.sub-head { display: flex; align-items: baseline; gap: 0.3rem; flex-wrap: wrap; padding-right: 1.5rem; }
.sub-name { font-weight: 600; color: #1e293b; font-size: 12.5px; }
.sub-he { font-family: Arial Hebrew, David, serif; color: #64748b; font-weight: 500; }
.sub-era { margin-left: auto; font-size: 10px; color: #94a3b8; }
.sub-role { font-size: 11.5px; color: #475569; margin-top: 0.15rem; line-height: 1.4; padding-right: 1.5rem; }
.sub-toggle { position: absolute; bottom: 0.15rem; right: 0.35rem; border: none; background: transparent; color: #cbd5e1; font-size: 13px; cursor: pointer; padding: 0.05rem 0.3rem; line-height: 1; }
.sub-toggle:hover { color: #475569; }
.sub-detail { margin-top: 0.35rem; padding-top: 0.3rem; border-top: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 0.25rem; }
.sub-span { font-family: Arial Hebrew, David, serif; direction: rtl; text-align: right; font-size: 12.5px; color: #475569; padding: 0.15rem 0.35rem; background: #fff; border-radius: 2px; }
.sub-span-gap { color: #94a3b8; font-family: system-ui; }
.sub-rel { font-size: 11px; color: #334155; }
.sub-loc { font-size: 10.5px; color: #94a3b8; font-style: italic; }

.section-more { display: flex; justify-content: center; margin-top: 0.1rem; }
.enrichment-page .more-btn { border: none; background: transparent; color: #cbd5e1; font-size: 16px; padding: 0.15rem 0.6rem; line-height: 1; letter-spacing: 2px; border-radius: 0; }
.enrichment-page .more-btn:hover { color: #64748b; background: transparent; }
.enrichment-page .sub-toggle { border: none; background: transparent; border-radius: 0; }
.enrichment-page .sub-toggle:hover { background: transparent; }

.detail { padding: 0.5rem 0.25rem 0; display: flex; flex-direction: column; gap: 0.4rem; }
.d-row { display: flex; gap: 0.5rem; align-items: baseline; }
.d-label { font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; width: 68px; flex-shrink: 0; }
.d-body { flex: 1; font-size: 11.5px; color: #334155; display: flex; flex-direction: column; gap: 0.2rem; }
.d-wrap { flex-direction: row; flex-wrap: wrap; gap: 0.35rem; }
.d-ref { font-family: Arial Hebrew, David, serif; color: #64748b; cursor: help; }
.d-parallel { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: #64748b; background: #f1f5f9; padding: 1px 5px; border-radius: 2px; }
.d-stars { color: #64748b; margin-right: 0.35rem; letter-spacing: 0.5px; }
.d-diff-reason { color: #475569; font-style: italic; }
.d-excerpt { font-family: Arial Hebrew, David, serif; direction: rtl; text-align: right; font-size: 13px; color: #475569; padding: 0.2rem 0.4rem; background: #f8fafc; border-radius: 2px; }

.modern-row { font-size: 11.5px; line-height: 1.4; }
.modern-src { font-weight: 600; color: #1e293b; }
.modern-text { color: #475569; }

.hist-era { font-size: 10.5px; font-weight: 600; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.15rem; }
.hist-ctx { font-size: 11.5px; color: #334155; line-height: 1.45; }

.exeg-head { display: flex; gap: 0.5rem; align-items: baseline; margin-bottom: 0.2rem; }
.exeg-ref { font-size: 11.5px; font-weight: 600; color: #1e293b; }
.exeg-move { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; background: #ede9fe; color: #6d28d9; padding: 1px 6px; border-radius: 10px; }
.exeg-verse { font-family: "Mekorot Vilna", "Arial Hebrew", David, serif; font-size: 13.5px; color: #334155; padding: 0.25rem 0.45rem; background: #f8fafc; border-radius: 2px; margin-bottom: 0.25rem; line-height: 1.55; }
.exeg-body { font-size: 11.5px; color: #334155; line-height: 1.5; }

.plus { color: #16a34a; font-weight: 700; }
.minus { color: #b91c1c; font-weight: 700; }
.prep { color: #94a3b8; font-style: italic; }


.enrich-section { margin-top: 0.5rem; padding: 0.4rem 0.55rem; background: #f8fafc; border-left: 3px solid #7c3aed; border-radius: 2px; }
.enrich-section-label { display: block; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #7c3aed; margin-bottom: 0.25rem; }
.enrich-row { font-size: 12px; line-height: 1.45; margin-bottom: 0.2rem; color: #334155; }
.enrich-row:last-child { margin-bottom: 0; }
.enrich-src { font-weight: 600; color: #1e293b; }
.enrich-txt { color: #475569; }
.enrich-ref { font-family: ui-monospace, Menlo, monospace; font-size: 10px; color: #94a3b8; margin-left: 0.25rem; }

.loading, .err-msg { font-size: 13px; padding: 0.5rem 1rem; }
.err-msg { color: #b91c1c; background: #fee2e2; border-radius: 4px; }
`;

export default EnrichmentPage;
