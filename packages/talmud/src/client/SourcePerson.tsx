import { createResource, createSignal, For, onCleanup, Show } from 'solid-js';
import {
  graphPins,
  parseSourcePersonHash,
  pinQuery,
  type ReadingPins,
  readingPins,
} from '../lib/sage-graph/reading-pins';
import type { SourcePerson as SourcePersonData } from '../lib/sage-graph/types';
import { InitialInteractions } from './InitialInteractions';
import { lang, t } from './i18n';
import { NameSuggestion } from './NameSuggestion';
import { PersonConnections } from './PersonConnections';
import { PersonEra } from './PersonEra';
import { PersonReadingBasis } from './PersonReadingBasis';
import { PersonStatus } from './PersonStatus';
import RabbiTrajectoryMap from './RabbiTrajectoryMap';
import { sefariaUrl } from './sageInteractions';
import './sourcePerson.css';

export function SourcePerson(props: {
  id: string;
  /** The revisions of the page this card was opened from. A missing revision is an error, never the newest. */
  pins?: ReadingPins;
  /** On a daf page the card reads only the page's revisions: nothing while they load or if they failed. */
  pinsRequired?: boolean;
  pinsLoading?: boolean;
  onRetryPins?: () => void;
  onPerson?: (id: string) => void;
}) {
  const waiting = () => !!props.pinsRequired && !props.pins;
  const [person, { refetch }] = createResource(
    () => (waiting() ? false : { id: props.id, pins: props.pins }),
    async ({ id, pins }) => {
      try {
        const query = pinQuery(pins);
        const response = await fetch(
          `/api/sage-graph/person?id=${encodeURIComponent(id)}${query ? `&${query}` : ''}`,
        );
        return response.ok ? ((await response.json()) as SourcePersonData) : null;
      } catch {
        return null;
      }
    },
  );
  const profile = () => {
    const value = person()?.conditionalProfile;
    return value?.status === 'available' ? value : undefined;
  };
  const conditionalLabel = () =>
    t('person.conditionalProfile', {
      name: lang() === 'he' ? (profile()?.nameHe ?? '') : (profile()?.name ?? ''),
    });
  return (
    <section
      class="source-person"
      classList={{ 'source-person-initial': !!person()?.initialReading }}
      dir={lang() === 'he' ? 'rtl' : 'ltr'}
    >
      <Show when={person.loading || (waiting() && props.pinsLoading)}>
        <p>{t('sourcePerson.loading')}</p>
      </Show>
      <Show when={waiting() && !props.pinsLoading}>
        <PersonStatus error onRetry={() => props.onRetryPins?.()}>
          {t('sourcePerson.error')}
        </PersonStatus>
      </Show>
      <Show when={!waiting() && !person.loading && !person()}>
        <PersonStatus error onRetry={() => void refetch()}>
          {t('sourcePerson.error')}
        </PersonStatus>
      </Show>
      <Show when={!person.loading && person()}>
        {(p) => (
          <>
            <p class="source-person-caption">
              {t(
                p().initialReading?.checked
                  ? 'checked.cardTitle'
                  : p().initialReading
                    ? 'initial.cardTitle'
                    : 'sourcePerson.title',
              )}
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
            <Show when={p().conditionalProfile?.status === 'unavailable'}>
              <PersonStatus error onRetry={() => void refetch()}>
                {t('person.profileUnavailable')}
              </PersonStatus>
            </Show>
            <Show
              when={
                profile() &&
                !p().possibleEra &&
                !p().era &&
                (!p().generation || p().generation === 'unknown')
              }
            >
              <p class="source-person-note">{conditionalLabel()}</p>
            </Show>
            <PersonEra
              reviewed={p().era ?? (!p().possibleEra ? profile()?.era : undefined)}
              generation={
                p().possibleEra || (p().generation && p().generation !== 'unknown')
                  ? p().generation
                  : profile()?.generation
              }
              uncertain={
                !!profile() &&
                !p().possibleEra &&
                !p().era &&
                (!p().generation || p().generation === 'unknown')
              }
              possible={p().possibleEra}
              revision={p().revision}
            />
            <section class="person-biography">
              <h4>{t('person.biography')}</h4>
              <Show when={profile()}>
                <p class="source-person-note">{conditionalLabel()}</p>
              </Show>
              <Show
                when={profile()?.bio}
                fallback={
                  <Show when={p().conditionalProfile?.status !== 'unavailable'}>
                    <PersonStatus>{t('person.bioEmpty')}</PersonStatus>
                  </Show>
                }
              >
                <p lang="en" dir="ltr">
                  {profile()?.bio}
                </p>
                <For each={profile()?.sources}>
                  {(source) => (
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title}
                    </a>
                  )}
                </For>
              </Show>
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
            <Show when={p().readingBasisUnavailable}>
              <PersonStatus error onRetry={() => void refetch()}>
                {t('initial.basisUnavailable')}
              </PersonStatus>
            </Show>
            <Show when={p().readingBasis}>
              {(reading) => (
                <PersonReadingBasis reading={reading()} pins={linkPins(p(), props.pins)} />
              )}
            </Show>
            <Show when={p().initialReading}>
              {(reading) => (
                <>
                  <PersonReadingBasis reading={reading()} pins={linkPins(p(), props.pins)}>
                    <Show when={profile()?.proposal.recordId.startsWith('identity_link_evidence:')}>
                      <p>
                        {t('person.profileBridgeReason')}{' '}
                        <a
                          href={`/api/sage-graph/records?revision=${encodeURIComponent(profile()!.proposal.revision)}&id=${encodeURIComponent(profile()!.proposal.recordId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('person.profileProof')}
                        </a>
                      </p>
                    </Show>
                    <Show when={reading().nameSuggestion}>
                      {(suggestion) => <NameSuggestion suggestion={suggestion()} />}
                    </Show>
                  </PersonReadingBasis>
                  <InitialInteractions
                    id={p().id}
                    name={lang() === 'he' ? p().nameHe : p().name}
                    reading={reading()}
                    pins={linkPins(p(), props.pins)}
                  />
                </>
              )}
            </Show>
            <Show when={!p().initialReading}>
              <PersonConnections
                id={p().resolvedTo ?? p().id}
                name={lang() === 'he' ? p().nameHe : p().name}
                revision={p().revision}
                pins={linkPins(p(), props.pins) ?? graphPins(p().revision)}
                onPerson={props.onPerson}
              />
            </Show>
            <section class="person-places">
              <h4>{t('person.places')}</h4>
              <Show
                when={p().places?.length}
                fallback={
                  <Show
                    when={
                      !profile()?.places.length && p().conditionalProfile?.status !== 'unavailable'
                    }
                  >
                    <PersonStatus>{t('person.placesEmpty')}</PersonStatus>
                  </Show>
                }
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
              <Show when={profile()?.places.length}>
                <p class="source-person-note">
                  {conditionalLabel()} {t('person.profilePlaces')}
                </p>
                <RabbiTrajectoryMap
                  journeyControls
                  data={{
                    primaryStudyPlaces: [],
                    movements: [],
                    notablePlaces: (profile()?.places ?? []).map((place) => ({
                      place,
                      event: t('person.savedProfilePlace'),
                    })),
                  }}
                  evidence={[]}
                />
              </Show>
            </section>
          </>
        )}
      </Show>
    </section>
  );
}

/** Links from a card read the revisions this card was read with, or else the page's. */
const linkPins = (person: SourcePersonData, page: ReadingPins | undefined) =>
  readingPins(person.revision, person.sourceRevisions) ?? page;

export function SourcePersonPage() {
  const [target, setTarget] = createSignal(parseSourcePersonHash(location.hash));
  const update = () => setTarget(parseSourcePersonHash(location.hash));
  window.addEventListener('hashchange', update);
  onCleanup(() => window.removeEventListener('hashchange', update));
  return (
    <main class="source-person-page">
      <Show
        when={!target().malformed}
        fallback={<PersonStatus error>{t('sourcePerson.error')}</PersonStatus>}
      >
        <SourcePerson id={target().id} pins={target().pins} />
      </Show>
    </main>
  );
}
