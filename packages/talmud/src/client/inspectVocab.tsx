/**
 * inspectVocab — the visual LANGUAGE of the by-anchor inspector: a human label,
 * a colour, and a glyph for each anchor TYPE (the kind of place a note sits on),
 * so you can scan a daf and tell a Sugya from a Pasuk from a Sage at a glance —
 * instead of raw mark ids ("argument-move", "pesukim") and one generic sparkle
 * for everything. Traditional terms (the audience is learners). The whole-daf
 * group reads "Daf"; raw source inputs (gemara/commentaries) are SOURCES, the
 * third kind, drawn by NodeIcon in the DAG.
 */

import { type JSX, Match, Switch } from 'solid-js';

export interface AnchorType {
  /** Human label (traditional term). */
  label: string;
  /** Accent colour for the type chip / icon. */
  color: string;
}

export const WHOLE_DAF_ANCHOR = '__whole_daf__';

/** mark id → { traditional label, accent colour }. */
export const ANCHOR_VOCAB: Record<string, AnchorType> = {
  [WHOLE_DAF_ANCHOR]: { label: 'Daf', color: '#6b6358' },
  argument: { label: 'Sugya', color: '#7a5ea8' },
  'argument-move': { label: 'Move', color: '#9a7b4f' },
  pesukim: { label: 'Pasuk', color: '#3f7cae' },
  halacha: { label: 'Halacha', color: '#4a8a5f' },
  aggadata: { label: 'Aggada', color: '#b06a4a' },
  rabbi: { label: 'Sage', color: '#c08030' },
  places: { label: 'Place', color: '#5f8a8a' },
  rishonim: { label: 'Rishonim', color: '#8a7a5a' },
  yerushalmi: { label: 'Yerushalmi', color: '#a85f7a' },
  chart: { label: 'Chart', color: '#8a8a8a' },
};

export function anchorTypeOf(markId: string): AnchorType {
  return ANCHOR_VOCAB[markId] ?? { label: markId, color: '#6b6358' };
}

/** A glyph per anchor type, matching NodeIcon's 18px centred monochrome style.
 *  Daf=page, Sugya=brackets, Move=step-arrow, Pasuk=open book, Halacha=scale,
 *  Aggada=speech bubble, Sage=person, Place=pin, Rishonim=stacked pages,
 *  Yerushalmi=parallel columns, Chart=bars. Falls back to a small disc. */
export function AnchorTypeIcon(props: { markId: string; color: string }): JSX.Element {
  const s = (w = 1.4) => ({ fill: 'none', stroke: props.color, 'stroke-width': w }) as const;
  const r = (w = 1.4) =>
    ({
      fill: 'none',
      stroke: props.color,
      'stroke-width': w,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    }) as const;
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="-9 -9 18 18"
      style={{ display: 'block', 'flex-shrink': 0 }}
    >
      <Switch fallback={<circle cx={0} cy={0} r={2.2} fill={props.color} />}>
        <Match when={props.markId === WHOLE_DAF_ANCHOR}>
          <rect x={-5} y={-6.5} width={10} height={13} rx={1.4} {...r()} />
          <path d="M -2.5 -2.5 H 2.5 M -2.5 0.5 H 2.5 M -2.5 3.5 H 1" {...r(1.2)} />
        </Match>
        <Match when={props.markId === 'argument'}>
          <path d="M -3 -6.5 H -6 V 6.5 H -3 M 3 -6.5 H 6 V 6.5 H 3" {...r()} />
        </Match>
        <Match when={props.markId === 'argument-move'}>
          <path d="M -4.5 -6 L 3.5 0 L -4.5 6" {...r()} />
          <path d="M 5.5 -6 V 6" {...r()} />
        </Match>
        <Match when={props.markId === 'pesukim'}>
          <path d="M 0 -5.5 V 5.5" {...r()} />
          <path d="M 0 -5.5 C -2.5 -7 -6 -6.5 -7 -5.5 V 5.5 C -6 4.5 -2.5 4 0 5.5" {...r()} />
          <path d="M 0 -5.5 C 2.5 -7 6 -6.5 7 -5.5 V 5.5 C 6 4.5 2.5 4 0 5.5" {...r()} />
        </Match>
        <Match when={props.markId === 'halacha'}>
          <path
            d="M 0 -7 V 6.5 M -6 -3.5 H 6 M -6 -3.5 L -7.5 1 H -4.5 Z M 6 -3.5 L 4.5 1 H 7.5 Z"
            {...r(1.2)}
          />
          <path d="M -3 6.5 H 3" {...r()} />
        </Match>
        <Match when={props.markId === 'aggadata'}>
          <path d="M -6.5 -5 H 6.5 V 3 H -1 L -4 6 V 3 H -6.5 Z" {...r()} />
        </Match>
        <Match when={props.markId === 'rabbi'}>
          <circle cx={0} cy={-3.5} r={2.6} {...s()} />
          <path d="M -5.5 6.5 C -5.5 1.5 5.5 1.5 5.5 6.5" {...r()} />
        </Match>
        <Match when={props.markId === 'places'}>
          <path d="M 0 7 C -5 0.5 -5 -2.5 0 -6 C 5 -2.5 5 0.5 0 7 Z" {...r()} />
          <circle cx={0} cy={-2} r={1.6} fill={props.color} />
        </Match>
        <Match when={props.markId === 'rishonim'}>
          <rect x={-6.5} y={-6.5} width={9} height={9} rx={1.2} {...r(1.2)} />
          <rect x={-2.5} y={-2.5} width={9} height={9} rx={1.2} {...r()} />
        </Match>
        <Match when={props.markId === 'yerushalmi'}>
          <path d="M -3.5 -6.5 V 6.5 M 3.5 -6.5 V 6.5" {...r()} />
          <path d="M -3.5 -2 H 3.5" {...r(1.1)} />
        </Match>
        <Match when={props.markId === 'chart'}>
          <path d="M -6 6 V -1 M 0 6 V -6 M 6 6 V 2" {...r()} />
        </Match>
      </Switch>
    </svg>
  );
}
