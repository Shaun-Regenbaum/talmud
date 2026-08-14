/**
 * The whole weekly portion as one column — the parsha turned on its side and
 * unrolled down the drawer.
 *
 * Four rails share one axis (verses from the portion's first verse), so the
 * drawing is arithmetic on `study.map` and nothing has to be correlated by eye:
 *   chapters   where 17, 18, 19 … begin
 *   aliyot     the week's seven divisions (from the calendar, not the model)
 *   ribbon     the flow units at their true extents, coloured by kind, with
 *              landmarks marked on them
 *   titles     each move's name, written beside its own stretch of ribbon
 *
 * A move's title IS its segment — clicking either selects the move, and the
 * detail opens below the column. The ribbon stays exactly proportional; only
 * the titles are nudged apart (`layoutParshaColumn`), because a short unit
 * cannot hold a line of text.
 */
import { For, type JSX, Show } from 'solid-js';
import { hebrewNumeral } from '../lib/hebrew.ts';
import {
  layoutParshaColumn,
  type ParshaFlowSection,
  type ParshaSectionKind,
  type ParshaStudy,
} from '../lib/parsha.ts';

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

/** The column's nominal height, and the least room a title needs. The column
 *  grows past NOMINAL_H only when a portion's units are so lopsided that the
 *  nudged titles run past the bottom. */
const NOMINAL_H = 430;
const MIN_LABEL_GAP = 24;

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
  const unitAt = (index: number): ParshaFlowSection | undefined => props.study.flow[index];
  const shortRef = (ref: string) => ref.replace(`${props.study.book} `, '');
  /** The reader's language, falling back to the other one rather than to an
   *  empty label — both sides of every bilingual pair are optional in practice. */
  const pick = (en: string, he: string) => (props.lang === 'he' ? he || en : en || he);
  /** A verse offset as a pixel position down the drawn column. */
  const y = (offset: number) => (offset / total()) * NOMINAL_H;

  const column = () =>
    layoutParshaColumn(map()?.units ?? [], {
      totalVerses: total(),
      height: NOMINAL_H,
      minGap: MIN_LABEL_GAP,
    });

  return (
    <Show when={map()}>
      {(value) => (
        <>
          <div class="parsha-column" style={{ height: `${column().height}px` }}>
            <div class="parsha-column-chapters">
              <For each={value().chapters}>
                {(tick) => <i style={{ top: `${y(tick.offset)}px` }}>{tick.chapter}</i>}
              </For>
            </div>

            <Show when={value().aliyot.length}>
              <div class="parsha-column-aliyot">
                <For each={value().aliyot}>
                  {(aliyah) => (
                    <i
                      style={{
                        top: `${y(aliyah.offset)}px`,
                        height: `${Math.max(11, y(aliyah.verses) - 2)}px`,
                      }}
                      title={`${props.lang === 'he' ? 'עלייה' : 'Aliyah'} ${aliyah.n} · ${shortRef(aliyah.ref)}`}
                    >
                      {hebrewNumeral(aliyah.n)}
                    </i>
                  )}
                </For>
              </div>
            </Show>

            <div class="parsha-column-ribbon">
              <For each={column().rows}>
                {(row) => {
                  const unit = unitAt(row.index);
                  if (!unit) return null;
                  const title = () => pick(unit.titleEn, unit.titleHe);
                  return (
                    <button
                      type="button"
                      class={`parsha-column-seg parsha-kind-${unit.kind}`}
                      classList={{ active: props.selected === row.index }}
                      style={{ top: `${row.segTop}px`, height: `${row.segHeight}px` }}
                      title={`${title()} · ${shortRef(unit.ref)}`}
                      aria-label={title()}
                      onClick={() => props.onSelect(row.index)}
                    />
                  );
                }}
              </For>
              <For each={value().landmarks}>
                {(pin) => {
                  const landmark = props.study.landmarks[pin.index];
                  if (!landmark) return null;
                  const text = () => pick(landmark.labelEn, landmark.labelHe);
                  return (
                    <button
                      type="button"
                      class="parsha-column-pin"
                      style={{ top: `${y(pin.offset + 0.5) - 3}px` }}
                      title={`${shortRef(landmark.ref)} · ${text()}`}
                      aria-label={text()}
                      onClick={() => props.onOpenVerse(landmark.chapter, landmark.verse)}
                    />
                  );
                }}
              </For>
            </div>

            <div class="parsha-column-titles">
              <For each={column().rows}>
                {(row) => {
                  const unit = unitAt(row.index);
                  if (!unit) return null;
                  return (
                    <button
                      type="button"
                      class="parsha-column-title"
                      classList={{ active: props.selected === row.index }}
                      style={{ top: `${row.labelTop}px` }}
                      onClick={() => props.onSelect(row.index)}
                    >
                      <span class="t">{pick(unit.titleEn, unit.titleHe)}</span>
                      {/* A verse RANGE is Latin digits joined by a dash: without
                          its own direction it reorders inside the Hebrew drawer. */}
                      <span class="r" dir="ltr">
                        {shortRef(unit.ref)}
                      </span>
                    </button>
                  );
                }}
              </For>
            </div>
          </div>

          <div class="parsha-legend">
            <For each={LEGEND_ORDER.filter((kind) => props.study.composition[kind])}>
              {(kind) => (
                <span>
                  <i class={`parsha-dot parsha-kind-${kind}`} />
                  {PARSHA_KIND_LABEL[kind][props.lang]} {props.study.composition[kind]}%
                </span>
              )}
            </For>
          </div>
        </>
      )}
    </Show>
  );
}
