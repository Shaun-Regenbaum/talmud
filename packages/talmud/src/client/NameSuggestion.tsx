import { For, Show } from 'solid-js';
import type { NameSuggestion as Suggestion } from '../lib/sage-graph/initial-readings';
import { lang, t } from './i18n';

/** A checked person's first registry lookup, shown on the card. It never reads as a confirmed identity. */
export function NameSuggestion(props: { suggestion: Suggestion }) {
  const name = (e: { name: string; nameHe: string }) => (lang() === 'he' ? e.nameHe : e.name);
  return (
    <section class="person-name-suggestion">
      <h4>{t('nameSuggestion.title')}</h4>
      <Show when={props.suggestion.candidate} fallback={<p>{t('nameSuggestion.notIdentified')}</p>}>
        {(candidate) => (
          <p>
            {t('nameSuggestion.possible')}{' '}
            <a href={`#sages/${encodeURIComponent(candidate().id)}`}>{name(candidate())}</a>
          </p>
        )}
      </Show>
      <Show when={props.suggestion.registryEntries}>
        {(entries) => (
          <p>
            {t('nameSuggestion.entries')}{' '}
            <For each={entries().listed}>
              {(entry, i) => (
                <>
                  {i() > 0 ? ', ' : ''}
                  <a href={`#sages/${encodeURIComponent(entry.id)}`}>{name(entry)}</a>
                </>
              )}
            </For>
            <Show when={entries().total > entries().listed.length}>
              {' '}
              {t('nameSuggestion.more', { count: entries().total - entries().listed.length })}
            </Show>
          </p>
        )}
      </Show>
      <p>{props.suggestion.reason}</p>
    </section>
  );
}
