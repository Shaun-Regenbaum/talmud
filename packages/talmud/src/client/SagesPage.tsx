/** Browse sages, their relationships, and the passages behind their connections. */
import { Button } from '@corpus/ui/Button';
import { DetailSection } from '@corpus/ui/MetricSummary';
import { Select } from '@corpus/ui/Select';
import { FilterChip, Input, SectionHeading, StatCard, StatusMessage } from '@corpus/ui/Study';
import { createMemo, createResource, createSignal, For, type JSX, onCleanup, Show } from 'solid-js';
import { GENERATION_BY_ID, type GenerationId, generationLabelHe } from './generations';
import { lang, t } from './i18n';
import { academyLabel, placeLabel, roleLabel } from './sageLabels';
import './sages.css';
import { SAGE_CONNECTION_GROUPS, SageConnections } from './SageConnections';
import { SageCoverageStrip } from './SageCoverageStrip';
import { SageNetworkSection } from './SageNetworkSection';
import { SagePartners } from './SagePartners';
import { type IndexRow, isHebrewQuery, normalize, scoreRow } from './sageSearch';

interface IndexResp {
  rows: IndexRow[];
  count: number;
}

interface RabbiEdge {
  slug: string | null;
  name: string;
  weight: number | null;
  source: 'sefaria' | 'llm';
}
interface FamilyEdge extends RabbiEdge {
  relation: string;
}

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
  { id: 'graph', labelKey: 'sages.compile.graph', descKey: 'sages.compile.graph.desc' },
  { id: 'cohort', labelKey: 'sages.compile.cohort', descKey: 'sages.compile.cohort.desc' },
  { id: 'places-index', labelKey: 'sages.compile.places', descKey: 'sages.compile.places.desc' },
  {
    id: 'academy-roster',
    labelKey: 'sages.compile.academies',
    descKey: 'sages.compile.academies.desc',
  },
] as const;

const STAGE_PATHS = {
  unified: { run: 'rabbi-enrich-unified', descKey: 'sages.stage.unified.desc' },
  wikidata: { run: 'rabbi-wikidata', descKey: 'sages.stage.wikidata.desc' },
  'wiki-bio': { run: 'rabbi-wiki-bio', descKey: 'sages.stage.wikiBio.desc' },
} as const;
type StageId = keyof typeof STAGE_PATHS;

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* -------- display helpers -------- */

type NameFor = (slug: string) => string;

/** A generation id as a reader-facing label in the app language. */
function genLabel(id: string | null | undefined): string {
  if (!id) return '';
  const info = GENERATION_BY_ID[id as GenerationId];
  if (!info) return id;
  return lang() === 'he' ? generationLabelHe(info) : info.label;
}

function regionLabel(r: string | null | undefined): string {
  if (r === 'israel') return t('sages.region.israel');
  if (r === 'bavel') return t('sages.region.bavel');
  return r ?? '';
}

/** The sage's name in the app language first, the other language second. */
function namePair(en: string, he: string | null | undefined): { main: string; other: string } {
  if (lang() === 'he' && he) return { main: he, other: en };
  return { main: en, other: he ?? '' };
}

/* -------- missing-from-registry panel -------- */

interface BacklogRabbi {
  name: string;
  nameHe?: string;
  generation?: string;
  count: number;
  dafs: string[];
}
interface BacklogResp {
  rabbis?: { total: number; scanned?: number; sample: BacklogRabbi[] };
}

/** Names the AI reliably reads as a distinct sage on real dapim but that match
 *  NO registry entry — the "who needs a bio next" worklist. Data: the live
 *  unknown-rabbi backlog (sampled; see the caption). */
function MissingSagesPanel(): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [backlog] = createResource(open, async (o) => {
    if (!o) return null;
    const r = await fetch('/api/usage/backlog');
    if (!r.ok) return { rabbis: undefined } satisfies BacklogResp; // unavailable, not loading
    return (await r.json()) as BacklogResp;
  });
  const dafHref = (label: string) => {
    const i = label.lastIndexOf(' ');
    if (i <= 0) return '#';
    return `?tractate=${encodeURIComponent(label.slice(0, i))}&page=${encodeURIComponent(label.slice(i + 1))}#daf`;
  };
  return (
    <DetailSection title={t('sages.missing.title')} onToggle={setOpen}>
      <Show
        when={backlog()}
        fallback={<StatusMessage tone="loading">{t('sages.list.loading')}</StatusMessage>}
      >
        {(b) => (
          <>
            <Show when={!b().rabbis}>
              <p class="sages-note">{t('sages.missing.unavailable')}</p>
            </Show>
            <p class="sages-note">
              {t('sages.missing.note', {
                total: b().rabbis?.total ?? 0,
                scanned: b().rabbis?.scanned ?? 0,
              })}
            </p>
            <For each={b().rabbis?.sample ?? []}>
              {(r) => {
                const n = namePair(r.name, r.nameHe);
                return (
                  <div class="sages-missing-row">
                    <strong>{n.main}</strong>
                    <Show when={n.other}>
                      <span class="sages-muted">{n.other}</span>
                    </Show>
                    <span class="sages-missing-count">×{r.count}</span>
                    <span class="sages-missing-dafs">
                      <For each={r.dafs.slice(0, 3)}>
                        {(d) => (
                          <a href={dafHref(d)} class="sages-missing-daf">
                            {d}
                          </a>
                        )}
                      </For>
                    </span>
                  </div>
                );
              }}
            </For>
          </>
        )}
      </Show>
    </DetailSection>
  );
}

/* -------- page -------- */

export function SagesPage(): JSX.Element {
  const [index, { refetch: refetchIndex }] = createResource(async () => {
    const r = await getJSON<IndexResp>('/api/sages-index');
    return r;
  });
  const [cohort, { refetch: refetchCohort }] = createResource(async () =>
    getJSON<CohortBlob>('/api/admin/rabbi-cohort'),
  );
  const [places, { refetch: refetchPlaces }] = createResource(async () =>
    getJSON<PlacesBlob>('/api/admin/rabbi-places-index'),
  );
  const [academy, { refetch: refetchAcademy }] = createResource(async () =>
    getJSON<AcademyRosterBlob>('/api/admin/rabbi-academy-roster'),
  );
  const [stats, { refetch: refetchStats }] = createResource(async () =>
    getJSON<CacheStats>('/api/admin/rabbi-cache-stats'),
  );

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
    try {
      return decodeURIComponent(h.slice('sages/'.length)) || null;
    } catch {
      return null;
    }
  };
  const [selected, setSelected] = createSignal<string | null>(hashSlug());
  const syncSelection = () => setSelected(hashSlug());
  window.addEventListener('hashchange', syncSelection);
  onCleanup(() => window.removeEventListener('hashchange', syncSelection));

  const select = (slug: string) => {
    window.location.hash = `sages/${encodeURIComponent(slug)}`;
  };
  const clearSelection = () => {
    window.location.hash = 'sages';
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.sages-search')?.focus());
  };

  const generations = createMemo<string[]>(() => {
    const rows = index()?.rows ?? [];
    const set = new Set<string>();
    for (const r of rows) if (r.generation) set.add(r.generation);
    return [...set].sort();
  });

  // slug -> row, so every sage link can show a name instead of a slug.
  const rowBySlug = createMemo(() => new Map((index()?.rows ?? []).map((r) => [r.slug, r])));
  const nameFor: NameFor = (slug) => {
    const row = rowBySlug().get(slug);
    return row ? namePair(row.canonical, row.canonicalHe).main : slug;
  };

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
      const scored = filtered.map((r) => ({ r, s: scoreRow('', qHe, r) })).filter((x) => x.s > 0);
      scored.sort((a, b) => b.s - a.s || a.r.canonical.localeCompare(b.r.canonical));
      return scored.map((x) => x.r);
    }
    const qNorm = normalize(q);
    const scored = filtered.map((r) => ({ r, s: scoreRow(qNorm, null, r) })).filter((x) => x.s > 0);
    scored.sort((a, b) => b.s - a.s || a.r.canonical.localeCompare(b.r.canonical));
    return scored.map((x) => x.r);
  });

  const globalStamp = (id: (typeof COMPILES)[number]['id'], s: CacheStats): string | null =>
    id === 'graph'
      ? s.globals.graph
      : id === 'cohort'
        ? s.globals.cohort
        : id === 'places-index'
          ? s.globals.placesIndex
          : s.globals.academyRoster;

  return (
    <main class="page-shell sages-page">
      <header class="responsive-row sages-head">
        <h1 class="sages-title">{t('sages.title')}</h1>
        <Show when={index()}>
          {(idx) => (
            <span class="sages-muted">
              {ranked().length === idx().count
                ? t('sages.count.all', { count: idx().count })
                : t('sages.count.filtered', { shown: ranked().length, total: idx().count })}
            </span>
          )}
        </Show>
        <a href="#daf" class="sages-back">
          {t('usage.backToDaf')}
        </a>
      </header>

      <p class="sages-intro">{t('sages.intro')}</p>
      <div class="sages-grid" classList={{ 'has-selection': !!selected() }}>
        <aside class="sages-directory" aria-label={t('sages.directory')}>
          <div class="sages-controls">
            <Input
              type="text"
              class="sages-search"
              aria-label={t('sages.search.placeholder')}
              placeholder={t('sages.search.placeholder')}
              value={filter()}
              onInput={(e) => setFilter(e.currentTarget.value)}
            />
            <div class="sages-chips">
              <span class="sages-label">{t('sages.filter.region')}</span>
              <FilterChip active={region() === 'all'} onClick={() => setRegion('all')}>
                {t('sages.filter.all')}
              </FilterChip>
              <FilterChip active={region() === 'israel'} onClick={() => setRegion('israel')}>
                {t('sages.region.israel')}
              </FilterChip>
              <FilterChip active={region() === 'bavel'} onClick={() => setRegion('bavel')}>
                {t('sages.region.bavel')}
              </FilterChip>
            </div>
            <Show when={generations().length > 0}>
              <div class="sages-chips">
                <span class="sages-label">{t('sages.filter.gen')}</span>
                <Select
                  aria-label={t('sages.filter.gen')}
                  value={generation()}
                  onChange={(e) => setGeneration(e.currentTarget.value)}
                >
                  <option value="all">{t('sages.filter.all')}</option>
                  <For each={generations()}>{(g) => <option value={g}>{genLabel(g)}</option>}</For>
                </Select>
              </div>
            </Show>
          </div>

          <div class="sages-list">
            <Show when={index.loading}>
              <StatusMessage tone="loading">{t('sages.list.loading')}</StatusMessage>
            </Show>
            <Show when={!index.loading && !index()}>
              <StatusMessage
                tone="error"
                onRetry={() => refetchIndex()}
                retryLabel={t('sages.connections.retry')}
              >
                {t('sages.directory.error')}
              </StatusMessage>
            </Show>
            <Show when={!index.loading && index() && ranked().length === 0}>
              <StatusMessage tone="empty">{t('sages.list.noMatches')}</StatusMessage>
            </Show>
            <For each={ranked()}>
              {(row) => {
                const n = () => namePair(row.canonical, row.canonicalHe);
                return (
                  <button
                    type="button"
                    class="sages-directory-row"
                    aria-pressed={selected() === row.slug}
                    onClick={() => select(row.slug)}
                  >
                    <span class="sages-directory-name">{n().main}</span>
                    <Show when={n().other}>
                      <span class="sages-directory-other" dir="auto">
                        {n().other}
                      </span>
                    </Show>
                    <span class="sages-list-meta">
                      <Show when={row.generation}>
                        <span>{genLabel(row.generation)}</span>
                      </Show>
                      <Show when={row.region}>
                        <span>{regionLabel(row.region)}</span>
                      </Show>
                    </span>
                  </button>
                );
              }}
            </For>
          </div>
        </aside>

        <section class="sages-panel sages-detail">
          <Show
            when={selected()}
            keyed
            fallback={
              <div class="sages-welcome">
                <span class="sages-label">{t('sages.welcome.eyebrow')}</span>
                <h2>{t('sages.welcome.title')}</h2>
                <p>{t('sages.welcome.description')}</p>
                <div class="sages-start-links">
                  <For
                    each={['abaye', 'rava', 'hillel', 'rabbi-akiva'].filter((slug) =>
                      rowBySlug().has(slug),
                    )}
                  >
                    {(slug) => <Button onClick={() => select(slug)}>{nameFor(slug)}</Button>}
                  </For>
                </div>
                <div class="sages-group-guide">
                  <For each={SAGE_CONNECTION_GROUPS}>
                    {(key) => (
                      <div>
                        <h3>{t(`sages.group.${key}`)}</h3>
                        <p>{t(`sages.group.${key}.description`)}</p>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            }
          >
            {(slug) => (
              <SageDetail
                slug={slug}
                generationId={index()?.rows.find((r) => r.slug === slug)?.generation ?? null}
                cohort={cohort()}
                places={places()}
                academy={academy()}
                nameFor={nameFor}
                onSelect={select}
                onClose={clearSelection}
                onStageRan={() => refetchStats()}
              />
            )}
          </Show>
        </section>
      </div>
      <DetailSection title={t('sages.maintenance')}>
        <Show when={stats.loading && !stats()}>
          <StatusMessage tone="loading">{t('sages.stats.loading')}</StatusMessage>
        </Show>
        <Show when={stats()}>
          {(s) => (
            <section class="sages-stats">
              <div class="sages-stat-cards">
                <StatCard
                  label={t('sages.stats.unified')}
                  value={s().perSage.unified}
                  detail={`/ ${s().totalSlugs}`}
                />
                <StatCard label={t('sages.stats.wikidata')} value={s().perSage.wikidata} />
                <StatCard label={t('sages.stats.wikiBio')} value={s().perSage.wikiBio} />
              </div>
              <div class="sages-compiles">
                <For each={COMPILES}>
                  {(c) => {
                    const ts = () => globalStamp(c.id, s());
                    return (
                      <Button
                        disabled={!!compiling()[c.id]}
                        onClick={() => runCompile(c.id)}
                        title={t('sages.compile.title', {
                          desc: t(c.descKey),
                          last: ts()
                            ? new Date(ts() as string).toLocaleString()
                            : t('sages.compile.never'),
                        })}
                      >
                        {compiling()[c.id]
                          ? t('sages.compile.running', { name: t(c.labelKey) })
                          : t('sages.compile.action', { name: t(c.labelKey) })}
                        <Show when={ts()}>
                          <span class="sages-ts">{fmtDate(ts() as string)}</span>
                        </Show>
                        <Show when={compileErr()[c.id]}>
                          <span class="sages-err">{t('sages.compile.err')}</span>
                        </Show>
                      </Button>
                    );
                  }}
                </For>
              </div>
            </section>
          )}
        </Show>

        <MissingSagesPanel />
      </DetailSection>
    </main>
  );
}

/* -------- detail pane -------- */

function SageDetail(props: {
  slug: string;
  generationId: string | null;
  cohort: CohortBlob | null | undefined;
  places: PlacesBlob | null | undefined;
  academy: AcademyRosterBlob | null | undefined;
  nameFor: NameFor;
  onSelect: (slug: string) => void;
  onClose: () => void;
  onStageRan: () => void;
}): JSX.Element {
  const [mapOpen, setMapOpen] = createSignal(false);
  const [profileFailed, setProfileFailed] = createSignal(false);
  const [unified, { refetch: refetchUnified }] = createResource(
    () => props.slug,
    async (slug) => {
      const r = await getJSON<{ record: UnifiedRecord | null }>(
        `/api/admin/rabbi-enriched/${encodeURIComponent(slug)}`,
      );
      setProfileFailed(!r);
      return r?.record ?? null;
    },
  );
  const [wikidata, { refetch: refetchWikidata }] = createResource(
    () => props.slug,
    async (slug) => {
      const r = await getJSON<{ record: WikidataRecord | null }>(
        `/api/admin/rabbi-wikidata/${encodeURIComponent(slug)}`,
      );
      return r?.record ?? null;
    },
  );
  const [wikiBio, { refetch: refetchWikiBio }] = createResource(
    () => props.slug,
    async (slug) => {
      const r = await getJSON<{ record: WikiBioRecord | null }>(
        `/api/admin/rabbi-wiki-bio/${encodeURIComponent(slug)}`,
      );
      return r?.record ?? null;
    },
  );

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
      const body = (await res.json()) as { error?: string };
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
      .map((p) => ({
        place: p,
        sages: (props.places!.byPlace[p] ?? []).filter((s) => s !== props.slug),
      }))
      .filter((x) => x.sages.length > 0);
  };

  const refs = (): UnifiedRecord['refs'] => unified()?.refs ?? {};
  const SageLinks = (p: { slugs: string[] }): JSX.Element => (
    <div class="sages-tags">
      <For each={p.slugs}>
        {(s) => (
          <Button class="sages-tag sages-tag-link" onClick={() => props.onSelect(s)}>
            {props.nameFor(s)}
          </Button>
        )}
      </For>
    </div>
  );

  return (
    <article class="sage-detail">
      <header class="sage-head">
        <div class="sage-head-titles">
          <Show
            when={unified()?.canonical.en}
            fallback={<h2 class="sage-name">{props.nameFor(props.slug)}</h2>}
          >
            {(() => {
              const n = () => namePair(unified()!.canonical.en, unified()!.canonical.he);
              return (
                <h2 class="sage-name">
                  {n().main}
                  <Show when={n().other}>
                    <span class="sage-name-other" dir="auto">
                      {n().other}
                    </span>
                  </Show>
                </h2>
              );
            })()}
          </Show>
        </div>
        <Button
          class="sage-close"
          onClick={props.onClose}
          title={t('sages.detail.clearSelection')}
          aria-label={t('sages.detail.clearSelection')}
        >
          ×
        </Button>
      </header>

      <Show when={unified.loading && !unified()}>
        <StatusMessage tone="loading">{t('sages.detail.loadingSage')}</StatusMessage>
      </Show>

      <Show when={!unified.loading && !unified()}>
        <StatusMessage tone="empty">
          {t(profileFailed() ? 'sages.connections.profileError' : 'sages.connections.noBio')}{' '}
          <Show when={stageError().unified}>
            <span class="sages-err">{stageError().unified}</span>
          </Show>
        </StatusMessage>
      </Show>

      <Show when={unified()}>
        {(u) => (
          <>
            <div class="sages-tags">
              <Show when={u().generation}>
                <span class="sages-pill">
                  <b>{genLabel(props.generationId ?? u().generation)}</b>
                </span>
              </Show>
              <Show when={u().region}>
                <span class="sages-pill">
                  <b>{regionLabel(u().region)}</b>
                </span>
              </Show>
              <Show when={u().academy}>
                <span class="sages-pill">
                  {t('sages.meta.academy')} <b>{academyLabel(u().academy as string, lang())}</b>
                </span>
              </Show>
              <Show when={u().birthYear || u().deathYear}>
                <span class="sages-pill">
                  {u().birthYear ?? '?'}–{u().deathYear ?? '?'}
                </span>
              </Show>
            </div>

            <DetailSection title={t('sages.section.bio')}>
              <For
                each={
                  lang() === 'he' && u().bio.he
                    ? (['he'] as const)
                    : lang() === 'he'
                      ? (['en'] as const)
                      : u().bio.en
                        ? (['en'] as const)
                        : (['he'] as const)
                }
              >
                {(l) => (
                  <Show when={u().bio[l]}>
                    <p
                      class="sage-prose"
                      classList={{ 'sage-prose-he': l === 'he' }}
                      dir={l === 'he' ? 'rtl' : undefined}
                      lang={l === 'he' ? 'he' : undefined}
                    >
                      {u().bio[l]}
                    </p>
                  </Show>
                )}
              </For>
              <Show when={!u().bio.en && !u().bio.he}>
                <StatusMessage tone="empty">{t('sages.bio.empty')}</StatusMessage>
              </Show>
            </DetailSection>
          </>
        )}
      </Show>

      <SageCoverageStrip slug={props.slug} generation={props.generationId} />
      <SagePartners slug={props.slug} nameFor={props.nameFor} onSelect={props.onSelect} />
      <SageConnections
        slug={props.slug}
        profile={unified()}
        profileLoading={unified.loading}
        profileFailed={profileFailed()}
        nameFor={props.nameFor}
        onSelect={props.onSelect}
      />
      <Show when={unified()}>
        {(u) => (
          <DetailSection title={t('sages.background')}>
            <Show when={u().aliases.length > 0}>
              <Section label={t('sages.section.aliases')}>
                <div class="sages-tags">
                  <For each={u().aliases}>{(a) => <span class="sages-tag">{a}</span>}</For>
                </div>
              </Section>
            </Show>
            <Show when={u().image?.url}>
              <figure class="sage-image">
                <img src={u().image!.url} alt={u().canonical.en} />
                <Show when={u().image!.caption}>
                  <figcaption>{u().image!.caption}</figcaption>
                </Show>
              </figure>
            </Show>
            <Show when={u().characteristics.length > 0}>
              <Section label={t('sages.section.characteristics')}>
                <div class="sages-tags">
                  <For each={u().characteristics}>
                    {(c) => <span class="sages-tag sages-tag-ochre">{roleLabel(c, lang())}</span>}
                  </For>
                </div>
              </Section>
            </Show>
            <Show when={u().places.length > 0}>
              <Section label={t('sages.section.places')}>
                <div class="sages-tags">
                  <For each={u().places}>
                    {(p) => <span class="sages-tag sages-tag-teal">{placeLabel(p, lang())}</span>}
                  </For>
                </div>
              </Section>
            </Show>
            <Show when={u().opposed.length || u().influences.length}>
              <Section label={t('sages.connections.otherProfile')}>
                <EdgeBucket
                  label={t('sages.rel.opposed')}
                  edges={u().opposed}
                  nameFor={props.nameFor}
                  onSelect={props.onSelect}
                />
                <EdgeBucket
                  label={t('sages.rel.influences')}
                  edges={u().influences}
                  nameFor={props.nameFor}
                  onSelect={props.onSelect}
                />
              </Section>
            </Show>{' '}
            <Show when={contemporaries().length > 0}>
              <Section label={t('sages.section.contemporaries', { gen: genLabel(u().generation) })}>
                <SageLinks slugs={contemporaries()} />
              </Section>
            </Show>
            <Show when={academyMates().length > 0}>
              <Section
                label={t('sages.section.academyOf', {
                  name: academyLabel(u().academy as string, lang()),
                })}
              >
                <SageLinks slugs={academyMates()} />
              </Section>
            </Show>
            <Show when={placeMates().length > 0}>
              <Section label={t('sages.section.placeMates')}>
                <For each={placeMates()}>
                  {(pm) => (
                    <div class="sages-place-mates">
                      <strong>{placeLabel(pm.place, lang())}</strong>
                      <SageLinks slugs={pm.sages} />
                    </div>
                  )}
                </For>
              </Section>
            </Show>
            <Show when={u().contemporaries?.length > 0 && contemporaries().length === 0}>
              <Section label={t('sages.section.contemporariesRecord')}>
                <SageLinks slugs={u().contemporaries} />
              </Section>
            </Show>
          </DetailSection>
        )}
      </Show>
      <DetailSection title={t('sages.passagesMap')} open={mapOpen()} onToggle={setMapOpen}>
        <Show when={mapOpen()}>
          <SageNetworkSection slug={props.slug} />
        </Show>
      </DetailSection>

      <Show when={hasAnyRefs(refs())}>
        <Section label={t('sages.section.externalRefs')}>
          <div class="sages-tags">
            <Show when={refs().sefariaSlug}>
              <ExtLink href={`https://www.sefaria.org/topics/${refs().sefariaSlug}`}>
                {t('sages.refs.sefaria')}
              </ExtLink>
            </Show>
            <Show when={refs().enWiki}>
              <ExtLink href={refs().enWiki as string}>{t('sages.refs.wikipediaEn')}</ExtLink>
            </Show>
            <Show when={refs().heWiki}>
              <ExtLink href={refs().heWiki as string}>{t('sages.refs.wikipediaHe')}</ExtLink>
            </Show>
            <Show when={refs().je}>
              <ExtLink href={refs().je as string}>{t('sages.refs.jewishEncyclopedia')}</ExtLink>
            </Show>
            <Show when={refs().wikidata}>
              <ExtLink href={refs().wikidata as string}>{t('sages.refs.wikidata')}</ExtLink>
            </Show>
          </div>
        </Section>
      </Show>

      {/* Operator tools — enrichment steps + provenance, folded away so the
          page reads as a rabbi profile first. */}
      <DetailSection title={t('sages.ops.title')}>
        <StageActions
          stage="unified"
          cached={!!unified()}
          running={!!stageRunning().unified}
          error={stageError().unified}
          onRun={runStage}
        />
        <Section
          label={t('sages.section.wikipedia')}
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
          <Show
            when={wikiBio()}
            fallback={<StatusMessage tone="empty">{t('sages.wiki.noExtract')}</StatusMessage>}
          >
            {(w) => (
              <Show
                when={w().enWiki || w().heWiki}
                fallback={<StatusMessage tone="empty">{t('sages.wiki.noPage')}</StatusMessage>}
              >
                <Show when={w().enWiki}>
                  {(p) => (
                    <div class="sage-wiki">
                      <ExtLink href={p().url}>
                        {t('sages.wiki.enPrefix')} {p().title}
                      </ExtLink>
                      <p class="sage-prose">{p().extract}</p>
                    </div>
                  )}
                </Show>
                <Show when={w().heWiki}>
                  {(p) => (
                    <div class="sage-wiki">
                      <ExtLink href={p().url}>
                        {t('sages.wiki.hePrefix')} {p().title}
                      </ExtLink>
                      <p class="sage-prose sage-prose-he" dir="rtl" lang="he">
                        {p().extract}
                      </p>
                    </div>
                  )}
                </Show>
              </Show>
            )}
          </Show>
        </Section>

        <Section
          label={t('sages.section.wikidata')}
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
          <Show
            when={wikidata()}
            fallback={<StatusMessage tone="empty">{t('sages.wikidata.noRecord')}</StatusMessage>}
          >
            {(w) => (
              <>
                <div class="sages-tags">
                  <ExtLink href={`https://www.wikidata.org/wiki/${w().qid}`}>{w().qid}</ExtLink>
                  <Show when={w().birthYear || w().deathYear}>
                    <span class="sages-muted">
                      {w().birthYear ?? '?'}–{w().deathYear ?? '?'}
                    </span>
                  </Show>
                </div>
                <WikidataEdges rec={w()} />
              </>
            )}
          </Show>
        </Section>

        <Show when={unified()}>
          {(u) => (
            <footer class="sage-foot">
              <span>{t('sages.foot.enriched', { date: fmtDate(u().enrichedAt) })}</span>
              <Show when={u().sources.length > 0}>
                <span>{t('sages.foot.sources', { sources: u().sources.join(', ') })}</span>
              </Show>
            </footer>
          )}
        </Show>
      </DetailSection>
    </article>
  );
}

function ExtLink(props: { href: string; children: JSX.Element }): JSX.Element {
  return (
    <a class="sages-ext" href={props.href} target="_blank" rel="noopener noreferrer">
      {props.children}
    </a>
  );
}

function Section(props: {
  label: string;
  actions?: JSX.Element;
  children: JSX.Element;
}): JSX.Element {
  return (
    <section class="sage-section">
      <SectionHeading title={props.label} detail={props.actions} />
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
        <Button
          variant="primary"
          disabled={props.running}
          onClick={() => props.onRun(props.stage)}
          title={t(STAGE_PATHS[props.stage].descKey)}
        >
          {props.running ? t('sages.stage.running') : t('sages.stage.run')}
        </Button>
      </Show>
      <Show when={props.cached}>
        <Button
          disabled={props.running}
          onClick={() => props.onRun(props.stage, true)}
          title={t('sages.stage.refreshTitle')}
        >
          {props.running ? t('sages.stage.refreshing') : t('sages.stage.refresh')}
        </Button>
      </Show>
      <Show when={props.error}>
        <span class="sages-err">{props.error}</span>
      </Show>
    </>
  );
}

function EdgeBucket(props: {
  label: string;
  edges: RabbiEdge[];
  nameFor: NameFor;
  onSelect: (s: string) => void;
}): JSX.Element {
  return (
    <Show when={props.edges.length > 0}>
      <div class="sages-bucket">
        <span class="sages-label">{props.label}</span>
        <div class="sages-tags">
          <For each={props.edges}>
            {(e) => (
              <Show when={e.slug} fallback={<span class="sages-tag sages-tag-dim">{e.name}</span>}>
                <Button
                  class="sages-tag sages-tag-link"
                  onClick={() => props.onSelect(e.slug!)}
                  title={
                    e.weight != null
                      ? t('sages.edge.sourceWeight', {
                          source: e.source,
                          weight: e.weight.toFixed(2),
                        })
                      : t('sages.edge.source', { source: e.source })
                  }
                >
                  {props.nameFor(e.slug!)}
                  <Show when={e.weight != null}>
                    <span class="sages-ts">{(e.weight as number).toFixed(2)}</span>
                  </Show>
                </Button>
              </Show>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}

function WikidataEdges(props: { rec: WikidataRecord }): JSX.Element {
  const r = () => props.rec;
  const rows = (): Array<{ label: string; ids: string[] }> => {
    const out: Array<{ label: string; ids: string[] }> = [];
    if (r().fatherQid) out.push({ label: t('sages.wd.father'), ids: [r().fatherQid as string] });
    if (r().motherQid) out.push({ label: t('sages.wd.mother'), ids: [r().motherQid as string] });
    if (r().spouseQids.length) out.push({ label: t('sages.wd.spouses'), ids: r().spouseQids });
    if (r().childQids.length) out.push({ label: t('sages.wd.children'), ids: r().childQids });
    if (r().teacherQids.length) out.push({ label: t('sages.wd.teachers'), ids: r().teacherQids });
    if (r().studentQids.length) out.push({ label: t('sages.wd.students'), ids: r().studentQids });
    return out;
  };
  return (
    <Show when={rows().length > 0}>
      <For each={rows()}>
        {(row) => (
          <div class="sages-bucket">
            <span class="sages-label">{row.label}</span>
            <div class="sages-tags">
              <For each={row.ids}>
                {(id) => <ExtLink href={`https://www.wikidata.org/wiki/${id}`}>{id}</ExtLink>}
              </For>
            </div>
          </div>
        )}
      </For>
    </Show>
  );
}

function hasAnyRefs(r: UnifiedRecord['refs']): boolean {
  return !!(r.sefariaSlug || r.enWiki || r.heWiki || r.je || r.wikidata);
}
function fmtDate(s: string): string {
  if (!s) return '?';
  try {
    return new Date(s).toLocaleDateString(lang() === 'he' ? 'he-IL' : undefined);
  } catch {
    return s;
  }
}
