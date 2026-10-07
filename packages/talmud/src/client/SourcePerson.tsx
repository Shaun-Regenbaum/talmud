import { StatusMessage } from '@corpus/ui/Study';
import { createResource, createSignal, onCleanup, Show } from 'solid-js';
import type { SourcePerson as SourcePersonData } from '../lib/sage-graph/types';
import { CheckedConnections } from './CheckedConnections';
import { lang, t } from './i18n';
import { sefariaUrl } from './sageInteractions';
import './sourcePerson.css';

export function SourcePerson(props: { id: string; onPerson?: (id: string) => void }) {
  const [person, { refetch }] = createResource(
    () => props.id,
    async (id) => {
      try {
        const response = await fetch(`/api/sage-graph/person?id=${encodeURIComponent(id)}`);
        return response.ok ? ((await response.json()) as SourcePersonData) : null;
      } catch {
        return null;
      }
    },
  );
  return (
    <section class="source-person" dir={lang() === 'he' ? 'rtl' : 'ltr'}>
      <Show when={person.loading}>
        <p>{t('sourcePerson.loading')}</p>
      </Show>
      <Show when={!person.loading && !person()}>
        <StatusMessage
          tone="error"
          onRetry={() => void refetch()}
          retryLabel={t('sages.connections.retry')}
        >
          {t('sourcePerson.error')}
        </StatusMessage>
      </Show>
      <Show when={!person.loading && person()}>
        {(p) => (
          <>
            <p class="source-person-caption">{t('sourcePerson.title')}</p>
            <h2>
              <bdi>{lang() === 'he' ? p().nameHe : p().name}</bdi>
            </h2>
            <p>{lang() === 'he' ? p().summaryHe : p().summary}</p>
            <p class="source-person-note">{t('sourcePerson.unresolved')}</p>
            <blockquote lang="he" dir="rtl">
              {p().quote}
            </blockquote>
            <a href={sefariaUrl(p().ref) ?? undefined} target="_blank" rel="noopener noreferrer">
              <bdi>{p().ref}</bdi>
            </a>
            <CheckedConnections
              query={{ person: p().id }}
              revision={p().revision}
              onPerson={props.onPerson}
            />
          </>
        )}
      </Show>
    </section>
  );
}

export function SourcePersonPage() {
  const readId = () => {
    try {
      return decodeURIComponent(location.hash.slice('#source-person/'.length));
    } catch {
      return '';
    }
  };
  const [id, setId] = createSignal(readId());
  const update = () => setId(readId());
  window.addEventListener('hashchange', update);
  onCleanup(() => window.removeEventListener('hashchange', update));
  return (
    <main class="source-person-page">
      <SourcePerson id={id()} />
    </main>
  );
}
