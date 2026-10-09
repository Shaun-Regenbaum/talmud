import { Button } from '@corpus/ui/Button';
import { Input, StatusMessage } from '@corpus/ui/Study';
import { createMemo, createResource, createSignal, For, onCleanup, Show } from 'solid-js';
import { lang, t } from './i18n';
import { sefariaUrl } from './sageInteractions';
import {
  loadStories,
  loadStoryPeople,
  type StoryClaim,
  type StoryIndex,
  type StoryPassage,
  storySearchKey,
} from './storyReadings';
import './story-readings.css';

const PAGE_SIZE = 30;
function readRoute() {
  const part = location.hash.slice('#stories/'.length);
  if (location.hash.startsWith('#stories/q/')) {
    try {
      return { query: decodeURIComponent(part.slice(2)), selected: '' };
    } catch {
      return { query: '', selected: '' };
    }
  }
  return { query: '', selected: /^b\d{3}-p\d+$/.test(part) ? part : '' };
}
export function StoryReadingsPage() {
  const [route, setRoute] = createSignal(readRoute());
  const [query, setQuery] = createSignal(route().query);
  const [corpus, setCorpus] = createSignal('');
  const [limit, setLimit] = createSignal(PAGE_SIZE);
  const sync = () => {
    const next = readRoute();
    setRoute(next);
    setQuery(next.query);
    setLimit(PAGE_SIZE);
  };
  window.addEventListener('hashchange', sync);
  onCleanup(() => window.removeEventListener('hashchange', sync));
  const [failed, setFailed] = createSignal(false);
  const [index, { refetch }] = createResource(async () => {
    setFailed(false);
    try {
      return await loadStories<StoryIndex>('index');
    } catch {
      setFailed(true);
      return null;
    }
  });
  const searchable = createMemo(() =>
    (index()?.passages ?? []).map((row) => ({
      row,
      text: storySearchKey([row.ref, ...row.names, ...row.mentions].join(' ')),
    })),
  );
  const matches = createMemo(() => {
    const q = storySearchKey(query());
    return searchable()
      .filter(({ row, text }) => (!corpus() || row.corpus === corpus()) && (!q || text.includes(q)))
      .map(({ row }) => row);
  });
  return (
    <main class="page-shell story-page">
      <header class="story-page-head">
        <h1>{t('stories.title')}</h1>
        <a href="#sages">{t('sages.title')}</a>
      </header>
      <p>{t('stories.intro')}</p>
      <Show when={index()}>
        <p class="story-note">
          {t('stories.coverage', {
            count: index()!.summary.passages,
            packs: index()!.summary.packs,
          })}
        </p>
      </Show>
      <Show when={!route().selected} fallback={<StoryDetail id={route().selected} />}>
        <form
          class="story-search"
          onSubmit={(e) => {
            e.preventDefault();
            location.hash = `stories/q/${encodeURIComponent(query())}`;
          }}
        >
          <label for="story-search">
            {t('stories.search')}
            <Input
              id="story-search"
              value={query()}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                setLimit(PAGE_SIZE);
              }}
            />
          </label>
          <label>
            {t('stories.collection')}
            <select
              aria-label={t('stories.collection')}
              value={corpus()}
              onChange={(e) => {
                setCorpus(e.currentTarget.value);
                setLimit(PAGE_SIZE);
              }}
            >
              <option value="">{t('stories.all')}</option>
              <For each={Object.keys(index()?.summary.corpora ?? {})}>
                {(c) => <option value={c}>{t(`stories.corpus.${c}`)}</option>}
              </For>
            </select>
          </label>
        </form>
        <p class="story-note">{t('stories.namesNote')}</p>
        <Show
          when={!index.loading}
          fallback={<StatusMessage tone="loading">{t('sages.list.loading')}</StatusMessage>}
        >
          <Show
            when={!failed()}
            fallback={
              <StatusMessage
                tone="error"
                onRetry={() => refetch()}
                retryLabel={t('sages.connections.retry')}
              >
                {t('stories.error')}
              </StatusMessage>
            }
          >
            <p role="status">{t('stories.matches', { count: matches().length })}</p>
            <ul class="story-results">
              <For each={matches().slice(0, limit())}>
                {(row) => (
                  <li>
                    <a href={`#stories/${row.id}`}>{row.ref}</a>
                    <span class="story-note">{t(`stories.corpus.${row.corpus}`)}</span>
                    <p class="story-result-names">
                      <For each={row.names.slice(0, 8)}>{(name) => <bdi>{name}</bdi>}</For>
                    </p>
                  </li>
                )}
              </For>
            </ul>
            <Show when={matches().length > limit()}>
              <Button onClick={() => setLimit(limit() + PAGE_SIZE)}>{t('stories.more')}</Button>
            </Show>
          </Show>
        </Show>
      </Show>
    </main>
  );
}
function StoryDetail(props: { id: string }) {
  const [people, { refetch: retryPeople }] = createResource(
    () => props.id,
    async (id) => {
      try {
        return { id, links: await loadStoryPeople(id), failed: false };
      } catch {
        return { id, links: {}, failed: true };
      }
    },
  );
  const personId = (id: string) =>
    !people.loading && people()?.id === props.id ? people()?.links[`${props.id}/${id}`] : undefined;
  const [failed, setFailed] = createSignal(false);
  const [pack, { refetch }] = createResource(
    () => props.id.split('-')[0],
    async (id) => {
      setFailed(false);
      try {
        return await loadStories<{ passages: StoryPassage[] }>(id);
      } catch {
        setFailed(true);
        return null;
      }
    },
  );
  const row = () => pack()?.passages.find((p) => p.id === props.id);
  const name = (id: string | undefined) =>
    row()?.reading?.people.find((p) => p.id === id)?.label ??
    t(id === 'none' ? 'stories.noAddressee' : 'stories.unknownPerson');
  const label = (value: string | undefined) => {
    const key = `stories.kind.${value}`;
    const translated = t(key);
    return translated === key
      ? (value ?? '').replace(/^other:/, '').replaceAll('_', ' ')
      : translated;
  };
  const Claim = (p: { claim: StoryClaim; speech?: boolean }) => (
    <li class="story-claim">
      <span class="story-note">{t('stories.proposed')}</span>
      <p dir={lang() === 'he' && !p.claim.relation?.startsWith('other:') ? 'rtl' : 'ltr'}>
        <strong>
          <bdi>{name(p.speech ? p.claim.speaker : p.claim.a)}</bdi>
        </strong>{' '}
        {label(p.speech ? p.claim.kind : p.claim.relation)}{' '}
        <strong>
          <bdi>{name(p.speech ? p.claim.addressee : p.claim.b)}</bdi>
        </strong>
      </p>
      <Show when={p.claim.note}>
        <p dir="ltr" lang="en">
          {p.claim.note}
        </p>
      </Show>
      <p class="story-note">
        {p.speech
          ? t('stories.speechBasis', {
              speaker: t(`stories.basis.${p.claim.speaker_basis}`),
              addressee: t(`stories.basis.${p.claim.addressee_basis}`),
            })
          : t(`stories.basis.${p.claim.basis}`)}
      </p>
      <Show when={p.claim.quoteLocation === 'context'}>
        <p class="story-note">{t('stories.contextQuote')}</p>
      </Show>
      <blockquote dir="rtl" lang="he">
        {p.claim.quote}
      </blockquote>
    </li>
  );
  return (
    <article class="story-detail">
      <a href="#stories">{t('stories.back')}</a>
      <Show
        when={!pack.loading}
        fallback={<StatusMessage tone="loading">{t('sages.list.loading')}</StatusMessage>}
      >
        <Show
          when={!failed()}
          fallback={
            <StatusMessage
              tone="error"
              onRetry={() => refetch()}
              retryLabel={t('sages.connections.retry')}
            >
              {t('stories.error')}
            </StatusMessage>
          }
        >
          <Show when={row()} fallback={<p>{t('stories.missing')}</p>}>
            {(r) => (
              <>
                <header>
                  <h2>{r().ref}</h2>
                  <Show when={sefariaUrl(r().ref)}>
                    {(url) => (
                      <a href={url()} target="_blank" rel="noopener noreferrer">
                        {t('sages.pair.source')}
                      </a>
                    )}
                  </Show>
                </header>
                <section>
                  <h3>{t('stories.source')}</h3>
                  <blockquote class="story-source" dir="rtl" lang="he">
                    {r().source.passage}
                  </blockquote>
                </section>
                <details>
                  <summary>{t('stories.context')}</summary>
                  <h4>{t('stories.before')}</h4>
                  <p dir="rtl" lang="he">
                    {r().source.before}
                  </p>
                  <h4>{t('stories.after')}</h4>
                  <p dir="rtl" lang="he">
                    {r().source.after}
                  </p>
                </details>
                <Show when={r().reading} fallback={<p>{t('stories.withheld')}</p>}>
                  {(reading) => (
                    <>
                      <section>
                        <h3>{t('stories.notes')}</h3>
                        <p class="story-note">{t('stories.readingNote')}</p>
                        <p dir="ltr" lang="en">
                          {reading().story}
                        </p>
                      </section>
                      <Show when={reading().unclear.length}>
                        <section>
                          <h3>{t('stories.unclear')}</h3>
                          <ul>
                            <For each={reading().unclear}>
                              {(note) => (
                                <li dir="ltr" lang="en">
                                  {note}
                                </li>
                              )}
                            </For>
                          </ul>
                        </section>
                      </Show>
                      <section>
                        <h3>{t('stories.people')}</h3>
                        <Show
                          when={!people.loading && people()?.id === props.id && people()?.failed}
                        >
                          <StatusMessage
                            tone="error"
                            onRetry={() => retryPeople()}
                            retryLabel={t('sages.connections.retry')}
                          >
                            {t('checked.namesError')}
                          </StatusMessage>
                        </Show>
                        <ul class="story-people">
                          <For each={reading().people}>
                            {(p) => (
                              <li>
                                <strong dir="auto">
                                  <Show when={personId(p.id)} fallback={p.label}>
                                    {(id) => (
                                      <a href={`#sages/${encodeURIComponent(id())}`}>{p.label}</a>
                                    )}
                                  </Show>
                                </strong>
                                <span class="story-note">{t(`stories.named.${p.named}`)}</span>
                                <Show when={p.note}>
                                  <p class="story-person-note" dir="ltr" lang="en">
                                    {p.note}
                                  </p>
                                </Show>
                                <span dir="rtl" lang="he">
                                  {p.quote}
                                </span>
                                <Show when={p.quoteLocation === 'context'}>
                                  <small>{t('stories.contextQuote')}</small>
                                </Show>
                              </li>
                            )}
                          </For>
                        </ul>
                      </section>
                      <Show when={reading().relations.length}>
                        <section>
                          <h3>{t('stories.relations')}</h3>
                          <p class="story-note">{t('stories.claimNote')}</p>
                          <ul class="story-claims">
                            <For each={reading().relations}>
                              {(claim) => <Claim claim={claim} />}
                            </For>
                          </ul>
                        </section>
                      </Show>
                      <Show when={reading().speech.length}>
                        <section>
                          <h3>{t('stories.speech')}</h3>
                          <p class="story-note">{t('stories.claimNote')}</p>
                          <ul class="story-claims">
                            <For each={reading().speech}>
                              {(claim) => <Claim claim={claim} speech />}
                            </For>
                          </ul>
                        </section>
                      </Show>
                    </>
                  )}
                </Show>
                <p class="story-note">{t('stories.record', { id: r().id })}</p>
              </>
            )}
          </Show>
        </Show>
      </Show>
    </article>
  );
}
