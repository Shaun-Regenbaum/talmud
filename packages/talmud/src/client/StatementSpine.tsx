/**
 * StatementSpine — renders ONE section's statement spine (the unified view that
 * is meant to replace the per-section VOICES diagram + DIALECTIC move-flow +
 * narrative). The data is built server-side by buildStatementSpine and pulled
 * from /api/statement-spine; this component is the visual half.
 *
 * The spine is the vertical sequence of statements (the dialectic backbone). The
 * voices overlay is drawn ON it: a `dispute` section tints statements by their
 * position side and lists the opposition/relation links beneath, each tagged with
 * its provenance (the model's voice analysis vs. a deterministic role rule). A
 * non-dispute section is just the chain — which is exactly the old move-flow.
 *
 * This is the #spine drill-down's renderer; the reader sidebar will later pull
 * the same shape, retiring its three bespoke renderers + the gate between them.
 */
import { For, type JSX, Show } from 'solid-js';
import type {
  StatementSpine as Spine,
  StatementLink,
  StatementNode,
} from '../lib/typing/statementSpine';

// Dialectic role → colour (matches the reader's ArgumentMoveFlow palette).
const ROLE_COLOR: Record<string, string> = {
  opening: '#475569',
  question: '#0369a1',
  answer: '#15803d',
  objection: '#b91c1c',
  rejection: '#9f1239',
  'supporting-evidence': '#0891b2',
  resolution: '#15803d',
  digression: '#a16207',
  shift: '#7c3aed',
  other: '#64748b',
};
const roleColor = (role: string): string => ROLE_COLOR[role] ?? ROLE_COLOR.other;

// Position side → tint, so the two limbs of a מחלוקת read as opposing colours
// (the same blue/red the VOICES map uses for Position A / Position B).
const SIDE_TINT: Record<string, string> = {
  A: '#1d4ed8',
  B: '#b91c1c',
  C: '#a16207',
  'support-A': '#1d4ed8',
  'support-B': '#b91c1c',
};
const sideTint = (side?: string): string | undefined => (side ? SIDE_TINT[side] : undefined);

const RELATION_LABEL: Record<StatementLink['relation'], string> = {
  opposes: 'opposes',
  'responds-to': 'responds to',
  resolves: 'resolves',
  supports: 'supports',
  cites: 'cites',
  continues: 'continues',
};

const label = (n: StatementNode | undefined): string =>
  n ? `${n.role}${n.speaker ? ` · ${n.speaker}` : ''}` : '?';

export function StatementSpine(props: {
  spine: Spine;
  title?: string;
  /** Reader-highlight hook: clicking a statement asks the host to highlight its
   *  text range (the same channel the move-flow uses). Optional. */
  onHighlight?: (
    range: { start: number; end: number; tokenStart?: number; tokenEnd?: number } | null,
  ) => void;
  /** Click a named speaker to open their rabbi card (carried over from the voice
   *  map's onClickVoice). Speakers are plain text when absent. */
  onPushRabbi?: (name: string) => void;
}): JSX.Element {
  const nodes = (): StatementNode[] => props.spine.nodes;
  const byId = (): Map<string, StatementNode> => new Map(nodes().map((n) => [n.id, n]));
  // Only the non-sequence relations are worth listing — they ARE the overlay.
  const overlay = (): StatementLink[] => props.spine.links;

  return (
    <div style={{ 'font-size': '0.85rem', color: '#222' }}>
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '0.5rem',
          'margin-bottom': '0.6rem',
        }}
      >
        <Show when={props.title}>
          <span style={{ 'font-weight': 600 }}>{props.title}</span>
        </Show>
        <span
          style={{
            'font-size': '0.66rem',
            'text-transform': 'uppercase',
            'letter-spacing': '0.06em',
            padding: '0.1rem 0.45rem',
            'border-radius': '999px',
            color: props.spine.dispute ? '#b91c1c' : '#475569',
            background: props.spine.dispute ? '#fde8e8' : '#eef1f5',
            border: `1px solid ${props.spine.dispute ? '#f3c9c9' : '#dde3ea'}`,
          }}
        >
          {props.spine.dispute ? 'מחלוקת · dispute' : 'dialectic'}
        </span>
      </div>

      <Show
        when={nodes().length > 0}
        fallback={
          <p style={{ color: '#999', 'font-style': 'italic', margin: 0 }}>
            No statements extracted for this section yet.
          </p>
        }
      >
        {/* The spine: statements top-to-bottom, joined by a vertical rail. */}
        <div style={{ position: 'relative', 'padding-left': '0.4rem' }}>
          <For each={nodes()}>
            {(n, i) => {
              const accent = (): string => sideTint(n.side) ?? roleColor(n.role);
              const highlight = () =>
                props.onHighlight?.({
                  start: n.startSegIdx,
                  end: n.endSegIdx,
                  tokenStart: n.tokenStart,
                  tokenEnd: n.tokenEnd,
                });
              return (
                // biome-ignore lint/a11y/useSemanticElements: inline-styled statement row holding a baseline RTL excerpt + a nested speaker button; a native <button> would alter the reader layout and can't nest the speaker control
                <div
                  style={{
                    position: 'relative',
                    'border-left': `3px solid ${accent()}`,
                    padding: '0.35rem 0.6rem',
                    margin: i() === 0 ? '0 0 0.4rem' : '0.4rem 0',
                    background: '#fafafa',
                    'border-radius': '0 5px 5px 0',
                    cursor: props.onHighlight ? 'pointer' : 'default',
                  }}
                  role="button"
                  tabIndex={0}
                  onClick={highlight}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      highlight();
                    }
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      gap: '0.45rem',
                      'flex-wrap': 'wrap',
                    }}
                  >
                    <span
                      style={{
                        'font-size': '0.62rem',
                        'font-weight': 700,
                        'text-transform': 'uppercase',
                        'letter-spacing': '0.05em',
                        color: roleColor(n.role),
                      }}
                    >
                      {n.role}
                    </span>
                    <Show when={n.speaker}>
                      <Show
                        when={props.onPushRabbi && n.named}
                        fallback={
                          <span style={{ 'font-weight': n.named ? 600 : 400, color: '#444' }}>
                            {n.speaker}
                          </span>
                        }
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            props.onPushRabbi?.(n.speaker);
                          }}
                          style={{
                            font: 'inherit',
                            'font-weight': 600,
                            color: '#0b5cad',
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            'text-decoration': 'underline',
                            'text-underline-offset': '2px',
                          }}
                        >
                          {n.speaker}
                        </button>
                      </Show>
                    </Show>
                    <Show when={n.side}>
                      <span
                        style={{
                          'font-size': '0.6rem',
                          padding: '0.05rem 0.35rem',
                          'border-radius': '3px',
                          color: '#fff',
                          background: sideTint(n.side) ?? '#888',
                        }}
                      >
                        {n.side}
                      </span>
                    </Show>
                  </div>
                  <Show when={n.excerpt}>
                    <div
                      dir="rtl"
                      lang="he"
                      style={{
                        'font-family': '"Mekorot Vilna", serif',
                        'font-size': '0.95rem',
                        color: '#333',
                        'margin-top': '0.15rem',
                      }}
                    >
                      {n.excerpt}…
                    </div>
                  </Show>
                  <Show when={!n.excerpt && n.summary}>
                    <div style={{ color: '#555', 'margin-top': '0.15rem' }}>{n.summary}</div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>

        {/* The overlay: the dialectical / opposition links, each with provenance. */}
        <Show when={overlay().length > 0}>
          <div style={{ 'margin-top': '0.7rem' }}>
            <div
              style={{
                'font-size': '0.62rem',
                'text-transform': 'uppercase',
                'letter-spacing': '0.06em',
                color: '#999',
                'margin-bottom': '0.3rem',
              }}
            >
              Relations
            </div>
            <For each={overlay()}>
              {(l) => (
                <div
                  style={{
                    display: 'flex',
                    'align-items': 'center',
                    gap: '0.4rem',
                    'font-size': '0.76rem',
                    color: '#555',
                    padding: '0.12rem 0',
                  }}
                >
                  <span>{label(byId().get(l.from))}</span>
                  <span
                    style={{
                      color: l.relation === 'opposes' ? '#b91c1c' : '#0369a1',
                      'font-weight': 600,
                    }}
                  >
                    {l.relation === 'opposes' ? '⇄' : '→'} {RELATION_LABEL[l.relation]}
                  </span>
                  <span>{label(byId().get(l.to))}</span>
                  <span
                    title={
                      l.source === 'voices'
                        ? 'from the model’s voice analysis'
                        : 'derived deterministically from move roles'
                    }
                    style={{
                      'font-size': '0.58rem',
                      color: '#999',
                      border: '1px solid #e3e3e0',
                      'border-radius': '3px',
                      padding: '0 0.25rem',
                    }}
                  >
                    {l.source}
                  </span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
