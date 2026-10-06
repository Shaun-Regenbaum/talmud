import { StatusMessage } from '@corpus/ui/Study';
import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { lang, t } from './i18n';
import { sefariaUrl } from './sageInteractions';

type Words = { en: string; he: string };
type Group = 'relationships' | 'words' | 'views' | 'events';
interface ReviewedRow {
  passageId: string;
  ref: string;
  status: 'included' | 'excluded' | 'unresolved';
  groups: Group[];
  mode?: 'discussion' | 'narrated' | 'reported' | 'proposed' | 'message' | 'versions';
  summary: Words;
  note?: Words;
  quote: string;
}
interface ReviewedPair {
  scope: Words;
  identityBasis: Words;
  rows: ReviewedRow[];
}
const groups: Group[] = ['relationships', 'words', 'views', 'events'];
const words = (value: Words) => value[lang() === 'he' ? 'he' : 'en'];

export function SageReviewedPair(props: { slug: string }) {
  const [failed, setFailed] = createSignal(false);
  const [data, { refetch }] = createResource(async (): Promise<ReviewedPair | null> => {
    setFailed(false);
    try {
      const response = await fetch('/sage-reviews/abaye-rava.json');
      if (!response.ok || !response.headers.get('content-type')?.includes('json'))
        throw new Error('Review unavailable');
      const result = (await response.json()) as ReviewedPair;
      if (!Array.isArray(result.rows) || !result.scope || !result.identityBasis)
        throw new Error('Review unavailable');
      return result;
    } catch {
      setFailed(true);
      return null;
    }
  });
  const [chosen, setChosen] = createSignal<Group | 'all' | 'excluded' | 'unresolved'>('all');
  const included = createMemo(() => data()?.rows.filter((r) => r.status === 'included') ?? []);
  const rows = createMemo(() => {
    const filter = chosen();
    if (filter === 'excluded' || filter === 'unresolved')
      return data()?.rows.filter((r) => r.status === filter) ?? [];
    return filter === 'all' ? included() : included().filter((r) => r.groups.includes(filter));
  });
  const count = (group: Group) => included().filter((r) => r.groups.includes(group)).length;
  return (
    <article class="sage-detail sage-pair sage-reviewed-pair">
      <a href={`#sages/${props.slug}`}>{t('sages.pair.back')}</a>
      <header>
        <p class="sages-note">{t('sages.review.title')}</p>
        <div class="sage-pair-names">
          <h2>
            <a href="#sages/abaye">{t('sages.review.abaye')}</a>
          </h2>
          <span aria-hidden="true">＋</span>
          <h2>
            <a href="#sages/rava">{t('sages.review.rava')}</a>
          </h2>
        </div>
      </header>
      <Show when={!data.loading} fallback={<p>{t('sages.list.loading')}</p>}>
        <Show
          when={!failed() && data()}
          fallback={
            <StatusMessage
              tone="error"
              onRetry={() => refetch()}
              retryLabel={t('sages.connections.retry')}
            >
              {t('sages.connections.error')}
            </StatusMessage>
          }
        >
          {(review) => (
            <>
              <p>
                {t('sages.review.total', {
                  checked: String(review().rows.length),
                  included: String(included().length),
                })}
              </p>
              <p class="sages-note">{t('sages.review.limit')}</p>
              <section class="sage-review-map" aria-label={t('sages.review.groups')}>
                <For each={groups}>
                  {(group) => (
                    <button
                      type="button"
                      aria-pressed={chosen() === group}
                      onClick={() => setChosen(group)}
                    >
                      <span>{t(`sages.review.group.${group}`)}</span>
                      <span class="sage-review-track" aria-hidden="true">
                        <span
                          style={{
                            width: `${(100 * count(group)) / Math.max(1, included().length)}%`,
                          }}
                        />
                      </span>
                      <strong>{count(group)}</strong>
                    </button>
                  )}
                </For>
              </section>
              <p class="sages-note">{t('sages.review.overlap')}</p>
              <div class="sage-pair-kinds">
                <button
                  type="button"
                  aria-pressed={chosen() === 'all'}
                  onClick={() => setChosen('all')}
                >
                  {t('sages.review.all')}
                </button>
                <For each={['unresolved', 'excluded'] as const}>
                  {(status) => (
                    <button
                      type="button"
                      aria-pressed={chosen() === status}
                      onClick={() => setChosen(status)}
                    >
                      {t(`sages.review.${status}`)} (
                      {review().rows.filter((r) => r.status === status).length})
                    </button>
                  )}
                </For>
              </div>
              <p aria-live="polite">
                {t('sages.review.showing', { count: String(rows().length) })}
              </p>
              <Show when={rows().length} fallback={<p>{t('sages.review.empty')}</p>}>
                <div class="sage-review-passages">
                  <For each={rows()}>
                    {(row) => (
                      <section class="sage-pair-quote">
                        <div class="sage-review-row-heading">
                          <h3>
                            <a href={`#stories/${row.passageId}`}>{row.ref}</a>
                          </h3>
                          <Show when={row.mode}>
                            {(mode) => (
                              <span class="sages-note">{t(`sages.review.mode.${mode()}`)}</span>
                            )}
                          </Show>
                        </div>
                        <p>{words(row.summary)}</p>
                        <blockquote dir="rtl" lang="he">
                          {row.quote}
                        </blockquote>
                        <Show when={row.note}>
                          {(note) => <p class="sages-note">{words(note())}</p>}
                        </Show>
                        <div class="sages-reference-links">
                          <a href={`#stories/${row.passageId}`}>{t('sages.review.full')}</a>
                          <a
                            href={sefariaUrl(row.ref) ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t('sages.pair.source')}
                          </a>
                        </div>
                      </section>
                    )}
                  </For>
                </div>
              </Show>
              <section class="sage-review-scope">
                <h3>{t('sages.review.scope')}</h3>
                <p>{words(review().scope)}</p>
                <p>{words(review().identityBasis)}</p>
              </section>
            </>
          )}
        </Show>
      </Show>
    </article>
  );
}
