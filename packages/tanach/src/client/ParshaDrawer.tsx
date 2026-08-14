import { aiStatus, noteAiResponse, noteAiSuccess } from '@corpus/ui/aiStatus';
import { Prose } from '@corpus/ui/Prose';
import { createEffect, createResource, createSignal, For, type JSX, Show } from 'solid-js';
import {
  type ParshaFlowSection,
  type ParshaSectionStudy,
  type ParshaStudy,
  type ParshaThread,
  sanitizeParshaTerms,
} from '../lib/parsha.ts';
import { PARSHA_KIND_LABEL, ParshaMap } from './ParshaMap.tsx';
import { TermedProse } from './TermedProse.tsx';

export interface ParshaDrawerProps {
  study: ParshaStudy;
  lang: 'en' | 'he';
  location: 'israel' | 'diaspora';
  onOpenText: (book: string, chapter: number, verse: number) => void;
  /** Highlight a flow section's verse range in the reader (null clears it).
   *  Fires on selecting a move — the drawer stays open. */
  onFocusRange: (section: ParshaFlowSection | null) => void;
}

function textFor(lang: 'en' | 'he', en: string, he: string): string {
  return lang === 'he' ? he || en : en || he;
}

function sourceUrl(ref: string): string {
  return `https://www.sefaria.org/${encodeURI(ref.replace(/ /g, '_'))}`;
}

export function ParshaDrawer(props: ParshaDrawerProps): JSX.Element {
  const [selected, setSelected] = createSignal<number | null>(null);
  const [threadRequest, setThreadRequest] = createSignal<{ index: number } | null>(null);
  const [copied, setCopied] = createSignal(false);
  const [thread] = createResource(threadRequest, async ({ index }) => {
    const response = await fetch(`/api/parsha-thread/${index}?loc=${props.location}`);
    if (response.ok) {
      noteAiSuccess();
      return (await response.json()) as ParshaThread;
    }
    noteAiResponse(await response.json().catch(() => null));
    return null;
  });
  // The selected move's in-depth close reading (cached server-side; warm-cron
  // pre-warms it, so this is usually instant).
  const [deep] = createResource(
    () => (selected() === null ? null : { index: selected() as number }),
    async ({ index }) => {
      const response = await fetch(`/api/parsha-section/${index}?loc=${props.location}`);
      if (response.ok) {
        noteAiSuccess();
        return (await response.json()) as ParshaSectionStudy;
      }
      noteAiResponse(await response.json().catch(() => null));
      return null;
    },
  );
  let threadPanel: HTMLElement | undefined;
  createEffect(() => {
    if (!threadRequest()) return;
    requestAnimationFrame(() =>
      threadPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  });

  // The detail opens below the column, which on a tall portion sits under the
  // fold — bring it into view. 'nearest' leaves it alone when it is already
  // on screen, so picking a second move doesn't jump the drawer around.
  let openMove: HTMLElement | undefined;
  createEffect(() => {
    if (selected() === null) return;
    requestAnimationFrame(() => openMove?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  });

  // Selecting a move highlights its verse range in the reader and opens its
  // close reading in place; selecting it again collapses and clears both.
  const choose = (index: number) => {
    if (selected() === index) {
      setSelected(null);
      setThreadRequest(null);
      props.onFocusRange(null);
      return;
    }
    setSelected(index);
    if (threadRequest()?.index !== index) setThreadRequest(null);
    props.onFocusRange(props.study.flow[index] ?? null);
  };

  const buildThread = (index: number) => {
    setThreadRequest({ index });
  };

  /** The hover-hint pool for a section's close reading: its own terms first
   *  (they win a surface collision), then the whole-parsha pool. */
  const deepTerms = (value: ParshaSectionStudy) =>
    sanitizeParshaTerms([...(value.terms ?? []), ...(props.study.terms ?? [])]);

  const copyDvar = async () => {
    const value = thread();
    if (!value) return;
    const text = textFor(props.lang, value.dvarEn, value.dvarHe);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const selectedFlow = (): ParshaFlowSection | undefined => {
    const index = selected();
    return index === null ? undefined : props.study.flow[index];
  };

  const verseCount = (index: number): number | undefined =>
    props.study.map?.units.find((span) => span.index === index)?.verses;

  /** Draw the column only when the map accounts for EVERY move. `buildParshaMap`
   *  drops a unit it can't place on the verse axis, and the column has no row
   *  for a move it can't position — so a partial map would make that move
   *  vanish from the drawer entirely. The plain list stands in instead: less
   *  picture, nothing lost. */
  const drawColumn = (): boolean =>
    !!props.study.map && props.study.map.units.length === props.study.flow.length;

  return (
    <section class="parsha-study">
      <p class="parsha-ref">{props.study.ref}</p>
      <h3 class="perek-title">{textFor(props.lang, props.study.titleEn, props.study.titleHe)}</h3>
      <TermedProse
        en={props.study.overviewEn}
        he={props.study.overviewHe}
        lang={props.lang}
        terms={props.study.terms ?? []}
      />

      <section class="parsha-section">
        <div class="parsha-section-head">
          <h4>{props.lang === 'he' ? 'מהלך הפרשה' : 'The parsha, move by move'}</h4>
          <span>
            {drawColumn()
              ? `${props.study.map?.totalVerses} ${props.lang === 'he' ? 'פסוקים' : 'verses'} · `
              : ''}
            {props.study.flow.length} {props.lang === 'he' ? 'יחידות' : 'moves'}
          </span>
        </div>

        {/* The column IS the list: every move's title sits beside its own
            stretch of the portion. Where there is no map to draw, the plain
            list below stands in. */}
        <Show
          when={drawColumn()}
          fallback={
            <ol class="parsha-flow">
              <For each={props.study.flow}>
                {(section, index) => (
                  <li>
                    <button
                      type="button"
                      class="parsha-band"
                      classList={{ active: selected() === index() }}
                      onClick={() => choose(index())}
                    >
                      <span class={`parsha-band-stripe parsha-kind-${section.kind}`} />
                      <span class="parsha-band-title">
                        {textFor(props.lang, section.titleEn, section.titleHe)}
                      </span>
                      <span class="parsha-band-ref" dir="ltr">
                        {section.ref.replace(`${props.study.book} `, '')}
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ol>
          }
        >
          <ParshaMap
            study={props.study}
            lang={props.lang}
            selected={selected()}
            onSelect={choose}
            onOpenVerse={(chapter, verse) => props.onOpenText(props.study.book, chapter, verse)}
          />
        </Show>

        {/* The selected move opens BELOW the column — the titles are placed by
            their verse positions, so nothing can expand in place without
            breaking the map's geometry. */}
        <Show when={selectedFlow()}>
          {(section) => (
            <div class="parsha-flow-deep" ref={(element) => (openMove = element)}>
              <p class="parsha-flow-kicker">
                <span dir="ltr">{section().ref.replace(`${props.study.book} `, '')}</span> ·{' '}
                {PARSHA_KIND_LABEL[section().kind][props.lang]}
                <Show when={verseCount(selected() ?? -1)}>
                  {(count) => (
                    <>
                      {' · '}
                      {count()} {props.lang === 'he' ? 'פסוקים' : 'verses'}
                    </>
                  )}
                </Show>
              </p>
              <h5 class="parsha-flow-title">
                {textFor(props.lang, section().titleEn, section().titleHe)}
              </h5>
              <p class="parsha-flow-summary">
                {textFor(props.lang, section().summaryEn, section().summaryHe)}
              </p>
              <Show when={deep.loading}>
                <p class="comm-muted">
                  {props.lang === 'he' ? 'קורא את הקטע מקרוב…' : 'Reading the passage closely…'}
                </p>
              </Show>
              {/* deep.error first: reading deep() while the resource is
                  errored (a rejected fetch, not a non-ok status) would
                  rethrow and break the drawer subtree. */}
              <Show when={!deep.loading && (deep.error || deep() === null)}>
                <p class="comm-muted">
                  {aiStatus()
                    ? props.lang === 'he'
                      ? 'יצירת תוכן מושבתת כרגע.'
                      : 'AI generation is paused right now.'
                    : props.lang === 'he'
                      ? 'לא הצלחנו לקרוא את הקטע. נסו שוב.'
                      : "Couldn't read this passage. Try again."}
                </p>
              </Show>
              <Show when={!deep.loading && !deep.error && deep()}>
                {(value) => (
                  <TermedProse
                    en={value().en}
                    he={value().he}
                    lang={props.lang}
                    terms={deepTerms(value())}
                  />
                )}
              </Show>
              <div class="parsha-flow-actions">
                <button
                  type="button"
                  onClick={() =>
                    props.onOpenText(props.study.book, section().startChapter, section().startVerse)
                  }
                >
                  {props.lang === 'he' ? 'פתח בטקסט' : 'Open in the text'}
                </button>
                <button type="button" class="primary" onClick={() => buildThread(selected() ?? 0)}>
                  {props.lang === 'he' ? 'בנה דבר תורה' : 'Build a dvar Torah'}
                </button>
              </div>
            </div>
          )}
        </Show>
      </section>

      <section class="parsha-section">
        <div class="parsha-section-head">
          <h4>{props.lang === 'he' ? 'ציוני דרך' : 'Landmarks'}</h4>
          <span>{props.lang === 'he' ? 'מקומות שכדאי להכיר' : 'find them quickly'}</span>
        </div>
        <div class="parsha-landmarks">
          <For each={props.study.landmarks}>
            {(landmark) => (
              <button
                type="button"
                onClick={() => props.onOpenText(props.study.book, landmark.chapter, landmark.verse)}
              >
                <span>{landmark.ref.replace(`${props.study.book} `, '')}</span>
                {textFor(props.lang, landmark.labelEn, landmark.labelHe)}
              </button>
            )}
          </For>
        </div>
      </section>

      <Show when={threadRequest()}>
        <section class="parsha-thread" ref={(element) => (threadPanel = element)}>
          <p class="parsha-thread-kicker">
            {selectedFlow()?.ref} · {props.lang === 'he' ? 'מסלול לימוד' : 'study thread'}
          </p>
          <Show when={thread.loading}>
            <p class="comm-muted">
              {props.lang === 'he'
                ? 'מחבר את הפסוקים למקורות ולדבר תורה…'
                : 'Connecting the passage, sources, and dvar Torah…'}
            </p>
          </Show>
          <Show when={!thread.loading && thread() === null}>
            <p class="comm-muted">
              {aiStatus()
                ? props.lang === 'he'
                  ? 'יצירת תוכן מושבתת כרגע.'
                  : 'AI generation is paused right now.'
                : props.lang === 'he'
                  ? 'לא הצלחנו לבנות את מסלול הלימוד. נסו שוב.'
                  : "Couldn't build this study thread. Try again."}
            </p>
          </Show>
          <Show when={thread()}>
            {(value) => (
              <>
                <h4>{textFor(props.lang, value().titleEn, value().titleHe)}</h4>
                <div class="parsha-thread-block question">
                  <span>{props.lang === 'he' ? 'השאלה' : 'The question'}</span>
                  <Prose en={value().questionEn} he={value().questionHe} lang={props.lang} />
                </div>
                <div class="parsha-thread-block">
                  <span>{props.lang === 'he' ? 'העומק' : 'The deeper idea'}</span>
                  <Prose en={value().insightEn} he={value().insightHe} lang={props.lang} />
                </div>
                <Show when={value().sources.length}>
                  <div class="parsha-thread-sources">
                    <span>{props.lang === 'he' ? 'מקורות' : 'Sources that sharpen it'}</span>
                    <For each={value().sources}>
                      {(source) => (
                        <a href={sourceUrl(source.ref)} target="_blank" rel="noreferrer">
                          <b>{textFor(props.lang, source.labelEn, source.labelHe) || source.ref}</b>
                          <small>
                            {textFor(props.lang, source.contributionEn, source.contributionHe)}
                          </small>
                        </a>
                      )}
                    </For>
                  </div>
                </Show>
                <div class="parsha-thread-block dvar">
                  <span>{props.lang === 'he' ? 'דבר תורה מוכן' : 'Ready-to-share dvar Torah'}</span>
                  <Prose
                    en={value().dvarEn}
                    he={value().dvarHe}
                    lang={props.lang}
                    class="parsha-dvar-copy"
                  />
                  <button type="button" class="parsha-copy" onClick={copyDvar}>
                    {copied()
                      ? props.lang === 'he'
                        ? 'הועתק'
                        : 'Copied'
                      : props.lang === 'he'
                        ? 'העתק דבר תורה'
                        : 'Copy dvar Torah'}
                  </button>
                </div>
              </>
            )}
          </Show>
        </section>
      </Show>
    </section>
  );
}
