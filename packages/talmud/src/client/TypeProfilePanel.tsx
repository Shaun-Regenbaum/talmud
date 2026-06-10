/**
 * Dev-panel view of section typing (Track C). Calls
 * GET /api/type-profiles/:tractate/:page — which composes a TypeProfile
 * per argument section from the daf's CACHED mark layers (no LLM) — and shows,
 * per section, its derived `primary` content dimension, whether it's a dispute,
 * and the overlay claims with coverage. The observation surface for validating
 * the deterministic composition (and, later, the profile-driven gating) on real
 * content. Dev mode only (mounted in DevModeShelf).
 */

import { createResource, For, type JSX, Show } from 'solid-js';

interface Claim {
  layer: string;
  coverage: number;
}
interface Profile {
  unit: { startSegIdx: number; endSegIdx: number };
  claims: Claim[];
  primary: string;
  isDispute: boolean;
  register?: string;
  title?: string;
}
interface Marker {
  startSegIdx: number;
  endSegIdx: number;
  kind: string;
}
interface ProfilesResponse {
  tractate: string;
  page: string;
  count: number;
  profiles: Profile[];
  markers?: Marker[];
}

const PRIMARY_COLOR: Record<string, string> = {
  'pure-dialectic': '#6b7280',
  aggadata: '#7c3aed',
  halacha: '#0369a1',
  pesukim: '#a16207',
};

export default function TypeProfilePanel(props: {
  tractate: string;
  page: string;
  /** Highlight a section's segment span on the daf (null clears). */
  onHighlight?: (range: { start: number; end: number } | null) => void;
  /** The currently-highlighted range, for active styling + toggle. */
  active?: { start: number; end: number } | null;
}): JSX.Element {
  const [data] = createResource(
    () => `${props.tractate}|${props.page}`,
    async (): Promise<ProfilesResponse | null> => {
      const r = await fetch(
        `/api/type-profiles/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}`,
      );
      if (!r.ok) return null;
      return (await r.json()) as ProfilesResponse;
    },
  );

  return (
    <Show when={data() && data()!.count > 0}>
      <div
        style={{
          border: '1px solid #eee',
          'border-radius': '4px',
          background: '#fff',
          padding: '0.4rem 0.55rem',
          'font-size': '0.78rem',
          'line-height': 1.45,
        }}
      >
        <div
          style={{
            'font-size': '0.65rem',
            'text-transform': 'uppercase',
            'letter-spacing': '0.06em',
            color: '#888',
            'margin-bottom': '0.3rem',
          }}
        >
          Section types · {data()!.count}
        </div>

        <Show when={(data()!.markers ?? []).length > 0}>
          <For each={data()!.markers}>
            {(m) => (
              <div
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  gap: '0.4rem',
                  margin: '0.1rem 0 0.25rem',
                  color: '#9a3412',
                  'font-size': '0.68rem',
                  'text-transform': 'uppercase',
                  'letter-spacing': '0.05em',
                }}
              >
                <span style={{ flex: 1, 'border-top': '1px dashed #fdba74' }} />
                <span>
                  ⎯ {m.kind} · perek boundary · seg {m.startSegIdx}
                </span>
                <span style={{ flex: 1, 'border-top': '1px dashed #fdba74' }} />
              </div>
            )}
          </For>
        </Show>

        <For each={data()!.profiles}>
          {(p) => {
            const isActive = () =>
              props.active?.start === p.unit.startSegIdx && props.active?.end === p.unit.endSegIdx;
            return (
              <div
                onClick={() =>
                  props.onHighlight?.(
                    isActive() ? null : { start: p.unit.startSegIdx, end: p.unit.endSegIdx },
                  )
                }
                title="Click to highlight this section on the daf"
                style={{
                  display: 'flex',
                  gap: '0.4rem',
                  padding: '0.12rem 0.2rem',
                  'align-items': 'baseline',
                  cursor: 'pointer',
                  'border-radius': '3px',
                  background: isActive() ? '#fff7ed' : 'transparent',
                  'box-shadow': isActive() ? 'inset 2px 0 0 #ea580c' : 'none',
                }}
              >
                <span
                  style={{
                    'flex-shrink': 0,
                    color: '#bbb',
                    'font-size': '0.68rem',
                    'font-variant-numeric': 'tabular-nums',
                  }}
                >
                  {p.unit.startSegIdx}-{p.unit.endSegIdx}
                </span>
                <span
                  style={{
                    'flex-shrink': 0,
                    'font-size': '0.62rem',
                    'border-radius': '3px',
                    padding: '0 0.3rem',
                    background: `${PRIMARY_COLOR[p.primary] ?? '#888'}22`,
                    color: PRIMARY_COLOR[p.primary] ?? '#666',
                  }}
                >
                  {p.primary}
                </span>
                <Show when={p.register === 'mishnah'}>
                  <span
                    style={{
                      'flex-shrink': 0,
                      'font-size': '0.62rem',
                      'border-radius': '3px',
                      padding: '0 0.3rem',
                      background: '#1e3a8a22',
                      color: '#1e3a8a',
                    }}
                    title="register: mishnah (majority of segments are mishnah-in-talmud)"
                  >
                    mishnah
                  </span>
                </Show>
                <Show when={p.isDispute}>
                  <span
                    style={{ 'flex-shrink': 0, 'font-size': '0.6rem', color: '#b91c1c' }}
                    title="argument.voices has an opposes edge"
                  >
                    ⚔
                  </span>
                </Show>
                <span
                  style={{
                    flex: 1,
                    'min-width': 0,
                    'white-space': 'nowrap',
                    overflow: 'hidden',
                    'text-overflow': 'ellipsis',
                    color: '#555',
                  }}
                  title={p.title}
                >
                  {p.title ?? ''}
                </span>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
}
