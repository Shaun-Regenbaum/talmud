import { Button } from '@corpus/ui/Button';
import { Input } from '@corpus/ui/Study';
import { createResource, createSignal, For, Show } from 'solid-js';
import type { InitialOccurrence } from '../lib/sage-graph/initial-readings';
import { readingPins, sourcePersonHash } from '../lib/sage-graph/reading-pins';
import { t } from './i18n';
import { PersonStatus } from './PersonStatus';
import './sourcePerson.css';

export function InitialReadingsPage() {
  const [input, setInput] = createSignal('');
  const [ref, setRef] = createSignal('');
  const [data, { refetch }] = createResource(
    () => ref() || undefined,
    async (value) => {
      try {
        const response = await fetch(`/api/sage-graph/initial?ref=${encodeURIComponent(value)}`);
        if (!response.ok) throw Error('Could not load readings');
        const result = (await response.json()) as {
          revision: string;
          sourceRevisions?: Record<'bavli' | 'other', string | null>;
          occurrences: InitialOccurrence[];
        };
        // Each card opened from this list reads the same revisions as the list.
        return { ...result, pins: readingPins(result.revision, result.sourceRevisions) };
      } catch {
        return null;
      }
    },
  );
  return (
    <main class="source-person source-person-page initial-readings-page">
      <header>
        <h1>{t('initial.title')}</h1>
        <a href="#sages">{t('sages.title')}</a>
      </header>
      <p>{t('initial.description')}</p>
      <form
        class="initial-reading-form"
        onSubmit={(event) => {
          event.preventDefault();
          setRef(input().trim());
        }}
      >
        <label for="initial-ref">{t('initial.page')}</label>{' '}
        <Input
          id="initial-ref"
          value={input()}
          onInput={(event) => setInput(event.currentTarget.value)}
        />{' '}
        <Button type="submit" disabled={!input().trim()}>
          {t('initial.find')}
        </Button>
      </form>
      <Show when={data.loading}>
        <PersonStatus>{t('sourcePerson.loading')}</PersonStatus>
      </Show>
      <Show when={!data.loading && data() === null}>
        <PersonStatus error onRetry={() => void refetch()}>
          {t('sourcePerson.error')}
        </PersonStatus>
      </Show>
      <Show when={data()}>
        {(result) => (
          <>
            <Show when={!result().occurrences.length}>
              <PersonStatus>{t('initial.empty')}</PersonStatus>
            </Show>
            <For each={result().occurrences}>
              {(occurrence) => (
                <section class="person-biography">
                  <p>
                    <bdi>{occurrence.quote}</bdi> · {occurrence.ref}
                    <Show when={occurrence.passageOnly}> · {t('initial.passageOnly')}</Show>
                  </p>
                  <For each={occurrence.people}>
                    {(person) => (
                      <p>
                        <a href={sourcePersonHash(person.id, result().pins)}>
                          <bdi>{person.name}</bdi>
                        </a>
                      </p>
                    )}
                  </For>
                </section>
              )}
            </For>
          </>
        )}
      </Show>
    </main>
  );
}
