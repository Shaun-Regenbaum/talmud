/** Browse a sage through names, sources and links to other people. */
import { StatusMessage } from '@corpus/ui/Study';
import { createMemo, createResource, createSignal, For, type JSX, onCleanup, Show } from 'solid-js';
import { canonicalSlug } from '../lib/rabbi/identity';
import type { IdentifiedRabbi } from './dafContext';
import { GENERATION_BY_ID, type GenerationId, generationLabelHe } from './generations';
import { lang, t } from './i18n';
import { PersonConnections } from './PersonConnections';
import { PersonEra } from './PersonEra';
import { SageAutocomplete } from './SageAutocomplete';
import { SageConnections } from './SageConnections';
import { SageCoverageStrip } from './SageCoverageStrip';
import { SagePair } from './SagePair';
import { SageReviewedPair } from './SageReviewedPair';
import { academyLabel, placeLabel, roleLabel } from './sageLabels';
import type { IndexRow } from './sageSearch';
import './sages.css';

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

async function getJSON<T>(url: string, missing?: T): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (response.status === 404 && missing !== undefined) return missing;
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}
export function SagesPage(): JSX.Element {
  const [index, { refetch }] = createResource(() => getJSON<IndexResp>('/api/sages-index'));
  const hashSlug = () => {
    if (!location.hash.startsWith('#sages/')) return null;
    try {
      return canonicalSlug(decodeURIComponent(location.hash.slice(7).split('/with/')[0])) || null;
    } catch {
      return null;
    }
  };
  const [selected, setSelected] = createSignal(hashSlug());
  const pairKey = () => {
    try {
      return decodeURIComponent(location.hash.split('/with/')[1] ?? '');
    } catch {
      return '';
    }
  };
  const [partner, setPartner] = createSignal(pairKey());
  const sync = () => {
    setSelected(hashSlug());
    setPartner(pairKey());
  };
  window.addEventListener('hashchange', sync);
  onCleanup(() => window.removeEventListener('hashchange', sync));
  const rows = createMemo(() => new Map((index()?.rows ?? []).map((row) => [row.slug, row])));
  const nameFor: NameFor = (slug) => {
    const row = rows().get(canonicalSlug(slug));
    return row ? namePair(row.canonical, row.canonicalHe).main : slug;
  };
  const select = (slug: string) => {
    slug = canonicalSlug(slug);
    setPartner('');
    setSelected(slug);
    location.hash = `sages/${encodeURIComponent(slug)}`;
    requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('.sage-name');
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: 'nearest' });
    });
  };
  return (
    <main class="page-shell sages-page sages-reading-page">
      <header class="responsive-row sages-head">
        <h1 class="sages-title">{t('sages.title')}</h1>
        <a href="#daf" class="sages-back">
          {t('usage.backToDaf')}
        </a>
      </header>
      <p>
        <a href="#stories">{t('stories.title')}</a>
      </p>
      <SageAutocomplete
        rows={index()?.rows ?? []}
        loading={index.loading}
        failed={!index.loading && !index()}
        onRetry={() => refetch()}
        onSelect={select}
      />
      <Show
        when={selected()}
        keyed
        fallback={
          <div class="sages-search-start">
            <h2>{t('sages.welcome.title')}</h2>
            <p>{t('sages.search.start')}</p>
          </div>
        }
      >
        {(slug) => (
          <Show
            when={partner()}
            fallback={
              <SageDetail
                slug={slug}
                generationId={rows().get(slug)?.generation ?? null}
                nameFor={nameFor}
                onSelect={select}
              />
            }
          >
            <Show
              when={
                (slug === 'abaye' && partner() === 'rava') ||
                (slug === 'rava' && partner() === 'abaye')
              }
              fallback={<SagePair partnerKey={partner()} slug={slug} nameFor={nameFor} />}
            >
              <SageReviewedPair slug={slug} />
            </Show>
          </Show>
        )}
      </Show>
    </main>
  );
}
function SageDetail(props: {
  slug: string;
  generationId: string | null;
  nameFor: NameFor;
  onSelect: (slug: string) => void;
}): JSX.Element {
  const [profileFailed, setProfileFailed] = createSignal(false);
  const [unified, { refetch }] = createResource(
    () => props.slug,
    async (slug) => {
      const result = await getJSON<{ record: UnifiedRecord | null }>(
        `/api/admin/rabbi-enriched/${encodeURIComponent(slug)}`,
        { record: null },
      );
      setProfileFailed(!result);
      return result?.record ?? null;
    },
  );
  const [basic, { refetch: retryBasic }] = createResource(
    () => (!unified.loading && !unified() && !profileFailed() ? props.slug : undefined),
    async (slug) => getJSON<{ rabbi: IdentifiedRabbi }>(`/api/rabbi/${encodeURIComponent(slug)}`),
  );
  const savedPerson = () =>
    !unified() && basic()?.rabbi.slug === props.slug ? basic()?.rabbi : undefined;
  const personFailed = () => profileFailed() || (basic.state === 'ready' && !basic());
  const [cohort] = createResource(() =>
    getJSON<{ bySage: Record<string, string[]> }>('/api/admin/rabbi-cohort'),
  );
  const [places] = createResource(() =>
    getJSON<{ byPlace: Record<string, string[]> }>('/api/admin/rabbi-places-index'),
  );
  const [academy] = createResource(() =>
    getJSON<{ byAcademy: Record<string, string[]> }>('/api/admin/rabbi-academy-roster'),
  );
  const contemporaries = () => cohort()?.bySage?.[props.slug] ?? [];
  const academyMates = () =>
    (academy()?.byAcademy[unified()?.academy ?? ''] ?? []).filter((s) => s !== props.slug);
  const placeMates = () =>
    (unified()?.places ?? [])
      .map((place) => ({
        place,
        sages: (places()?.byPlace[place] ?? []).filter((s) => s !== props.slug),
      }))
      .filter((row) => row.sages.length);
  const SageLinks = (p: { slugs: string[] }) => (
    <div class="sages-name-links">
      <For each={p.slugs}>
        {(slug) => (
          <button type="button" class="sages-person-link" onClick={() => props.onSelect(slug)}>
            {props.nameFor(slug)}
          </button>
        )}
      </For>
    </div>
  );
  return (
    <article class="sage-detail">
      <header class="sage-head">
        <div class="sage-head-titles">
          <h2 class="sage-name" tabIndex={-1}>
            <span>
              {
                namePair(
                  unified()?.canonical.en ?? savedPerson()?.name ?? props.nameFor(props.slug),
                  unified()?.canonical.he ?? savedPerson()?.nameHe,
                ).main
              }
            </span>
            <Show
              when={
                namePair(
                  unified()?.canonical.en ?? savedPerson()?.name ?? props.nameFor(props.slug),
                  unified()?.canonical.he ?? savedPerson()?.nameHe,
                ).other
              }
            >
              {(name) => (
                <span class="sage-name-other" dir="auto">
                  {name()}
                </span>
              )}
            </Show>
          </h2>
        </div>
      </header>

      <Show when={(unified.loading || basic.loading) && !unified() && !savedPerson()}>
        <StatusMessage tone="loading">{t('sages.detail.loadingSage')}</StatusMessage>
      </Show>

      <Show when={!unified.loading && !basic.loading && !unified() && !savedPerson()}>
        <StatusMessage
          tone={personFailed() ? 'error' : 'empty'}
          onRetry={() => (profileFailed() ? refetch() : retryBasic())}
          retryLabel={t('sages.connections.retry')}
        >
          {t(personFailed() ? 'sages.connections.profileError' : 'sages.connections.noBio')}{' '}
        </StatusMessage>
      </Show>

      <Show when={savedPerson()}>
        {(person) => (
          <>
            <PersonEra generation={person().generation} />
            <section class="sage-biography">
              <Show
                when={person().bio}
                fallback={<StatusMessage tone="empty">{t('sages.bio.empty')}</StatusMessage>}
              >
                <p class="sage-prose" dir="ltr" lang="en">
                  {person().bio}
                </p>
              </Show>
            </section>
          </>
        )}
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

            <section class="sage-biography">
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
            </section>
          </>
        )}
      </Show>

      <p>
        <a
          href={`#stories/q/${encodeURIComponent(unified()?.canonical.he || savedPerson()?.nameHe || props.nameFor(props.slug))}`}
        >
          {t('stories.profileLink')}
        </a>
      </p>
      <SageCoverageStrip slug={props.slug} generation={props.generationId} />
      <Show when={props.slug === 'abaye' || props.slug === 'rava'}>
        <p>
          <a href={`#sages/${props.slug}/with/${props.slug === 'abaye' ? 'rava' : 'abaye'}`}>
            {t('sages.review.open')}
          </a>
        </p>
      </Show>
      <PersonConnections
        id={props.slug}
        name={props.nameFor(props.slug)}
        onPerson={props.onSelect}
      />
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
          <section class="sages-background" aria-label={t('sages.background')}>
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
              <Section
                label={t('sages.section.contemporaries', {
                  gen: genLabel(props.generationId ?? u().generation),
                })}
              >
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
          </section>
        )}
      </Show>
    </article>
  );
}
function Section(props: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <section class="sage-section">
      <h3>{props.label}</h3>
      {props.children}
    </section>
  );
}
function EdgeBucket(props: {
  label: string;
  edges: RabbiEdge[];
  nameFor: NameFor;
  onSelect: (slug: string) => void;
}): JSX.Element {
  return (
    <Show when={props.edges.length}>
      <div class="sage-role-group">
        <h4>{props.label}</h4>
        <div class="sages-name-links">
          <For each={props.edges}>
            {(edge) => (
              <Show when={edge.slug} fallback={<span>{edge.name}</span>}>
                <button
                  type="button"
                  class="sages-person-link"
                  onClick={() => props.onSelect(edge.slug!)}
                >
                  {props.nameFor(edge.slug!) === edge.slug ? edge.name : props.nameFor(edge.slug!)}
                </button>
              </Show>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
