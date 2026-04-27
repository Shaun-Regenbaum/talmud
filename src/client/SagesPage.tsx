/**
 * #sages — single page for browsing the canonical ~1.3K sage list and
 * managing enrichment. Fuzzy search across slug + canonical EN/HE + aliases.
 * Detail pane pulls every cached enrichment for the selected sage and
 * exposes Run / Re-run / Refresh per stage. Top bar shows global coverage
 * and lets you compile graph / cohort / places-index / academy-roster.
 */
import { createMemo, createResource, createSignal, For, Show, type JSX } from 'solid-js';

interface IndexRow {
  slug: string;
  canonical: string;
  canonicalHe: string | null;
  aliases: string[];
  generation: string | null;
  region: 'israel' | 'bavel' | null;
}

interface IndexResp { rows: IndexRow[]; count: number }

interface RabbiEdge {
  slug: string | null;
  name: string;
  weight: number | null;
  source: 'sefaria' | 'llm';
}
interface FamilyEdge extends RabbiEdge { relation: string }

interface UnifiedRecord {
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
  contemporaries: string[];
  family: FamilyEdge[];
  opposed: RabbiEdge[];
  influences: RabbiEdge[];
  events: string[];
  refs: { sefariaSlug?: string; enWiki?: string; heWiki?: string; je?: string; wikidata?: string };
  image: { url: string; caption: string | null } | null;
  enrichedAt: string;
  sources: string[];
}

interface WikidataRecord {
  qid: string;
  fatherQid: string | null;
  motherQid: string | null;
  spouseQids: string[];
  childQids: string[];
  studentQids: string[];
  teacherQids: string[];
  birthYear: number | null;
  deathYear: number | null;
  fetchedAt: string;
}

interface WikiBioRecord {
  enWiki: { url: string; title: string; extract: string } | null;
  heWiki: { url: string; title: string; extract: string } | null;
  fetchedAt: string;
}

interface CohortBlob {
  bySage: Record<string, string[]>;
}
interface PlacesBlob {
  byPlace: Record<string, string[]>;
}
interface AcademyRosterBlob {
  byAcademy: Record<string, string[]>;
}

interface CacheStats {
  totalSlugs: number;
  perSage: {
    unified: number;
    wikidata: number;
    wikiBio: number;
    influences: number;
    appearances: number;
    keyDafim: number;
  };
  globals: {
    graph: string | null;
    cohort: string | null;
    placesIndex: string | null;
    academyRoster: string | null;
  };
}

const COMPILES = [
  { id: 'graph',          label: 'graph',          desc: 'Bidirectional teacher↔student + family inversion across all enriched sages.' },
  { id: 'cohort',         label: 'cohort',         desc: 'Group sages by generation; emit slug→contemporaries.' },
  { id: 'places-index',   label: 'places',         desc: 'Invert sage.places[] into place→sages.' },
  { id: 'academy-roster', label: 'academies',      desc: 'Invert sage.academy into academy→sages.' },
] as const;

const STAGE_PATHS = {
  unified: { run: 'rabbi-enrich-unified', desc: 'Sefaria + LLM combined biographical record.' },
  wikidata: { run: 'rabbi-wikidata', desc: 'Family/teacher/student QIDs + birth/death years from Wikidata (no AI).' },
  'wiki-bio': { run: 'rabbi-wiki-bio', desc: 'Full Wikipedia (en/he) page extracts via MediaWiki (no AI).' },
} as const;
type StageId = keyof typeof STAGE_PATHS;

async function getJSON<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

/* -------- fuzzy search -------- */

// Lowercases ASCII and strips common punctuation. Hebrew is preserved as-is.
const normalize = (s: string): string =>
  s.toLowerCase().replace(/[.,;:'"`()[\]{}]/g, '').replace(/\s+/g, ' ').trim();

// Returns true if `q` chars appear in order anywhere in `s` (subsequence).
const subseq = (q: string, s: string): boolean => {
  let i = 0;
  for (const ch of s) { if (ch === q[i]) i += 1; if (i === q.length) return true; }
  return i === q.length;
};

const scoreField = (q: string, field: string): number => {
  if (!field) return 0;
  const f = normalize(field);
  if (!f) return 0;
  if (f === q) return 1000;
  if (f.startsWith(q)) return 600 - Math.min(100, f.length - q.length);
  const idx = f.indexOf(q);
  if (idx >= 0) return 350 - Math.min(100, idx);
  if (q.length >= 3 && subseq(q, f)) return 80;
  return 0;
};

// Hebrew shortcut — no lowercase, just substring/subseq.
const scoreHebrew = (q: string, field: string | null): number => {
  if (!field) return 0;
  if (field === q) return 1000;
  if (field.startsWith(q)) return 600;
  if (field.includes(q)) return 350;
  if (q.length >= 2 && subseq(q, field)) return 80;
  return 0;
};

const isHebrewQuery = (q: string): boolean => /[֐-׿]/.test(q);

const scoreRow = (qNorm: string, qHe: string | null, row: IndexRow): number => {
  let best = 0;
  // Hebrew query → only score against canonicalHe.
  if (qHe) {
    best = Math.max(best, scoreHebrew(qHe, row.canonicalHe));
    return best;
  }
  best = Math.max(best, scoreField(qNorm, row.slug.replace(/-/g, ' ')));
  best = Math.max(best, scoreField(qNorm, row.canonical));
  for (const a of row.aliases) best = Math.max(best, scoreField(qNorm, a) - 30); // slight penalty vs canonical
  return best;
};

/* -------- page -------- */

export function SagesPage(): JSX.Element {
  const [index] = createResource(async () => {
    const r = await getJSON<IndexResp>('/api/sages-index');
    return r ?? { rows: [], count: 0 };
  });
  const [cohort, { refetch: refetchCohort }] = createResource(async () => getJSON<CohortBlob>('/api/admin/rabbi-cohort'));
  const [places, { refetch: refetchPlaces }] = createResource(async () => getJSON<PlacesBlob>('/api/admin/rabbi-places-index'));
  const [academy, { refetch: refetchAcademy }] = createResource(async () => getJSON<AcademyRosterBlob>('/api/admin/rabbi-academy-roster'));
  const [stats, { refetch: refetchStats }] = createResource(async () => getJSON<CacheStats>('/api/admin/rabbi-cache-stats'));

  const [filter, setFilter] = createSignal('');
  const [region, setRegion] = createSignal<'all' | 'israel' | 'bavel'>('all');
  const [generation, setGeneration] = createSignal<string>('all');

  // Compile state — shared across the four global-blob buttons.
  const [compiling, setCompiling] = createSignal<Partial<Record<string, boolean>>>({});
  const [compileErr, setCompileErr] = createSignal<Partial<Record<string, string>>>({});

  const runCompile = async (id: string) => {
    setCompiling((c) => ({ ...c, [id]: true }));
    setCompileErr((e) => ({ ...e, [id]: undefined }));
    try {
      const res = await fetch(`/api/admin/rabbi-compile/${id}`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      // Re-fetch the global blob we just compiled so the detail pane is fresh.
      if (id === 'cohort') refetchCohort();
      if (id === 'places-index') refetchPlaces();
      if (id === 'academy-roster') refetchAcademy();
      refetchStats();
    } catch (err) {
      setCompileErr((e) => ({ ...e, [id]: String(err) }));
    } finally {
      setCompiling((c) => ({ ...c, [id]: false }));
    }
  };

  // URL hash — `#sages/<slug>` deep-links to a sage. We listen for hash
  // changes so the back button works.
  const hashSlug = (): string | null => {
    const h = window.location.hash.replace(/^#/, '');
    if (!h.startsWith('sages/')) return null;
    return decodeURIComponent(h.slice('sages/'.length)) || null;
  };
  const [selected, setSelected] = createSignal<string | null>(hashSlug());
  window.addEventListener('hashchange', () => setSelected(hashSlug()));

  const select = (slug: string) => {
    window.location.hash = `sages/${encodeURIComponent(slug)}`;
  };
  const clearSelection = () => {
    window.location.hash = 'sages';
  };

  const generations = createMemo<string[]>(() => {
    const rows = index()?.rows ?? [];
    const set = new Set<string>();
    for (const r of rows) if (r.generation) set.add(r.generation);
    return [...set].sort();
  });

  const ranked = createMemo<IndexRow[]>(() => {
    const rows = index()?.rows ?? [];
    const reg = region();
    const gen = generation();
    const filtered = rows.filter((r) => {
      if (reg !== 'all' && r.region !== reg) return false;
      if (gen !== 'all' && r.generation !== gen) return false;
      return true;
    });
    const q = filter().trim();
    if (!q) {
      return filtered.slice().sort((a, b) => a.canonical.localeCompare(b.canonical));
    }
    if (isHebrewQuery(q)) {
      const qHe = q;
      const scored = filtered
        .map((r) => ({ r, s: scoreRow('', qHe, r) }))
        .filter((x) => x.s > 0);
      scored.sort((a, b) => b.s - a.s || a.r.canonical.localeCompare(b.r.canonical));
      return scored.map((x) => x.r);
    }
    const qNorm = normalize(q);
    const scored = filtered
      .map((r) => ({ r, s: scoreRow(qNorm, null, r) }))
      .filter((x) => x.s > 0);
    scored.sort((a, b) => b.s - a.s || a.r.canonical.localeCompare(b.r.canonical));
    return scored.map((x) => x.r);
  });

  return (
    <div class="sages-page">
      <style>{SAGES_CSS}</style>

      <header class="sages-head">
        <div class="sages-head-row">
          <h1 class="sages-title">Sages</h1>
          <Show when={index()}>
            {(idx) => (
              <span class="sages-count">
                {ranked().length === idx().count
                  ? `${idx().count} sages`
                  : `${ranked().length} of ${idx().count}`}
              </span>
            )}
          </Show>
        </div>

        <div class="sages-stats">
          <Show when={stats.loading && !stats()}><span class="sages-stats-loading">loading coverage…</span></Show>
          <Show when={stats()}>
            {(s) => (
              <>
                <span class="stats-cell">unified <b>{s().perSage.unified}</b><span class="stats-tot">/{s().totalSlugs}</span></span>
                <span class="stats-cell">wikidata <b>{s().perSage.wikidata}</b></span>
                <span class="stats-cell">wiki-bio <b>{s().perSage.wikiBio}</b></span>
                <span class="stats-divider">·</span>
                <For each={COMPILES}>{(c) => {
                  const ts =
                    c.id === 'graph' ? s().globals.graph
                    : c.id === 'cohort' ? s().globals.cohort
                    : c.id === 'places-index' ? s().globals.placesIndex
                    : s().globals.academyRoster;
                  return (
                    <button
                      class="compile-btn"
                      classList={{ 'compile-btn-fresh': !!ts }}
                      disabled={!!compiling()[c.id]}
                      onClick={() => runCompile(c.id)}
                      title={`${c.desc}\nlast: ${ts ? new Date(ts).toLocaleString() : 'never'}`}
                    >
                      {compiling()[c.id] ? `${c.label}…` : `compile ${c.label}`}
                      <Show when={ts}><span class="compile-btn-ts">{fmtDate(ts as string)}</span></Show>
                      <Show when={compileErr()[c.id]}><span class="compile-btn-err">err</span></Show>
                    </button>
                  );
                }}</For>
              </>
            )}
          </Show>
        </div>
        <div class="sages-controls">
          <input
            type="text"
            class="sages-search"
            placeholder="search by name, slug, alias, or Hebrew…"
            value={filter()}
            onInput={(e) => setFilter(e.currentTarget.value)}
            autofocus
          />
          <div class="sages-chips">
            <span class="chip-label">region</span>
            <button class="chip" classList={{ 'chip-active': region() === 'all' }} onClick={() => setRegion('all')}>all</button>
            <button class="chip" classList={{ 'chip-active': region() === 'israel' }} onClick={() => setRegion('israel')}>Israel</button>
            <button class="chip" classList={{ 'chip-active': region() === 'bavel' }} onClick={() => setRegion('bavel')}>Bavel</button>
          </div>
          <Show when={generations().length > 0}>
            <div class="sages-chips">
              <span class="chip-label">gen</span>
              <select class="sages-gen-select" value={generation()} onChange={(e) => setGeneration(e.currentTarget.value)}>
                <option value="all">all</option>
                <For each={generations()}>{(g) => <option value={g}>{g}</option>}</For>
              </select>
            </div>
          </Show>
        </div>
      </header>

      <div class="sages-grid">
        <aside class="sages-list panel">
          <Show when={index.loading}><div class="sages-empty">loading…</div></Show>
          <Show when={!index.loading && ranked().length === 0}>
            <div class="sages-empty">no matches</div>
          </Show>
          <For each={ranked().slice(0, 300)}>{(row) => (
            <button
              class="sages-list-item"
              classList={{ 'sages-list-item-active': selected() === row.slug }}
              onClick={() => select(row.slug)}
            >
              <span class="sages-list-name">{row.canonical}</span>
              <Show when={row.canonicalHe}>
                <span class="sages-list-name-he">{row.canonicalHe}</span>
              </Show>
              <span class="sages-list-meta">
                <Show when={row.generation}><span>gen {row.generation}</span></Show>
                <Show when={row.region}><span class="sages-list-region">{row.region}</span></Show>
              </span>
            </button>
          )}</For>
          <Show when={ranked().length > 300}>
            <div class="sages-list-cap">+{ranked().length - 300} more — refine search</div>
          </Show>
        </aside>

        <main class="sages-detail panel">
          <Show
            when={selected()}
            fallback={
              <div class="sages-empty sages-empty-large">
                Pick a sage on the left to see everything we have on file.
              </div>
            }
          >
            {(slug) => (
              <SageDetail
                slug={slug()}
                cohort={cohort()}
                places={places()}
                academy={academy()}
                onSelect={select}
                onClose={clearSelection}
                onStageRan={() => refetchStats()}
              />
            )}
          </Show>
        </main>
      </div>
    </div>
  );
}

/* -------- detail pane -------- */

function SageDetail(props: {
  slug: string;
  cohort: CohortBlob | null | undefined;
  places: PlacesBlob | null | undefined;
  academy: AcademyRosterBlob | null | undefined;
  onSelect: (slug: string) => void;
  onClose: () => void;
  onStageRan: () => void;
}): JSX.Element {
  const [unified, { refetch: refetchUnified }] = createResource(() => props.slug, async (slug) => {
    const r = await getJSON<{ record: UnifiedRecord | null }>(`/api/admin/rabbi-enriched/${encodeURIComponent(slug)}`);
    return r?.record ?? null;
  });
  const [wikidata, { refetch: refetchWikidata }] = createResource(() => props.slug, async (slug) => {
    const r = await getJSON<{ record: WikidataRecord | null }>(`/api/admin/rabbi-wikidata/${encodeURIComponent(slug)}`);
    return r?.record ?? null;
  });
  const [wikiBio, { refetch: refetchWikiBio }] = createResource(() => props.slug, async (slug) => {
    const r = await getJSON<{ record: WikiBioRecord | null }>(`/api/admin/rabbi-wiki-bio/${encodeURIComponent(slug)}`);
    return r?.record ?? null;
  });

  // Per-stage Run/Refresh state, keyed by stage id.
  const [stageRunning, setStageRunning] = createSignal<Partial<Record<StageId, boolean>>>({});
  const [stageError, setStageError] = createSignal<Partial<Record<StageId, string>>>({});

  const runStage = async (stage: StageId, refresh = false) => {
    setStageRunning((r) => ({ ...r, [stage]: true }));
    setStageError((e) => ({ ...e, [stage]: undefined }));
    try {
      const url = `/api/admin/${STAGE_PATHS[stage].run}/${encodeURIComponent(props.slug)}${refresh ? '?refresh=1' : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      const body = await res.json() as { error?: string };
      if (body.error) throw new Error(body.error);
      if (stage === 'unified') refetchUnified();
      else if (stage === 'wikidata') refetchWikidata();
      else if (stage === 'wiki-bio') refetchWikiBio();
      props.onStageRan();
    } catch (err) {
      setStageError((e) => ({ ...e, [stage]: String(err) }));
    } finally {
      setStageRunning((r) => ({ ...r, [stage]: false }));
    }
  };

  const contemporaries = (): string[] => props.cohort?.bySage?.[props.slug] ?? [];
  const academyMates = (): string[] => {
    const u = unified();
    if (!u?.academy || !props.academy) return [];
    return (props.academy.byAcademy[u.academy] ?? []).filter((s) => s !== props.slug);
  };
  const placeMates = (): Array<{ place: string; sages: string[] }> => {
    const u = unified();
    if (!u?.places || !props.places) return [];
    return u.places
      .map((p) => ({ place: p, sages: (props.places!.byPlace[p] ?? []).filter((s) => s !== props.slug) }))
      .filter((x) => x.sages.length > 0);
  };

  const refs = (): UnifiedRecord['refs'] => unified()?.refs ?? {};

  return (
    <article class="sage-detail">
      <header class="sage-head">
        <div class="sage-head-titles">
          <Show when={unified()?.canonical.en} fallback={<h2 class="sage-name">{props.slug}</h2>}>
            <h2 class="sage-name">
              {unified()!.canonical.en}
              <Show when={unified()!.canonical.he}>
                <span class="sage-name-he"> · {unified()!.canonical.he}</span>
              </Show>
            </h2>
          </Show>
          <code class="sage-slug">{props.slug}</code>
        </div>
        <button class="sage-close" onClick={props.onClose} title="Clear selection">×</button>
      </header>

      <Show when={unified.loading && !unified()}>
        <div class="sage-loading">loading sage…</div>
      </Show>

      <Show when={!unified.loading && !unified()}>
        <div class="sage-empty-state">
          <span>No unified record cached for this sage yet.</span>
          <button
            class="stage-btn primary"
            disabled={!!stageRunning().unified}
            onClick={() => runStage('unified')}
            title={STAGE_PATHS.unified.desc}
          >
            {stageRunning().unified ? 'Running…' : 'Run unified enrichment'}
          </button>
          <Show when={stageError().unified}><span class="stage-err">{stageError().unified}</span></Show>
        </div>
      </Show>

      <Show when={unified()}>
        {(u) => (
          <>
            {/* Identity strip. */}
            <div class="sage-meta-strip">
              <Show when={u().generation}><span class="meta-pill">gen <b>{u().generation}</b></span></Show>
              <Show when={u().region}><span class="meta-pill">region <b>{u().region}</b></span></Show>
              <Show when={u().academy}><span class="meta-pill">academy <b>{u().academy}</b></span></Show>
              <Show when={u().birthYear || u().deathYear}>
                <span class="meta-pill">{u().birthYear ?? '?'}–{u().deathYear ?? '?'}</span>
              </Show>
              <Show when={u().orientation && u().orientation !== 'unknown'}>
                <span class="meta-pill orientation-{u().orientation}">{u().orientation}</span>
              </Show>
              <Show when={u().prominence != null}>
                <span class="meta-pill">prominence <b>{u().prominence}</b></span>
              </Show>
            </div>

            <Show when={u().aliases.length > 0}>
              <div class="sage-aliases">
                <span class="sage-section-label">aliases</span>
                <For each={u().aliases}>{(a) => <span class="alias-tag">{a}</span>}</For>
              </div>
            </Show>

            <Show when={u().image?.url}>
              <figure class="sage-image">
                <img src={u().image!.url} alt={u().canonical.en} />
                <Show when={u().image!.caption}>
                  <figcaption>{u().image!.caption}</figcaption>
                </Show>
              </figure>
            </Show>

            <Section
              label="Bio"
              actions={
                <StageActions
                  stage="unified"
                  cached={true}
                  running={!!stageRunning().unified}
                  error={stageError().unified}
                  onRun={runStage}
                />
              }
            >
              <Show when={u().bio.en}><p class="sage-prose">{u().bio.en}</p></Show>
              <Show when={u().bio.he}>
                <p class="sage-prose" dir="rtl" lang="he">{u().bio.he}</p>
              </Show>
              <Show when={!u().bio.en && !u().bio.he}>
                <p class="sage-empty-inline">No bio in the unified record. Hit Refresh to re-run.</p>
              </Show>
            </Section>

            <Show when={u().characteristics.length > 0}>
              <Section label="Characteristics">
                <div class="tag-row">
                  <For each={u().characteristics}>{(c) => <span class="char-tag">{c}</span>}</For>
                </div>
              </Section>
            </Show>

            <Show when={u().places.length > 0}>
              <Section label="Places">
                <div class="tag-row">
                  <For each={u().places}>{(p) => <span class="place-tag">{p}</span>}</For>
                </div>
              </Section>
            </Show>

            <Show when={hasAnyRelations(u())}>
              <Section label="Relationships">
                <Show when={u().primaryTeacher || u().primaryStudent}>
                  <div class="rel-primaries">
                    <Show when={u().primaryTeacher}>
                      <button class="rel-primary-btn" onClick={() => props.onSelect(u().primaryTeacher!)}>
                        <span class="rel-arrow">↑</span>
                        <span class="rel-primary-label">primary teacher</span>
                        <span class="rel-primary-slug">{u().primaryTeacher}</span>
                      </button>
                    </Show>
                    <Show when={u().primaryStudent}>
                      <button class="rel-primary-btn" onClick={() => props.onSelect(u().primaryStudent!)}>
                        <span class="rel-arrow">↓</span>
                        <span class="rel-primary-label">primary student</span>
                        <span class="rel-primary-slug">{u().primaryStudent}</span>
                      </button>
                    </Show>
                  </div>
                </Show>
                <EdgeBucket label="Teachers" edges={u().teachers} onSelect={props.onSelect} />
                <EdgeBucket label="Students" edges={u().students} onSelect={props.onSelect} />
                <FamilyBucket family={u().family} onSelect={props.onSelect} />
                <EdgeBucket label="Opposed" edges={u().opposed} onSelect={props.onSelect} />
                <EdgeBucket label="Influences" edges={u().influences} onSelect={props.onSelect} />
              </Section>
            </Show>

            <Show when={contemporaries().length > 0}>
              <Section label={`Contemporaries (gen ${u().generation})`}>
                <div class="slug-row">
                  <For each={contemporaries()}>{(s) => (
                    <button class="slug-tag" onClick={() => props.onSelect(s)}>{s}</button>
                  )}</For>
                </div>
              </Section>
            </Show>

            <Show when={academyMates().length > 0}>
              <Section label={`Academy of ${u().academy}`}>
                <div class="slug-row">
                  <For each={academyMates()}>{(s) => (
                    <button class="slug-tag" onClick={() => props.onSelect(s)}>{s}</button>
                  )}</For>
                </div>
              </Section>
            </Show>

            <Show when={placeMates().length > 0}>
              <Section label="Place-mates">
                <For each={placeMates()}>{(pm) => (
                  <div class="place-mates-row">
                    <span class="place-mates-place">{pm.place}</span>
                    <div class="slug-row">
                      <For each={pm.sages}>{(s) => (
                        <button class="slug-tag" onClick={() => props.onSelect(s)}>{s}</button>
                      )}</For>
                    </div>
                  </div>
                )}</For>
              </Section>
            </Show>

            <Show when={u().events.length > 0}>
              <Section label="Events">
                <ul class="event-list">
                  <For each={u().events}>{(e) => <li>{e}</li>}</For>
                </ul>
              </Section>
            </Show>

            <Show when={u().contemporaries?.length > 0 && contemporaries().length === 0}>
              <Section label="Contemporaries (per record)">
                <div class="slug-row">
                  <For each={u().contemporaries}>{(s) => (
                    <button class="slug-tag" onClick={() => props.onSelect(s)}>{s}</button>
                  )}</For>
                </div>
              </Section>
            </Show>
          </>
        )}
      </Show>

      {/* Wikipedia. Always renders so Run/Refresh stays reachable. */}
      <Section
        label="Wikipedia"
        actions={
          <StageActions
            stage="wiki-bio"
            cached={!!wikiBio()}
            running={!!stageRunning()['wiki-bio']}
            error={stageError()['wiki-bio']}
            onRun={runStage}
          />
        }
      >
        <Show when={wikiBio()} fallback={<p class="sage-empty-inline">No Wikipedia extract cached. Run to fetch.</p>}>
          {(w) => (
            <Show when={w().enWiki || w().heWiki} fallback={<p class="sage-empty-inline">No Wikipedia page found for this sage.</p>}>
              <Show when={w().enWiki}>
                {(p) => (
                  <div class="wiki-block">
                    <a class="wiki-link" href={p().url} target="_blank" rel="noopener noreferrer">en: {p().title}</a>
                    <p class="wiki-extract">{p().extract}</p>
                  </div>
                )}
              </Show>
              <Show when={w().heWiki}>
                {(p) => (
                  <div class="wiki-block">
                    <a class="wiki-link" href={p().url} target="_blank" rel="noopener noreferrer">he: {p().title}</a>
                    <p class="wiki-extract" dir="rtl" lang="he">{p().extract}</p>
                  </div>
                )}
              </Show>
            </Show>
          )}
        </Show>
      </Section>

      {/* Wikidata. Always renders so Run/Refresh stays reachable. */}
      <Section
        label="Wikidata"
        actions={
          <StageActions
            stage="wikidata"
            cached={!!wikidata()}
            running={!!stageRunning().wikidata}
            error={stageError().wikidata}
            onRun={runStage}
          />
        }
      >
        <Show when={wikidata()} fallback={<p class="sage-empty-inline">No Wikidata record cached. Run to fetch family/teacher/student QIDs.</p>}>
          {(w) => (
            <>
            <div class="wd-head">
              <a class="wd-qid" href={`https://www.wikidata.org/wiki/${w().qid}`} target="_blank" rel="noopener noreferrer">{w().qid}</a>
              <Show when={w().birthYear || w().deathYear}>
                <span class="wd-years">{w().birthYear ?? '?'}–{w().deathYear ?? '?'}</span>
              </Show>
            </div>
            <WikidataEdges rec={w()} />
            </>
          )}
        </Show>
      </Section>

      {/* External refs. */}
      <Show when={hasAnyRefs(refs())}>
        <Section label="External refs">
          <div class="ref-row">
            <Show when={refs().sefariaSlug}>
              <a class="ref-link" href={`https://www.sefaria.org/topics/${refs().sefariaSlug}`} target="_blank" rel="noopener noreferrer">Sefaria</a>
            </Show>
            <Show when={refs().enWiki}>
              <a class="ref-link" href={refs().enWiki} target="_blank" rel="noopener noreferrer">Wikipedia (en)</a>
            </Show>
            <Show when={refs().heWiki}>
              <a class="ref-link" href={refs().heWiki} target="_blank" rel="noopener noreferrer">Wikipedia (he)</a>
            </Show>
            <Show when={refs().je}>
              <a class="ref-link" href={refs().je} target="_blank" rel="noopener noreferrer">Jewish Encyclopedia</a>
            </Show>
            <Show when={refs().wikidata}>
              <a class="ref-link" href={refs().wikidata} target="_blank" rel="noopener noreferrer">Wikidata</a>
            </Show>
          </div>
        </Section>
      </Show>

      <Show when={unified()}>
        {(u) => (
          <footer class="sage-foot">
            <span>enriched {fmtDate(u().enrichedAt)}</span>
            <Show when={u().sources.length > 0}>
              <span class="sage-foot-sources">sources: {u().sources.join(', ')}</span>
            </Show>
          </footer>
        )}
      </Show>
    </article>
  );
}

function Section(props: { label: string; actions?: JSX.Element; children: JSX.Element }): JSX.Element {
  return (
    <section class="sage-section">
      <div class="sage-section-head">
        <h3 class="sage-section-label">{props.label}</h3>
        <Show when={props.actions}>
          <div class="sage-section-actions">{props.actions}</div>
        </Show>
      </div>
      {props.children}
    </section>
  );
}

function StageActions(props: {
  stage: StageId;
  cached: boolean;
  running: boolean;
  error: string | undefined;
  onRun: (stage: StageId, refresh?: boolean) => void;
}): JSX.Element {
  return (
    <>
      <Show when={!props.cached}>
        <button
          class="stage-btn primary"
          disabled={props.running}
          onClick={() => props.onRun(props.stage)}
          title={STAGE_PATHS[props.stage].desc}
        >
          {props.running ? 'Running…' : 'Run'}
        </button>
      </Show>
      <Show when={props.cached}>
        <button
          class="stage-btn"
          disabled={props.running}
          onClick={() => props.onRun(props.stage, true)}
          title="Force refresh, bypass cache"
        >
          {props.running ? 'Refreshing…' : 'Refresh'}
        </button>
      </Show>
      <Show when={props.error}><span class="stage-err">{props.error}</span></Show>
    </>
  );
}

function EdgeBucket(props: { label: string; edges: RabbiEdge[]; onSelect: (s: string) => void }): JSX.Element {
  return (
    <Show when={props.edges.length > 0}>
      <div class="rel-bucket">
        <span class="rel-bucket-label">{props.label}</span>
        <div class="rel-edges">
          <For each={props.edges}>{(e) => (
            <Show
              when={e.slug}
              fallback={<span class="rel-edge rel-edge-noslug">{e.name}</span>}
            >
              <button
                class="rel-edge"
                classList={{ 'rel-edge-sefaria': e.source === 'sefaria' }}
                onClick={() => props.onSelect(e.slug!)}
                title={`source: ${e.source}${e.weight != null ? ` · weight ${e.weight.toFixed(2)}` : ''}`}
              >
                {e.slug}
                <Show when={e.weight != null}>
                  <span class="rel-edge-weight">{(e.weight as number).toFixed(2)}</span>
                </Show>
              </button>
            </Show>
          )}</For>
        </div>
      </div>
    </Show>
  );
}

function FamilyBucket(props: { family: FamilyEdge[]; onSelect: (s: string) => void }): JSX.Element {
  return (
    <Show when={props.family.length > 0}>
      <div class="rel-bucket">
        <span class="rel-bucket-label">Family</span>
        <div class="rel-edges">
          <For each={props.family}>{(e) => (
            <Show
              when={e.slug}
              fallback={
                <span class="rel-edge rel-edge-noslug">
                  <span class="rel-relation">{e.relation}</span>{e.name}
                </span>
              }
            >
              <button
                class="rel-edge"
                classList={{ 'rel-edge-sefaria': e.source === 'sefaria' }}
                onClick={() => props.onSelect(e.slug!)}
                title={`source: ${e.source}`}
              >
                <span class="rel-relation">{e.relation}</span>{e.slug}
              </button>
            </Show>
          )}</For>
        </div>
      </div>
    </Show>
  );
}

function WikidataEdges(props: { rec: WikidataRecord }): JSX.Element {
  const r = () => props.rec;
  const rows = (): Array<{ label: string; ids: string[] }> => {
    const out: Array<{ label: string; ids: string[] }> = [];
    if (r().fatherQid) out.push({ label: 'father', ids: [r().fatherQid as string] });
    if (r().motherQid) out.push({ label: 'mother', ids: [r().motherQid as string] });
    if (r().spouseQids.length) out.push({ label: 'spouses', ids: r().spouseQids });
    if (r().childQids.length) out.push({ label: 'children', ids: r().childQids });
    if (r().teacherQids.length) out.push({ label: 'teachers', ids: r().teacherQids });
    if (r().studentQids.length) out.push({ label: 'students', ids: r().studentQids });
    return out;
  };
  return (
    <Show when={rows().length > 0}>
      <div class="wd-edges">
        <For each={rows()}>{(row) => (
          <div class="wd-edge-row">
            <span class="rel-relation">{row.label}</span>
            <For each={row.ids}>{(id) => (
              <a class="wd-ref" href={`https://www.wikidata.org/wiki/${id}`} target="_blank" rel="noopener noreferrer">{id}</a>
            )}</For>
          </div>
        )}</For>
      </div>
    </Show>
  );
}

function hasAnyRelations(u: UnifiedRecord): boolean {
  return !!(u.primaryTeacher || u.primaryStudent
    || u.teachers.length || u.students.length
    || u.family.length || u.opposed.length || u.influences.length);
}
function hasAnyRefs(r: UnifiedRecord['refs']): boolean {
  return !!(r.sefariaSlug || r.enWiki || r.heWiki || r.je || r.wikidata);
}
function fmtDate(s: string): string {
  if (!s) return '?';
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
}

const SAGES_CSS = `
.sages-page { max-width: 1280px; margin: 0 auto; padding: 1rem 1.25rem 2rem; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: #0f172a; }
.sages-page .panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; }

.sages-head { margin-bottom: 1rem; }
.sages-head-row { display: flex; align-items: baseline; gap: 0.75rem; margin-bottom: 0.6rem; }
.sages-title { margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.01em; }
.sages-count { font-size: 12px; color: #64748b; }

.sages-stats { display: flex; gap: 0.45rem; align-items: center; flex-wrap: wrap; padding: 0.4rem 0.65rem; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 11.5px; color: #475569; margin-bottom: 0.55rem; }
.sages-stats-loading { color: #94a3b8; font-style: italic; }
.stats-cell { font-size: 11.5px; color: #475569; }
.stats-cell b { color: #0f172a; font-weight: 600; }
.stats-tot { color: #94a3b8; }
.stats-divider { color: #cbd5e1; padding: 0 0.15rem; }
.compile-btn { background: white; border: 1px solid #cbd5e1; color: #475569; padding: 0.18rem 0.55rem; font-size: 11px; border-radius: 999px; cursor: pointer; display: inline-flex; gap: 0.3rem; align-items: baseline; }
.compile-btn:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
.compile-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.compile-btn-fresh { background: #f0fdf4; border-color: #86efac; color: #166534; }
.compile-btn-fresh:hover:not(:disabled) { background: #dcfce7; }
.compile-btn-ts { font-size: 9.5px; color: #94a3b8; font-family: ui-monospace, Menlo, monospace; }
.compile-btn-fresh .compile-btn-ts { color: #4d7c0f; }
.compile-btn-err { font-size: 9.5px; color: #b91c1c; margin-left: 0.2rem; }

.sages-controls { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
.sages-search { flex: 1; min-width: 240px; padding: 0.5rem 0.75rem; font-size: 13.5px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; }
.sages-search:focus { outline: 2px solid #6366f1; outline-offset: -1px; border-color: #6366f1; }
.sages-chips { display: flex; gap: 0.3rem; align-items: center; }
.chip-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-right: 0.2rem; }
.chip { background: white; border: 1px solid #cbd5e1; padding: 0.25rem 0.6rem; font-size: 11.5px; border-radius: 999px; cursor: pointer; color: #475569; }
.chip:hover { background: #f1f5f9; color: #1e293b; }
.chip-active { background: #1e293b; color: #fff; border-color: #0f172a; }
.chip-active:hover { background: #0f172a; color: #fff; }
.sages-gen-select { padding: 0.25rem 0.5rem; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; background: #fff; }

.sages-grid { display: grid; grid-template-columns: 320px 1fr; gap: 0.85rem; align-items: start; }
@media (max-width: 760px) { .sages-grid { grid-template-columns: 1fr; } }

.sages-list { padding: 0.5rem; max-height: 78vh; overflow-y: auto; }
.sages-empty { color: #94a3b8; font-style: italic; font-size: 12.5px; padding: 1rem; text-align: center; }
.sages-empty-large { padding: 3rem 1rem; font-size: 14px; }
.sages-list-item { display: flex; flex-direction: column; gap: 0.15rem; align-items: flex-start; text-align: left; padding: 0.4rem 0.55rem; border: none; border-radius: 4px; background: transparent; cursor: pointer; width: 100%; box-sizing: border-box; }
.sages-list-item:hover { background: #f1f5f9; }
.sages-list-item-active { background: #1e293b; color: white; }
.sages-list-item-active .sages-list-meta span,
.sages-list-item-active .sages-list-name-he { color: #cbd5e1; }
.sages-list-item-active:hover { background: #0f172a; }
.sages-list-name { font-weight: 600; font-size: 13px; color: inherit; }
.sages-list-name-he { font-family: 'SBL Hebrew', 'Arial Hebrew', David, serif; font-size: 12.5px; color: #64748b; }
.sages-list-meta { display: flex; gap: 0.35rem; font-size: 10px; color: #94a3b8; flex-wrap: wrap; }
.sages-list-meta span { background: rgba(0,0,0,0.04); padding: 0 5px; border-radius: 8px; }
.sages-list-item-active .sages-list-meta span { background: rgba(255,255,255,0.12); }
.sages-list-region { text-transform: uppercase; letter-spacing: 0.04em; }
.sages-list-cap { font-size: 10.5px; color: #94a3b8; padding: 0.6rem; font-style: italic; text-align: center; }

.sages-detail { padding: 1rem 1.25rem; min-height: 200px; }
.sage-detail { display: flex; flex-direction: column; gap: 0.75rem; }
.sage-head { display: flex; align-items: flex-start; gap: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid #e5e7eb; }
.sage-head-titles { flex: 1; min-width: 0; }
.sage-name { margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.01em; }
.sage-name-he { font-family: 'SBL Hebrew', 'Arial Hebrew', David, serif; font-weight: 500; color: #475569; font-size: 19px; }
.sage-slug { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #94a3b8; background: #f1f5f9; padding: 1px 6px; border-radius: 3px; display: inline-block; margin-top: 0.2rem; }
.sage-close { background: transparent; border: none; font-size: 22px; line-height: 1; color: #94a3b8; cursor: pointer; padding: 0 0.4rem; }
.sage-close:hover { color: #0f172a; }
.sage-loading { color: #94a3b8; font-style: italic; padding: 1rem 0; }
/* sage-empty-state defined below with action layout */

.sage-meta-strip { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.meta-pill { background: #f1f5f9; border: 1px solid #e2e8f0; padding: 2px 8px; font-size: 11.5px; color: #475569; border-radius: 999px; }
.meta-pill b { color: #0f172a; font-weight: 600; }

.sage-aliases { display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: baseline; }
.alias-tag { font-family: ui-monospace, Menlo, monospace; font-size: 11px; padding: 1px 6px; background: #fff; border: 1px dashed #cbd5e1; color: #475569; border-radius: 3px; }

.sage-image { margin: 0; max-width: 220px; }
.sage-image img { width: 100%; height: auto; border-radius: 4px; border: 1px solid #e5e7eb; }
.sage-image figcaption { font-size: 10.5px; color: #94a3b8; margin-top: 0.2rem; font-style: italic; }

.sage-section { display: flex; flex-direction: column; gap: 0.4rem; }
.sage-section-head { display: flex; align-items: baseline; gap: 0.5rem; }
.sage-section-label { margin: 0; font-size: 10.5px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
.sage-section-actions { margin-left: auto; display: flex; gap: 0.3rem; align-items: baseline; }
.stage-btn { background: white; border: 1px solid #cbd5e1; color: #475569; padding: 0.2rem 0.6rem; font-size: 11px; border-radius: 4px; cursor: pointer; }
.stage-btn:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
.stage-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.stage-btn.primary { background: #1e293b; color: white; border-color: #0f172a; }
.stage-btn.primary:hover:not(:disabled) { background: #0f172a; }
.stage-err { font-size: 10.5px; color: #b91c1c; margin-left: 0.2rem; }
.sage-empty-inline { margin: 0; font-size: 12px; color: #94a3b8; font-style: italic; }
.sage-empty-state { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; color: #64748b; font-size: 13px; padding: 0.75rem; background: #f8fafc; border-radius: 4px; }

.sage-prose { margin: 0; font-size: 13.5px; line-height: 1.6; color: #1e293b; }
.sage-prose[dir="rtl"] { font-family: 'SBL Hebrew', 'Arial Hebrew', David, serif; font-size: 14px; }

.tag-row { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.char-tag { font-size: 11px; padding: 1px 7px; background: #fef3c7; border: 1px solid #fde68a; color: #92400e; border-radius: 999px; }
.place-tag { font-size: 11px; padding: 1px 7px; background: #ecfeff; border: 1px solid #cffafe; color: #155e75; border-radius: 999px; }

.rel-primaries { display: flex; gap: 0.5rem; flex-wrap: wrap; padding-bottom: 0.4rem; border-bottom: 1px dashed #e5e7eb; }
.rel-primary-btn { display: flex; gap: 0.35rem; align-items: baseline; background: #eef2ff; border: 1px solid #c7d2fe; padding: 0.3rem 0.6rem; border-radius: 4px; cursor: pointer; font-size: 12px; }
.rel-primary-btn:hover { background: #e0e7ff; border-color: #818cf8; }
.rel-arrow { color: #4338ca; font-weight: 700; }
.rel-primary-label { font-size: 9.5px; color: #4338ca; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
.rel-primary-slug { font-family: ui-monospace, Menlo, monospace; color: #1e1b4b; font-size: 11.5px; }

.rel-bucket { display: flex; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; }
.rel-bucket-label { font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #6366f1; min-width: 70px; }
.rel-edges { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.rel-edge { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; padding: 2px 7px; background: #fff; border: 1px solid #c7d2fe; color: #1e1b4b; border-radius: 3px; cursor: pointer; display: inline-flex; gap: 0.25rem; align-items: baseline; }
.rel-edge:hover { background: #eef2ff; border-color: #818cf8; }
.rel-edge-sefaria { border-color: #4f46e5; background: #e0e7ff; }
.rel-edge-noslug { background: #f8fafc; border-color: #e2e8f0; color: #64748b; cursor: default; }
.rel-edge-weight { font-size: 9.5px; color: #6366f1; }
.rel-relation { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6366f1; font-weight: 600; }

.slug-row { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.slug-tag { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; padding: 2px 7px; background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; border-radius: 3px; cursor: pointer; }
.slug-tag:hover { background: #eef2ff; border-color: #818cf8; color: #1e1b4b; }

.place-mates-row { display: flex; gap: 0.5rem; align-items: baseline; padding: 0.2rem 0; }
.place-mates-place { font-size: 11px; font-weight: 600; color: #155e75; min-width: 90px; }

.event-list { margin: 0; padding-left: 1.2rem; font-size: 12.5px; color: #334155; line-height: 1.6; }

.wiki-block { margin-bottom: 0.5rem; }
.wiki-block:last-child { margin-bottom: 0; }
.wiki-link { font-size: 12px; color: #4338ca; font-weight: 600; text-decoration: none; }
.wiki-link:hover { text-decoration: underline; }
.wiki-extract { font-size: 12.5px; color: #334155; line-height: 1.55; margin: 0.25rem 0 0; }
.wiki-extract[dir="rtl"] { font-family: 'SBL Hebrew', 'Arial Hebrew', David, serif; font-size: 13.5px; }

.wd-head { display: flex; gap: 0.5rem; align-items: baseline; }
.wd-qid { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #4338ca; text-decoration: none; padding: 1px 6px; background: #eef2ff; border-radius: 3px; }
.wd-qid:hover { text-decoration: underline; }
.wd-years { font-size: 11.5px; color: #64748b; }
.wd-edges { display: flex; flex-direction: column; gap: 0.25rem; }
.wd-edge-row { display: flex; gap: 0.4rem; align-items: baseline; flex-wrap: wrap; }
.wd-ref { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: #4338ca; text-decoration: none; padding: 0 4px; }
.wd-ref:hover { text-decoration: underline; }

.ref-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.ref-link { font-size: 12px; color: #4338ca; text-decoration: none; padding: 2px 8px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 3px; }
.ref-link:hover { background: #e0e7ff; }

.sage-foot { display: flex; gap: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #f1f5f9; font-size: 10.5px; color: #94a3b8; }
.sage-foot-sources { margin-left: auto; font-family: ui-monospace, Menlo, monospace; }
`;
