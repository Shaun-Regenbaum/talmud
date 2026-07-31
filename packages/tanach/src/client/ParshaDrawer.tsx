import { aiStatus, noteAiResponse, noteAiSuccess } from '@corpus/ui/aiStatus';
import { Prose } from '@corpus/ui/Prose';
import { createEffect, createResource, createSignal, For, type JSX, Show } from 'solid-js';
import type {
  ParshaFlowSection,
  ParshaSectionKind,
  ParshaStudy,
  ParshaThread,
} from '../lib/parsha.ts';

export interface ParshaDrawerProps {
  study: ParshaStudy;
  lang: 'en' | 'he';
  location: 'israel' | 'diaspora';
  onOpenText: (book: string, chapter: number, verse: number) => void;
}

const KIND_LABEL: Record<ParshaSectionKind, { en: string; he: string }> = {
  narrative: { en: 'Narrative', he: 'סיפור' },
  law: { en: 'Halachah', he: 'הלכה' },
  discourse: { en: 'Discourse', he: 'נאום ורעיון' },
};

function textFor(lang: 'en' | 'he', en: string, he: string): string {
  return lang === 'he' ? he || en : en || he;
}

function sourceUrl(ref: string): string {
  return `https://www.sefaria.org/${encodeURI(ref.replace(/ /g, '_'))}`;
}

export function ParshaDrawer(props: ParshaDrawerProps): JSX.Element {
  const [selected, setSelected] = createSignal(0);
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
  let threadPanel: HTMLElement | undefined;
  createEffect(() => {
    if (!threadRequest()) return;
    requestAnimationFrame(() =>
      threadPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  });

  const choose = (index: number) => {
    setSelected(index);
    if (threadRequest()?.index !== index) setThreadRequest(null);
  };

  const buildThread = (index: number) => {
    setSelected(index);
    setThreadRequest({ index });
  };

  const copyDvar = async () => {
    const value = thread();
    if (!value) return;
    const text = textFor(props.lang, value.dvarEn, value.dvarHe);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const selectedFlow = (): ParshaFlowSection | undefined => props.study.flow[selected()];

  return (
    <section class="parsha-study">
      <p class="parsha-ref">{props.study.ref}</p>
      <h3 class="perek-title">{textFor(props.lang, props.study.titleEn, props.study.titleHe)}</h3>
      <Prose en={props.study.overviewEn} he={props.study.overviewHe} lang={props.lang} />

      <section class="parsha-section">
        <div class="parsha-section-head">
          <h4>{props.lang === 'he' ? 'הרכב הפרשה' : 'What kind of reading is this?'}</h4>
          <span>{props.lang === 'he' ? 'מפה משוערת' : 'editorial estimate'}</span>
        </div>
        <div class="parsha-composition" role="img" aria-label="Parsha composition">
          <For each={['narrative', 'law', 'discourse'] as const}>
            {(kind) => (
              <span
                class={`parsha-composition-${kind}`}
                style={{ width: `${props.study.composition[kind]}%` }}
                title={`${KIND_LABEL[kind][props.lang]} ${props.study.composition[kind]}%`}
              />
            )}
          </For>
        </div>
        <div class="parsha-legend">
          <For each={['narrative', 'law', 'discourse'] as const}>
            {(kind) => (
              <span>
                <i class={`parsha-dot parsha-dot-${kind}`} />
                {KIND_LABEL[kind][props.lang]} {props.study.composition[kind]}%
              </span>
            )}
          </For>
        </div>
      </section>

      <section class="parsha-section">
        <div class="parsha-section-head">
          <h4>{props.lang === 'he' ? 'מהלך הפרשה' : 'The flow of the parsha'}</h4>
          <span>
            {props.study.flow.length} {props.lang === 'he' ? 'יחידות' : 'moves'}
          </span>
        </div>
        <ol class="parsha-flow">
          <For each={props.study.flow}>
            {(section, index) => (
              <li>
                <button
                  type="button"
                  class="parsha-flow-card"
                  classList={{ active: selected() === index() }}
                  onClick={() => choose(index())}
                >
                  <span class={`parsha-flow-node parsha-flow-node-${section.kind}`} />
                  <span class="parsha-flow-copy">
                    <span class="parsha-flow-meta">
                      <b>{section.ref.replace(`${props.study.book} `, '')}</b>
                      <i>{KIND_LABEL[section.kind][props.lang]}</i>
                    </span>
                    <strong>{textFor(props.lang, section.titleEn, section.titleHe)}</strong>
                    <small>{textFor(props.lang, section.summaryEn, section.summaryHe)}</small>
                  </span>
                </button>
                <Show when={selected() === index()}>
                  <div class="parsha-flow-actions">
                    <button
                      type="button"
                      onClick={() =>
                        props.onOpenText(props.study.book, section.startChapter, section.startVerse)
                      }
                    >
                      {props.lang === 'he' ? 'פתח בטקסט' : 'Open in the text'}
                    </button>
                    <button type="button" class="primary" onClick={() => buildThread(index())}>
                      {props.lang === 'he' ? 'בנה דבר תורה' : 'Build a dvar Torah'}
                    </button>
                  </div>
                </Show>
              </li>
            )}
          </For>
        </ol>
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
