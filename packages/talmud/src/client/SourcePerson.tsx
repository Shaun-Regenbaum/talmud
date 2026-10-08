import { createResource, createSignal, For, onCleanup, Show } from 'solid-js';
import type { SourcePerson as SourcePersonData } from '../lib/sage-graph/types';
import { lang, t } from './i18n';
import { PersonConnections } from './PersonConnections';
import { PersonEra } from './PersonEra';
import { PersonStatus } from './PersonStatus';
import RabbiTrajectoryMap from './RabbiTrajectoryMap';
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
        <PersonStatus error onRetry={() => void refetch()}>
          {t('sourcePerson.error')}
        </PersonStatus>
      </Show>
      <Show when={!person.loading && person()}>
        {(p) => (
          <>
            <p class="source-person-caption">{t('sourcePerson.title')}</p>
            <h2>
              <bdi>{lang() === 'he' ? p().nameHe : p().name}</bdi>
            </h2>
            <PersonEra reviewed={p().era} generation={p().generation} />
            <section class="person-biography">
              <h4>{t('person.biography')}</h4>
              <PersonStatus>{t('person.bioEmpty')}</PersonStatus>
              <p>{lang() === 'he' ? p().summaryHe : p().summary}</p>
              <details class="person-passage">
                <summary>{p().ref}</summary>
                <blockquote lang="he" dir="rtl">
                  {p().quote}
                </blockquote>
                <a
                  href={sefariaUrl(p().ref) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('person.openSource')}
                </a>
              </details>
            </section>
            <PersonConnections
              id={p().resolvedTo ?? p().id}
              name={lang() === 'he' ? p().nameHe : p().name}
              revision={p().revision}
              onPerson={props.onPerson}
            />
            <section class="person-places">
              <h4>{t('person.places')}</h4>
              <Show
                when={p().places?.length}
                fallback={<PersonStatus>{t('person.placesEmpty')}</PersonStatus>}
              >
                <RabbiTrajectoryMap
                  journeyControls
                  data={{
                    primaryStudyPlaces: [],
                    movements: [],
                    notablePlaces: (p().places ?? [])
                      .filter((place) => place.mapPlace)
                      .map((place) => ({
                        place: place.mapPlace!,
                        event: lang() === 'he' ? place.eventHe : place.event,
                      })),
                  }}
                  evidence={[]}
                  sourceForPlace={(name) => (
                    <For each={(p().places ?? []).filter((place) => place.mapPlace === name)}>
                      {(place) => (
                        <details class="person-passage">
                          <summary>{place.ref}</summary>
                          <blockquote lang="he" dir="rtl">
                            {place.quote}
                          </blockquote>
                          <a
                            href={sefariaUrl(place.ref) ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t('person.openSource')}
                          </a>
                        </details>
                      )}
                    </For>
                  )}
                />
                <For each={(p().places ?? []).filter((place) => !place.mapPlace)}>
                  {(place) => (
                    <details class="person-passage">
                      <summary>
                        {lang() === 'he' ? place.placeHe : place.place} · {place.ref}
                      </summary>
                      <p>{lang() === 'he' ? place.eventHe : place.event}</p>
                      <blockquote lang="he" dir="rtl">
                        {place.quote}
                      </blockquote>
                      <a
                        href={sefariaUrl(place.ref) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t('person.openSource')}
                      </a>
                    </details>
                  )}
                </For>
              </Show>
            </section>
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
