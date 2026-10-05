import { StatusMessage } from '@corpus/ui/Study';
import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { TRACTATE_OPTIONS } from '../lib/sefref/tractates';
import { lang, t } from './i18n';
import { fetchSageInteractions, KINDS, sefariaUrl } from './sageInteractions';

const BAVLI = new Set(TRACTATE_OPTIONS.map((o) => o.value));
function plainText(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}
async function passage(ref: string) {
  const match = ref.match(/^(.*?)\s+(\d+[ab]):(\d+)$/);
  if (!match || !BAVLI.has(match[1])) return null;
  try {
    const response = await fetch(
      `/api/daf/${encodeURIComponent(match[1])}/${match[2]}?source=sefaria`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      mainSegmentsHe?: unknown[];
      mainSegmentsEn?: unknown[];
    };
    const index = Number(match[3]) - 1;
    const he = data.mainSegmentsHe?.[index];
    const en = data.mainSegmentsEn?.[index];
    return {
      he: typeof he === 'string' ? plainText(he) : '',
      en: typeof en === 'string' ? plainText(en) : '',
    };
  } catch {
    return null;
  }
}

/** Counts and example references come from the saved study; quotations come from the source text. */
export function SagePair(props: {
  slug: string;
  partnerKey: string;
  nameFor: (slug: string) => string;
}) {
  const [failed, setFailed] = createSignal(false);
  const [data, { refetch }] = createResource(
    () => props.slug,
    async (slug) => {
      setFailed(false);
      try {
        return await fetchSageInteractions(slug, true);
      } catch {
        setFailed(true);
        return null;
      }
    },
  );
  const partner = createMemo(() =>
    data()?.partners.find((p) => (p.slug ?? p.nameHe) === props.partnerKey),
  );
  const kinds = createMemo(() => KINDS.filter((k) => (partner()?.kinds[k.kind] ?? 0) > 0));
  const [chosen, setChosen] = createSignal('');
  const kind = () => kinds().find((k) => k.kind === chosen()) ?? kinds()[0];
  const refs = () => partner()?.refs[kind()?.kind] ?? [];
  const [selected, setSelected] = createSignal('');
  const ref = () => (refs().includes(selected()) ? selected() : refs()[0]);
  const [quote] = createResource(ref, passage);
  const subjectName = () =>
    (lang() === 'he' ? data()?.nameHe : data()?.name) || props.nameFor(props.slug);
  const otherName = () =>
    lang() === 'he' ? partner()?.nameHe : partner()?.name || partner()?.nameHe;
  return (
    <article class="sage-detail sage-pair">
      <a href={`#sages/${encodeURIComponent(props.slug)}`}>{t('sages.pair.back')}</a>
      <Show when={!data.loading} fallback={<p>{t('sages.list.loading')}</p>}>
        <Show
          when={partner()}
          fallback={
            failed() ? (
              <StatusMessage
                tone="error"
                onRetry={() => refetch()}
                retryLabel={t('sages.connections.retry')}
              >
                {t('sages.connections.error')}
              </StatusMessage>
            ) : (
              <p>{t('sages.pair.missing')}</p>
            )
          }
        >
          <header class="sage-pair-names">
            <h2>
              <a href={`#sages/${encodeURIComponent(props.slug)}`}>{subjectName()}</a>
            </h2>
            <span aria-hidden="true">＋</span>
            <h2>
              <Show when={partner()?.slug} fallback={otherName()}>
                <a href={`#sages/${encodeURIComponent(partner()!.slug!)}`}>{otherName()}</a>
              </Show>
            </h2>
          </header>
          <p class="sage-pair-total">
            {t('sages.partners.passages', { count: String(partner()!.total) })}
          </p>
          <p class="sages-note">{t('sages.pair.note')}</p>
          <div class="sage-pair-kinds">
            <For each={kinds()}>
              {(k) => (
                <button
                  type="button"
                  aria-pressed={kind()?.kind === k.kind}
                  onClick={() => {
                    setChosen(k.kind);
                    setSelected('');
                  }}
                >
                  <strong>{partner()!.kinds[k.kind]}</strong> {lang() === 'he' ? k.he : k.en}
                </button>
              )}
            </For>
          </div>
          <h3>{t('sages.pair.examples')}</h3>
          <p class="sages-note">{t('sages.pair.sample')}</p>
          <div class="sages-reference-links">
            <For each={refs()}>
              {(r) => (
                <button
                  type="button"
                  class="sages-person-link"
                  aria-pressed={r === ref()}
                  onClick={() => setSelected(r)}
                >
                  {r}
                </button>
              )}
            </For>
          </div>
          <Show when={ref()} fallback={<p>{t('sages.pair.unavailable')}</p>}>
            <section class="sage-pair-quote" aria-busy={quote.loading}>
              <h4>{ref()}</h4>
              <Show when={!quote.loading} fallback={<p>{t('sages.list.loading')}</p>}>
                <Show
                  when={quote()?.he || quote()?.en}
                  fallback={<p>{t('sages.pair.unavailable')}</p>}
                >
                  <Show when={quote()?.he}>
                    <blockquote dir="rtl" lang="he">
                      {quote()?.he}
                    </blockquote>
                  </Show>
                  <Show when={quote()?.en}>
                    <blockquote dir="ltr" lang="en">
                      {quote()?.en}
                    </blockquote>
                  </Show>
                </Show>
              </Show>
              <Show when={sefariaUrl(ref())}>
                {(url) => (
                  <a href={url()} target="_blank" rel="noopener noreferrer">
                    {t('sages.pair.source')}
                  </a>
                )}
              </Show>
            </section>
          </Show>
        </Show>
      </Show>
    </article>
  );
}
