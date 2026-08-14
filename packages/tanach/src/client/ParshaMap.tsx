/**
 * The whole weekly portion as one object: a proportional strip of the parsha,
 * one segment per flow unit, coloured by what KIND of reading it is.
 *
 * Every layer sits on the same axis — verses from the portion's first verse —
 * so the drawing is pure arithmetic on `study.map`:
 *   aliyot rail   the week's seven divisions (from the calendar, not the model)
 *   the strip     the AI's flow units, at their true verse extents
 *   pins          landmarks, at their exact verse
 *   chapter ticks where 17, 18, 19 … begin
 *
 * Segments are positioned absolutely rather than tiled, so a portion the model
 * left a gap in shows the gap instead of silently stretching its neighbours.
 * The strip is the flow list's other face: selecting here selects there.
 */
import { For, type JSX, Show } from 'solid-js';
import { hebrewNumeral } from '../lib/hebrew.ts';
import type { ParshaFlowSection, ParshaSectionKind, ParshaStudy } from '../lib/parsha.ts';

export const PARSHA_KIND_LABEL: Record<ParshaSectionKind, { en: string; he: string }> = {
  narrative: { en: 'Narrative', he: 'סיפור' },
  law: { en: 'Halachah', he: 'הלכה' },
  discourse: { en: 'Discourse', he: 'נאום ורעיון' },
  poetry: { en: 'Poetry', he: 'שירה' },
  records: { en: 'Records', he: 'רשימות' },
};

/** Display order for the legend — the reading kinds as the Torah tends to run
 *  them, not the arbitrary order a given portion happens to use. */
const LEGEND_ORDER: ParshaSectionKind[] = ['narrative', 'law', 'discourse', 'poetry', 'records'];

export interface ParshaMapProps {
  study: ParshaStudy;
  lang: 'en' | 'he';
  selected: number | null;
  onSelect: (index: number) => void;
  onOpenVerse: (chapter: number, verse: number) => void;
}

export function ParshaMap(props: ParshaMapProps): JSX.Element {
  const map = () => props.study.map;
  const total = () => map()?.totalVerses ?? 0;
  const pct = (n: number) => `${(n / total()) * 100}%`;
  const unitAt = (index: number): ParshaFlowSection | undefined => props.study.flow[index];

  /** Chapter numbers, thinned so two labels never sit on top of each other —
   *  a portion that opens mid-chapter (Shoftim starts at 16:18) would
   *  otherwise print "16 17" in the same few pixels. The opening chapter
   *  always survives; a crowded later one is dropped. */
  const chapterTicks = () => {
    const total = map()?.totalVerses ?? 0;
    const kept: { chapter: number; offset: number }[] = [];
    for (const tick of map()?.chapters ?? []) {
      const at = (tick.offset / total) * 100;
      const previous = kept.at(-1);
      if (previous && at - (previous.offset / total) * 100 < 5) continue;
      kept.push(tick);
    }
    return kept;
  };
  const label = (kind: ParshaSectionKind) => PARSHA_KIND_LABEL[kind][props.lang];
  const shortRef = (ref: string) => ref.replace(`${props.study.book} `, '');

  return (
    <Show when={map()}>
      {(value) => (
        <>
          <Show when={value().aliyot.length}>
            <div class="parsha-map-aliyot">
              <For each={value().aliyot}>
                {(aliyah) => (
                  <i
                    style={{ 'inset-inline-start': pct(aliyah.offset), width: pct(aliyah.verses) }}
                    title={`${props.lang === 'he' ? 'עלייה' : 'Aliyah'} ${aliyah.n} · ${shortRef(aliyah.ref)}`}
                  >
                    {hebrewNumeral(aliyah.n)}
                  </i>
                )}
              </For>
            </div>
          </Show>

          <div class="parsha-map-strip">
            <For each={value().units}>
              {(span) => {
                const unit = unitAt(span.index);
                if (!unit) return null;
                // An accessor, not a value: these rows are not recreated when
                // the language changes (the units array is the same), so a
                // snapshot would leave the tooltips in the old language.
                const title = () =>
                  props.lang === 'he' ? unit.titleHe || unit.titleEn : unit.titleEn;
                return (
                  <button
                    type="button"
                    class={`parsha-map-unit parsha-kind-${unit.kind}`}
                    classList={{ active: props.selected === span.index }}
                    style={{ 'inset-inline-start': pct(span.offset), width: pct(span.verses) }}
                    title={`${title()} · ${shortRef(unit.ref)} · ${span.verses} ${
                      props.lang === 'he' ? 'פסוקים' : 'verses'
                    }`}
                    aria-label={title()}
                    onClick={() => props.onSelect(span.index)}
                  >
                    <span>{span.index + 1}</span>
                  </button>
                );
              }}
            </For>
          </div>

          <Show when={value().landmarks.length}>
            <div class="parsha-map-pins">
              <For each={value().landmarks}>
                {(pin) => {
                  const landmark = props.study.landmarks[pin.index];
                  if (!landmark) return null;
                  const text = () =>
                    props.lang === 'he' ? landmark.labelHe || landmark.labelEn : landmark.labelEn;
                  return (
                    <button
                      type="button"
                      class="parsha-map-pin"
                      style={{ 'inset-inline-start': pct(pin.offset + 0.5) }}
                      title={`${shortRef(landmark.ref)} · ${text()}`}
                      aria-label={text()}
                      onClick={() => props.onOpenVerse(landmark.chapter, landmark.verse)}
                    />
                  );
                }}
              </For>
            </div>
          </Show>

          <div class="parsha-map-chapters">
            <For each={chapterTicks()}>
              {(tick) => (
                <i
                  classList={{ first: tick.offset === 0 }}
                  style={{ 'inset-inline-start': pct(tick.offset) }}
                >
                  {tick.chapter}
                </i>
              )}
            </For>
          </div>

          <div class="parsha-legend">
            <For each={LEGEND_ORDER.filter((kind) => props.study.composition[kind])}>
              {(kind) => (
                <span>
                  <i class={`parsha-dot parsha-kind-${kind}`} />
                  {label(kind)} {props.study.composition[kind]}%
                </span>
              )}
            </For>
          </div>
        </>
      )}
    </Show>
  );
}
