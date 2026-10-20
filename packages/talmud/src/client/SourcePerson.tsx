import { createResource, createSignal, For, onCleanup, Show } from 'solid-js';
import type { SourcePerson as SourcePersonData } from '../lib/sage-graph/types';
import { InitialInteractions } from './InitialInteractions';
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
    <section
      class="source-person"
      classList={{ 'source-person-initial': !!person()?.initialReading }}
      dir={lang() === 'he' ? 'rtl' : 'ltr'}
    >
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
            <p class="source-person-caption">
              {t(p().initialReading ? 'initial.cardTitle' : 'sourcePerson.title')}
            </p>
            <h2>
              <bdi>{lang() === 'he' ? p().nameHe : p().name}</bdi>
            </h2>
            <Show when={p().initialReading?.proposals}>
              <For each={p().initialReading?.reviewedPeople}>
                {(person) => (
                  <p>
                    {t('initial.reviewedIdentity')}{' '}
                    <a href={`#sages/${encodeURIComponent(person.id)}`}>{person.name}</a>
                  </p>
                )}
              </For>
            </Show>
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
            <Show when={p().initialReading}>
              {(reading) => (
                <>
                  <details class="person-passage">
                    <summary>{t('initial.basis')}</summary>
                    <p>{reading().reason}</p>
                    <For each={reading().proposals ? [] : reading().reviewedPeople}>
                      {(reviewed) => (
                        <p>
                          {t('initial.reviewedAtWords')}{' '}
                          <a
                            href={
                              reviewed.id.startsWith('local:')
                                ? `#source-person/${encodeURIComponent(reviewed.id)}`
                                : `#sages/${encodeURIComponent(reviewed.id)}`
                            }
                          >
                            {reviewed.name}
                          </a>
                        </p>
                      )}
                    </For>
                    <For each={reading().proposals}>
                      {(proposal) => (
                        <section>
                          <Show when={proposal.sourceWarning}>
                            <PersonStatus error>{t('initial.sourceWarning')}</PersonStatus>
                          </Show>
                          <Show when={proposal.candidate}>
                            {(candidate) => (
                              <p>
                                {t('initial.possibleMatch')}{' '}
                                <a href={`#sages/${encodeURIComponent(candidate().id)}`}>
                                  {lang() === 'he' ? candidate().nameHe : candidate().name}
                                </a>
                              </p>
                            )}
                          </Show>
                          <p>{proposal.reason}</p>
                          <For each={proposal.alternatives}>{(reason) => <p>{reason}</p>}</For>
                          <Show when={proposal.eraReason}>
                            <p>
                              {t('initial.eraReason')} {proposal.eraReason}
                            </p>
                          </Show>
                          <For each={proposal.evidence}>
                            {(evidence) => (
                              <details class="person-passage">
                                <summary>
                                  {evidence.ref}
                                  <Show when={evidence.location && evidence.location !== 'passage'}>
                                    {' '}
                                    · {t('initial.context')}
                                  </Show>
                                </summary>
                                <blockquote lang="he" dir="rtl">
                                  {evidence.quote}
                                </blockquote>
                              </details>
                            )}
                          </For>
                        </section>
                      )}
                    </For>
                    <For each={reading().alternatives}>
                      {(alternative) => <p>{alternative.reason}</p>}
                    </For>
                    <For each={reading().neededContext}>
                      {(context) => (
                        <p>
                          {t('initial.needsContext')} {context}
                        </p>
                      )}
                    </For>
                  </details>
                  <InitialInteractions
                    id={p().id}
                    name={lang() === 'he' ? p().nameHe : p().name}
                    reading={reading()}
                  />
                </>
              )}
            </Show>
            <Show when={!p().initialReading}>
              <PersonConnections
                id={p().resolvedTo ?? p().id}
                name={lang() === 'he' ? p().nameHe : p().name}
                revision={p().revision}
                onPerson={props.onPerson}
              />
            </Show>
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
                  labelForPlace={(name) =>
                    lang() === 'he'
                      ? (p().places?.find((place) => place.mapPlace === name)?.placeHe ?? name)
                      : name
                  }
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
