/** Names in the text that might be this sage but were placed on someone else or left open. Machine reading, shown as such. */
import { createResource, For, type JSX, Show } from 'solid-js';
import type { SageMaybe } from '../lib/sage-graph/sage-maybe';
import { lang, t } from './i18n';
import { sefariaUrl } from './sageInteractions';

const VISIBLE = 6;

async function load(slug: string): Promise<SageMaybe[]> {
  try {
    const response = await fetch(`/api/sage-graph/sage-maybe/${encodeURIComponent(slug)}`);
    if (!response.ok) return [];
    return ((await response.json()) as { maybe?: SageMaybe[] }).maybe ?? [];
  } catch {
    return [];
  }
}

export function SageMaybeInText(props: {
  slug: string;
  nameFor: (slug: string) => string;
  onSelect: (slug: string) => void;
}): JSX.Element {
  const [items] = createResource(() => props.slug, load);
  const number = (n: number) => n.toLocaleString(lang() === 'he' ? 'he-IL' : 'en-US');
  const person = (slug: string): JSX.Element => (
    <button type="button" class="sages-person-link" onClick={() => props.onSelect(slug)}>
      {props.nameFor(slug)}
    </button>
  );
  const Row = (rowProps: { item: SageMaybe }): JSX.Element => {
    const item = rowProps.item;
    const lead = () =>
      t(`sages.maybe.${item.state}`, {
        name: item.label,
        placed: item.placedAs ? props.nameFor(item.placedAs) : '',
      });
    return (
      <li>
        <p class="sage-maybe-what">
          {lead()}{' '}
          <Show
            when={sefariaUrl(item.ref)}
            fallback={<span class="sage-seen-ref">{item.ref}</span>}
          >
            {(url) => (
              <a class="sage-seen-ref" href={url()} target="_blank" rel="noreferrer">
                {item.ref}
              </a>
            )}
          </Show>
        </p>
        <Show when={item.why}>
          <p class="sage-maybe-why">
            {t(item.state === 'which_one' ? 'sages.maybe.why' : 'sages.maybe.whynot')}
            {item.why}
          </p>
        </Show>
        <Show when={item.alsoPossible.length > 0}>
          <p class="sage-maybe-why">
            {t('sages.maybe.also')}
            <For each={item.alsoPossible}>
              {(other, i) => (
                <>
                  {i() > 0 ? ', ' : ''}
                  {person(other)}
                </>
              )}
            </For>
          </p>
        </Show>
      </li>
    );
  };
  return (
    <Show when={(items()?.length ?? 0) > 0}>
      <section class="sage-seen sage-maybe" aria-labelledby="sage-maybe-title">
        <h3 id="sage-maybe-title">{t('sages.maybe.title')}</h3>
        <p class="sage-seen-note">{t('sages.maybe.note')}</p>
        <ul class="sage-seen-list">
          <For each={items()?.slice(0, VISIBLE)}>{(item) => <Row item={item} />}</For>
        </ul>
        <Show when={(items()?.length ?? 0) > VISIBLE}>
          <details class="sage-seen-more">
            <summary>
              {t('sages.maybe.more', { count: number((items()?.length ?? 0) - VISIBLE) })}
            </summary>
            <ul class="sage-seen-list">
              <For each={items()?.slice(VISIBLE)}>{(item) => <Row item={item} />}</For>
            </ul>
          </details>
        </Show>
      </section>
    </Show>
  );
}
