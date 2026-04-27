/**
 * Rabbis tab in EnrichmentPage. Daf-scoped: shows only the sages who appear
 * on the currently loaded daf. Inner sub-tabs:
 *   - Bio        per-sage bio cards (from rabbi-enriched:v1)
 *   - Relations  teacher/student/family network among the daf's sages
 *   - Region     Israel/Bavel split + migration (delegates to RegionTab)
 *   - Mesorah    chain-of-tradition per sage (delegates to MesorahTab)
 *
 * Global sage browsing + enrichment (the picker for all 1.3K + compile-graph
 * buttons + per-stage Run/Refresh) lives at #sages (SagesPage).
 */
import { createEffect, createResource, createSignal, For, Show, type JSX } from 'solid-js';
import { ProvenanceBadge } from './ProvenanceBadge';
import { Hebraized } from './Hebraized';
import { EnrichmentToggle } from './EnrichmentToggle';

interface DafContextRabbi {
  slug: string | null;
  name: string;
  nameHe?: string;
  generation?: string;
  region?: string;
  places?: string[];
  bio?: string | null;
  image?: string | null;
  wiki?: string | null;
}

interface DafContextResult {
  rabbis: DafContextRabbi[];
}

interface RabbiEdge {
  slug: string | null;
  name: string;
  weight: number | null;
  source: 'sefaria' | 'llm';
}

interface UnifiedRabbi {
  slug: string;
  canonical: { en: string; he: string };
  aliases: string[];
  generation: string | null;
  region: string | null;
  academy: string | null;
  birthYear: number | null;
  deathYear: number | null;
  places: string[];
  bio: { en: string; he: string };
  prominence: number | null;
  orientation: string;
  characteristics: string[];
  primaryTeacher: string | null;
  primaryStudent: string | null;
  teachers: RabbiEdge[];
  students: RabbiEdge[];
  family: Array<RabbiEdge & { relation: string }>;
  opposed: RabbiEdge[];
  influences: RabbiEdge[];
  refs: { sefariaSlug?: string; enWiki?: string; heWiki?: string; je?: string; wikidata?: string };
  enrichedAt: string;
}

export function RabbiTab(props: {
  tractate: string;
  page: string;
  loadKey: number;
  refreshNonce?: number;
  onReloadSkeleton?: () => void;
}): JSX.Element {
  const dafKey = () => `${props.tractate}|${props.page}|${props.loadKey}|${props.refreshNonce ?? 0}`;

  const [ctx] = createResource(dafKey, async (): Promise<DafContextResult | null> => {
    if (props.loadKey === 0) return null;
    const refresh = (props.refreshNonce ?? 0) > 0 ? '?refresh=1' : '';
    const res = await fetch(`/api/daf-context/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}${refresh}`);
    if (!res.ok) return null;
    return res.json();
  });

  // Sages on this daf with a resolvable slug — those are the ones we have
  // enrichment data for.
  const sageSlugs = (): string[] => {
    const r = ctx()?.rabbis ?? [];
    return r.map((x) => x.slug).filter((s): s is string => !!s);
  };

  return (
    <>
      <style>{RABBI_TAB_CSS}</style>

      <section class="panel rabbi-tab-head">
        <div class="rabbi-tab-meta">
          <Show when={ctx.loading}><span class="loading-inline">loading sages…</span></Show>
          <Show when={ctx()}>
            <span><b>{sageSlugs().length}</b> sages on {props.tractate} {props.page}</span>
          </Show>
        </div>
        <a class="admin-link" href="#sages" target="_blank">browse all sages →</a>
      </section>

      <BioSubtab slugs={sageSlugs()} ctxRabbis={ctx()?.rabbis ?? []} tractate={props.tractate} page={props.page} onReloadSkeleton={props.onReloadSkeleton} />
    </>
  );
}

/* ---------------------- Bio sub-tab ---------------------- */

interface BioSynthesis { explanation: string; groundedIn?: string[]; generatedAt?: string }

const BIO_SOURCES = [
  { id: 'unified',     label: 'Standard bio', desc: 'The unified Sefaria+LLM biographical record.' },
  { id: 'wikidata',    label: 'Wikidata',     desc: 'Family/teacher/student QIDs + birth/death years from Wikidata.' },
  { id: 'wiki-bio',    label: 'Wikipedia',    desc: 'Full Wikipedia (en/he) page extract.' },
  { id: 'rabbi-graph', label: 'Relations',    desc: 'Bidirectional teacher↔student + family edges from the compiled graph.' },
  { id: 'daf-role',    label: 'Daf role',     desc: 'Which sections of this daf name this sage + co-occurring voices.' },
  { id: 'region',      label: 'Region',       desc: "Israel/Bavel/mixed signal + this sage's places + migration indicator (drawn from unified + the daf's region first-pass)." },
  { id: 'mesorah',     label: 'Mesorah',      desc: "This sage's chain of tradition (primaryTeacher walked back) + any explicit transmission formulas on this daf." },
] as const;

type BioSource = typeof BIO_SOURCES[number]['id'];
type SourceCache = Record<string, Record<BioSource, boolean>>;

function BioSubtab(props: { slugs: string[]; ctxRabbis: DafContextRabbi[]; tractate: string; page: string; onReloadSkeleton?: () => void }): JSX.Element {
  // Lifted state: ONE include set + ONE source-cache map for the whole daf.
  // Toggling a source applies to every sage on the daf — fetch any missing
  // underlying source records, then re-fire bio synthesis for all sages.
  const [included, setIncluded] = createSignal<Set<BioSource>>(new Set());
  const [running, setRunning]   = createSignal<Partial<Record<BioSource, boolean>>>({});
  const [errors, setErrors]     = createSignal<Partial<Record<BioSource, string>>>({});
  const [synthBumper, setSynthBumper] = createSignal(0); // bumped to fan out re-synth to BioCards
  const [synthingAll, setSynthingAll] = createSignal(false);

  // Per-slug cached-source map. Read-only probes on mount per slug populate it.
  const [sourceCache, setSourceCache] = createSignal<SourceCache>({});
  const [probedDefaults, setProbedDefaults] = createSignal(false);

  // Probe every slug for which sources are already cached. Default the
  // include set to all sources that are cached for at least one sage. This
  // makes the toggle bar reflect reality on Load (default-on for cached).
  createEffect(async () => {
    if (probedDefaults() || props.slugs.length === 0) return;
    const cache: SourceCache = {};
    const cachedAny: Set<BioSource> = new Set();
    await Promise.all(props.slugs.map(async (slug) => {
      const slugCache: Record<BioSource, boolean> = {
        unified: false, wikidata: false, 'wiki-bio': false,
        'rabbi-graph': true, 'daf-role': true, region: true, mesorah: true,
      };
      const [u, wd, wb] = await Promise.all([
        fetch(`/api/admin/rabbi-enriched/${encodeURIComponent(slug)}`).then((r) => r.ok).catch(() => false),
        fetch(`/api/admin/rabbi-wikidata/${encodeURIComponent(slug)}`).then((r) => r.ok).catch(() => false),
        fetch(`/api/admin/rabbi-wiki-bio/${encodeURIComponent(slug)}`).then((r) => r.ok).catch(() => false),
      ]);
      slugCache.unified = u;
      slugCache.wikidata = wd;
      slugCache['wiki-bio'] = wb;
      cache[slug] = slugCache;
      if (u) cachedAny.add('unified');
      if (wd) cachedAny.add('wikidata');
      if (wb) cachedAny.add('wiki-bio');
    }));
    cachedAny.add('rabbi-graph');
    cachedAny.add('daf-role');
    cachedAny.add('region');
    cachedAny.add('mesorah');
    setSourceCache(cache);
    // Default-on every source that's available somewhere.
    setIncluded(cachedAny);
    setProbedDefaults(true);
  });

  // Read-only reference sources need no per-sage fetch — they pull from
  // already-compiled blobs (rabbi-graph) or from the daf skeleton (daf-role,
  // region, mesorah). For these, "cached" is always true.
  const isReadOnlySource = (source: BioSource): boolean =>
    source === 'rabbi-graph' || source === 'daf-role' || source === 'region' || source === 'mesorah';

  const sourceIsCached = (slug: string, source: BioSource): boolean => {
    if (isReadOnlySource(source)) return true;
    return sourceCache()[slug]?.[source] === true;
  };
  const allSlugsHaveSource = (source: BioSource): boolean => {
    if (isReadOnlySource(source)) return true;
    return props.slugs.every((slug) => sourceIsCached(slug, source));
  };

  const fetchSourceForSlug = async (source: BioSource, slug: string): Promise<void> => {
    if (isReadOnlySource(source)) return;
    const path = source === 'unified'  ? 'rabbi-enrich-unified'
               : source === 'wikidata' ? 'rabbi-wikidata'
               : 'rabbi-wiki-bio';
    const r = await fetch(`/api/admin/${path}/${encodeURIComponent(slug)}`);
    if (!r.ok) {
      const body = await r.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? `${slug} ${source}: HTTP ${r.status}`);
    }
    setSourceCache((s) => ({ ...s, [slug]: { ...(s[slug] ?? {}), [source]: true } as Record<BioSource, boolean> }));
  };

  const fetchSourceForAll = async (source: BioSource): Promise<void> => {
    if (isReadOnlySource(source)) return;
    const missing = props.slugs.filter((slug) => !sourceIsCached(slug, source));
    if (missing.length === 0) return;
    setRunning((r) => ({ ...r, [source]: true }));
    setErrors((e) => ({ ...e, [source]: undefined }));
    try {
      // Cap concurrency at 4 so we don't slam the worker.
      const queue = missing.slice();
      const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (queue.length > 0) {
          const slug = queue.shift();
          if (!slug) return;
          await fetchSourceForSlug(source, slug).catch((e) => {
            // eslint-disable-next-line no-console
            console.warn(`[bio source ${source}] ${slug} failed:`, e);
          });
        }
      });
      await Promise.all(workers);
    } catch (e) {
      setErrors((er) => ({ ...er, [source]: String(e) }));
    } finally {
      setRunning((r) => ({ ...r, [source]: false }));
    }
  };

  const toggleSource = async (source: BioSource) => {
    const cur = included();
    const isOn = cur.has(source);
    const next = new Set(cur);
    if (isOn) {
      next.delete(source);
    } else {
      next.add(source);
      // Fetch underlying records for any slug missing this source, in parallel.
      await fetchSourceForAll(source);
    }
    setIncluded(next);
    setSynthingAll(true);
    setSynthBumper((n) => n + 1);
  };

  return (
    <Show when={props.slugs.length > 0} fallback={<section class="panel empty">No identifiable sages on this daf.</section>}>
      <section class="panel enrich-bar">
        <Show when={props.onReloadSkeleton}>
          <button class="toggle-pill toggle-off-empty reload-skel" onClick={() => props.onReloadSkeleton?.()} title="Re-run rabbi identification (daf-context first-pass) from scratch.">
            <span class="toggle-mark">↻</span>
            <span class="toggle-label">Reload skeleton</span>
          </button>
        </Show>
        <span class="enrich-label">Synthesis sources</span>
        <For each={BIO_SOURCES}>{(s) => (
          <EnrichmentToggle
            id={s.id}
            label={s.label}
            desc={s.desc}
            cached={allSlugsHaveSource(s.id)}
            included={included().has(s.id)}
            running={!!running()[s.id]}
            error={errors()[s.id]}
            onClick={() => toggleSource(s.id)}
          />
        )}</For>
        <Show when={synthingAll()}>
          <span class="enrich-status">synthesizing all bios…</span>
        </Show>
      </section>
      <section class="panel">
        <For each={props.slugs}>{(slug) => {
          const ctxRabbi = props.ctxRabbis.find((r) => r.slug === slug);
          return (
            <BioCard
              slug={slug}
              ctxRabbi={ctxRabbi}
              tractate={props.tractate}
              page={props.page}
              included={included()}
              synthBumper={synthBumper()}
              onAllSynthDone={() => setSynthingAll(false)}
            />
          );
        }}</For>
      </section>
    </Show>
  );
}

function BioCard(props: {
  slug: string;
  ctxRabbi?: DafContextRabbi;
  tractate: string;
  page: string;
  included: Set<BioSource>;
  synthBumper: number;
  onAllSynthDone?: () => void;
}): JSX.Element {
  const [enriched, { refetch: refetchUnified }] = createResource(
    () => props.slug,
    async (slug): Promise<UnifiedRabbi | null> => {
      const res = await fetch(`/api/admin/rabbi-enriched/${encodeURIComponent(slug)}`);
      if (!res.ok) return null;
      const body = await res.json() as { record?: UnifiedRabbi };
      return body.record ?? null;
    },
  );

  // Per-daf synthesized bio. Re-fetched whenever the toggle bar bumps the
  // synth nonce (i.e. a source toggle changed). The fetch URL includes the
  // current include set so different combos cache independently.
  const [perDaf, { refetch: refetchPerDaf }] = createResource(
    () => `${props.tractate}|${props.page}|${props.slug}|i=${[...props.included].sort().join(',')}|b=${props.synthBumper}`,
    async (): Promise<BioSynthesis | null> => {
      // No bumper change yet → just read whatever's cached at base key.
      if (props.synthBumper === 0 && props.included.size === 0) {
        const res = await fetch(`/api/enrich-rabbi-bio/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}/${encodeURIComponent(props.slug)}`);
        if (!res.ok) return null;
        return res.json();
      }
      // Toggle changed → re-synth with the new include set.
      const inc = [...props.included].sort();
      const includeQs = inc.length > 0 ? `&include=${encodeURIComponent(inc.join(','))}` : '';
      const r = await fetch(
        `/api/enrich-rabbi-bio/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}/${encodeURIComponent(props.slug)}?refresh=1${includeQs}`,
        { method: 'POST' },
      );
      if (!r.ok) return null;
      return r.json();
    },
  );

  // Notify the parent when our synth completes so it can clear the
  // "synthesizing all bios…" status. Best-effort.
  createEffect(() => {
    if (perDaf.state === 'ready' || perDaf.state === 'errored') {
      props.onAllSynthDone?.();
    }
  });

  void refetchUnified;
  void refetchPerDaf;

  return (
    <div class="card">
      <div class="card-head">
        <span class="card-title">{enriched()?.canonical.en ?? props.ctxRabbi?.name ?? props.slug}</span>
        <Show when={enriched()?.canonical.he ?? props.ctxRabbi?.nameHe}>
          <span class="card-title-he"> · {enriched()?.canonical.he ?? props.ctxRabbi?.nameHe}</span>
        </Show>
        <code class="rabbi-card-slug">{props.slug}</code>
      </div>
      <Show when={enriched()}>
        {(r) => (
          <div class="r-meta">
            <Show when={r().generation}><span>gen {r().generation}</span></Show>
            <Show when={r().region}><span>region {r().region}</span></Show>
            <Show when={r().academy}><span>academy {r().academy}</span></Show>
            <Show when={r().birthYear || r().deathYear}>
              <span>{r().birthYear ?? '?'}–{r().deathYear ?? '?'}</span>
            </Show>
            <Show when={r().orientation && r().orientation !== 'unknown'}><span>{r().orientation}</span></Show>
            <Show when={r().places.length > 0}><span>places: {r().places.join(', ')}</span></Show>
          </div>
        )}
      </Show>

      {/* Primary prose: per-daf synthesized bio. */}
      <Show
        when={perDaf()?.explanation}
        fallback={
          <p class="card-summary card-summary-empty">
            <em>No per-daf bio yet. Toggle one or more sources on to synthesize.</em>
          </p>
        }
      >
        <p class="card-summary"><Hebraized text={perDaf()!.explanation} /></p>
        <ProvenanceBadge
          strategies={perDaf()?.groundedIn ?? []}
          firstPass={(perDaf()?.groundedIn ?? []).length === 0 ? 'per-daf bio (no sources)' : undefined}
        />
      </Show>

      {/* Global biographical resources — collapsed by default. */}
      <Show when={enriched()?.bio.en || props.ctxRabbi?.bio}>
        <details class="strat-expand" onClick={(e) => e.stopPropagation()}>
          <summary onClick={(e) => e.stopPropagation()}>standard bio (resource)</summary>
          <div class="strat-expand-body">
            <Show
              when={enriched()?.bio.en}
              fallback={
                <Show when={props.ctxRabbi?.bio}>
                  <p class="card-summary" style="font-size: 12px; color: #475569;"><Hebraized text={props.ctxRabbi!.bio!} /></p>
                  <ProvenanceBadge strategies={[]} firstPass="daf-context" />
                </Show>
              }
            >
              <p class="card-summary" style="font-size: 12px; color: #475569;"><Hebraized text={enriched()!.bio.en} /></p>
              <ProvenanceBadge strategies={['unified']} />
            </Show>
          </div>
        </details>
      </Show>
    </div>
  );
}

const RABBI_TAB_CSS = `
.rabbi-tab-head { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.5rem 0.85rem; background: #f8fafc; }
.rabbi-tab-meta { font-size: 12px; color: #475569; flex: 1; }
.rabbi-tab-meta b { color: #1e293b; }
.admin-link { font-size: 11px; color: #6366f1; text-decoration: none; }
.admin-link:hover { text-decoration: underline; }
.loading-inline { color: #94a3b8; font-style: italic; font-size: 12px; }

.sub-tabs { display: flex; gap: 0.4rem; padding: 0.4rem 0; margin-bottom: 0.5rem; }
.sub-tab { background: white; border: 1px solid #e5e7eb; padding: 0.3rem 0.8rem; font-size: 12px; color: #64748b; border-radius: 999px; cursor: pointer; }
.sub-tab:hover { background: #f1f5f9; color: #1e293b; }
.sub-tab-active { background: #1e293b; color: white; border-color: #0f172a; }
.sub-tab-active:hover { background: #0f172a; color: white; }

.rabbi-section-head { margin: 0 0 0.5rem; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
.rabbi-card-slug { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: #94a3b8; margin-left: auto; padding: 1px 6px; background: #f1f5f9; border-radius: 2px; }
.rabbi-card-actions { margin-top: 0.5rem; display: flex; gap: 0.4rem; align-items: center; }

.r-meta { display: flex; gap: 0.4rem; flex-wrap: wrap; font-size: 11px; color: #64748b; margin: 0.3rem 0; }
.r-meta span { background: #f1f5f9; border: 1px solid #e5e7eb; padding: 1px 6px; border-radius: 2px; }

.card-summary-empty { color: #94a3b8; font-size: 12px; }

.rel-primaries { display: flex; gap: 0.6rem; flex-wrap: wrap; padding: 0.3rem 0; border-bottom: 1px solid #f1f5f9; margin-bottom: 0.4rem; }
.rel-primary { display: flex; gap: 0.3rem; align-items: baseline; font-size: 11.5px; }
.rel-arrow { color: #4338ca; font-weight: 700; font-size: 12px; }
.rel-primary-label { font-size: 9.5px; color: #4338ca; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
.rel-primary-slug { font-family: ui-monospace, Menlo, monospace; color: #1e1b4b; font-size: 11.5px; }
.rel-bucket { margin: 0.25rem 0; }
.rel-bucket-label { display: inline-block; font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #6366f1; margin-right: 0.4rem; min-width: 70px; }
.rel-edges { display: inline-flex; gap: 0.3rem; flex-wrap: wrap; }
.rel-edge { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; padding: 1px 6px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 2px; color: #475569; display: inline-flex; gap: 0.25rem; align-items: baseline; }
.rel-edge-sefaria { border-color: #4f46e5; }
.rel-edge-on-daf { background: #fef3c7; border-color: #fbbf24; color: #92400e; font-weight: 600; }
.rel-relation { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6366f1; font-weight: 600; }

.bio-toggles { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; padding: 0.4rem 0; margin: 0.5rem 0; border-top: 1px dashed #e5e7eb; border-bottom: 1px dashed #e5e7eb; }
.bio-toggle-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-right: 0.3rem; }

.intra-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.2rem; }
.intra-row { display: flex; gap: 0.45rem; align-items: baseline; padding: 0.25rem 0.45rem; background: #fef9c3; border-radius: 3px; font-size: 11.5px; font-family: ui-monospace, Menlo, monospace; }
.intra-from, .intra-to { color: #1e293b; font-weight: 600; }
.intra-arrow { font-size: 10px; color: #92400e; text-transform: uppercase; letter-spacing: 0.05em; padding: 1px 6px; background: white; border-radius: 10px; }
`;
