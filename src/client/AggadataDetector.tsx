import { For, Show, type JSX } from 'solid-js';

export interface AggadataStory {
  title: string;
  titleHe?: string;
  summary: string;
  excerpt: string;
  theme?: string;
}

export interface AggadataResult {
  stories: AggadataStory[];
  _cached?: boolean;
  _model?: string;
  error?: string;
}

export interface AggadataDetectorProps {
  tractate: string;
  page: string;
  result: AggadataResult | null;
  loading: boolean;
  error: string | null;
  activeIndex: number | null;
  onRefresh: () => void;
  onSelectStory: (index: number) => void;
}

const THEME_COLORS: Record<string, string> = {
  miracle: '#7c3aed',
  dispute: '#b45309',
  parable: '#0369a1',
  biography: '#15803d',
  dream: '#6d28d9',
  ethics: '#b91c1c',
  exegesis: '#475569',
  folklore: '#a16207',
  prayer: '#1d4ed8',
};

export function AggadataDetector(props: AggadataDetectorProps): JSX.Element {
  const count = () => props.result?.stories.length ?? 0;

  return (
    <section
      style={{
        padding: '0.75rem 0.75rem 0.6rem',
        border: '1px solid #eee',
        'border-radius': '6px',
        background: '#fcfcfa',
        'font-family': 'system-ui, -apple-system, sans-serif',
        'font-size': '0.8rem',
        color: '#555',
      }}
    >
      <div
        style={{
          display: 'flex',
          'justify-content': 'space-between',
          'align-items': 'center',
          'margin-bottom': '0.5rem',
        }}
      >
        <div
          style={{
            color: '#999',
            'font-size': '0.72rem',
            'text-transform': 'uppercase',
            'letter-spacing': '0.06em',
          }}
        >
          Aggadot
          <Show when={props.result && count() > 0}>
            <span style={{ 'margin-left': '0.4rem', color: '#7c3aed', 'font-weight': 600 }}>
              {count()} {count() === 1 ? 'story' : 'stories'}
            </span>
          </Show>
        </div>
        <Show when={props.result && !props.loading}>
          <button
            onClick={() => props.onRefresh()}
            title="Re-run aggadata detection"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              'font-size': '0.7rem',
              cursor: 'pointer',
              padding: '0.1rem 0.3rem',
            }}
          >
            ↻
          </button>
        </Show>
      </div>

      <Show when={props.loading && !props.result}>
        <p
          style={{
            margin: 0,
            color: '#888',
            'font-size': '0.75rem',
            display: 'inline-flex',
            'align-items': 'center',
            gap: '0.4rem',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: '0.75rem',
              height: '0.75rem',
              'border-radius': '50%',
              border: '2px solid #d6d3d1',
              'border-top-color': '#7c3aed',
              animation: 'daf-spin 0.8s linear infinite',
            }}
          />
          Scanning for stories…
        </p>
      </Show>

      <Show when={props.error && !props.loading}>
        <p style={{ color: '#c33', margin: 0, 'font-size': '0.75rem' }}>
          {props.error}
          <button
            onClick={() => props.onRefresh()}
            style={{
              'margin-left': '0.5rem',
              padding: '0.15rem 0.4rem',
              'font-size': '0.7rem',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </p>
      </Show>

      <Show when={!props.loading && !props.error && props.result && count() === 0}>
        <p style={{ color: '#888', 'font-style': 'italic', margin: 0, 'font-size': '0.75rem' }}>
          No narrative aggadot detected on this amud.
        </p>
      </Show>

      <Show when={props.result && count() > 0}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.35rem' }}>
          <For each={props.result!.stories}>
            {(story, i) => {
              const active = () => props.activeIndex === i();
              const themeColor = () => (story.theme ? THEME_COLORS[story.theme] ?? '#7c3aed' : '#7c3aed');
              return (
                <button
                  onClick={() => props.onSelectStory(i())}
                  style={{
                    width: '100%',
                    'text-align': 'left',
                    padding: '0.5rem 0.6rem',
                    background: active() ? '#faf5ff' : '#fff',
                    border: '1px solid ' + (active() ? '#a78bfa' : '#eae8e0'),
                    'border-left': '3px solid ' + themeColor(),
                    'border-radius': '4px',
                    cursor: 'pointer',
                    'font-family': 'inherit',
                    'font-size': '0.8rem',
                    color: '#333',
                  }}
                  title={active() ? 'Click to un-highlight' : 'Click to highlight story in daf'}
                >
                  <div style={{ 'font-weight': 600, color: '#333', 'line-height': 1.3 }}>
                    {story.title}
                  </div>
                  <Show when={story.titleHe}>
                    <div
                      dir="rtl"
                      lang="he"
                      style={{
                        'font-family': '"Mekorot Vilna", serif',
                        color: '#888',
                        'font-size': '0.85rem',
                        'margin-top': '0.15rem',
                      }}
                    >
                      {story.titleHe}
                    </div>
                  </Show>
                  <Show when={story.theme}>
                    <span
                      style={{
                        display: 'inline-block',
                        'margin-top': '0.3rem',
                        padding: '0.05rem 0.4rem',
                        'font-size': '0.65rem',
                        'text-transform': 'uppercase',
                        'letter-spacing': '0.05em',
                        color: themeColor(),
                        background: '#fff',
                        border: '1px solid ' + themeColor(),
                        'border-radius': '3px',
                      }}
                    >
                      {story.theme}
                    </span>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </section>
  );
}
