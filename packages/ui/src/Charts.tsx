import { createMemo, createSignal, For, type JSX, onCleanup, Show } from 'solid-js';
export interface LinePoint {
  label: string;
  value: number;
  estimated?: boolean;
}
export function LineChart(props: {
  points: LinePoint[];
  labels: { empty: string; estimated: string; measured: string; est: string; title: string };
  fmtLabel?: (label: string) => string;
  height?: number;
  color?: string;
  fmtValue: (n: number) => string;
}): JSX.Element {
  const fmtDay = (label: string) => props.fmtLabel?.(label) ?? label;
  const [viewWidth, setViewWidth] = createSignal(900);
  const H = () => props.height ?? 190;
  const pad = { l: 56, r: 16, t: 14, b: 22 };
  const color = () => props.color ?? 'var(--accent)';
  const plotW = () => viewWidth() - pad.l - pad.r;
  const plotH = () => H() - pad.t - pad.b;
  const pts = () => props.points;
  const yMax = () => Math.max(...pts().map((p) => p.value), 1e-9);
  const xAt = (i: number) =>
    pad.l + (pts().length <= 1 ? plotW() / 2 : (i / (pts().length - 1)) * plotW());
  const yAt = (v: number) => pad.t + plotH() - (v / yMax()) * plotH();
  // First measured index → boundary between the dashed (estimated) prefix and
  // the solid (measured) suffix.
  const boundary = createMemo(() => pts().findIndex((p) => !p.estimated));
  const polyline = (from: number, to: number) =>
    pts()
      .slice(from, to + 1)
      .map((p, k) => `${xAt(from + k).toFixed(1)},${yAt(p.value).toFixed(1)}`)
      .join(' ');
  const areaPath = () => {
    const n = pts().length;
    if (n < 2) return '';
    const top = pts()
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`)
      .join('');
    return `${top}L${xAt(n - 1).toFixed(1)},${(pad.t + plotH()).toFixed(1)}L${xAt(0).toFixed(1)},${(pad.t + plotH()).toFixed(1)}Z`;
  };
  const grid = () => [0, 0.5, 1].map((f) => ({ v: yMax() * f, y: yAt(yMax() * f) }));
  const xTicks = () => {
    const n = pts().length;
    if (n === 0) return [];
    const idxs =
      n <= 4 ? pts().map((_, i) => i) : [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
    return [...new Set(idxs)].map((i) => ({ i, x: xAt(i), label: fmtDay(pts()[i].label) }));
  };

  let svgRef: SVGSVGElement | undefined;
  let observer: ResizeObserver | undefined;
  const attachSvg = (element: SVGSVGElement) => {
    svgRef = element;
    observer?.disconnect();
    observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setViewWidth(Math.max(280, width));
    });
    observer.observe(element);
  };
  onCleanup(() => observer?.disconnect());
  const [hi, setHi] = createSignal<number | null>(null);
  const onMove = (e: MouseEvent) => {
    const r = svgRef?.getBoundingClientRect();
    if (!r?.width || pts().length === 0) return;
    const vbX = ((e.clientX - r.left) / r.width) * viewWidth();
    const frac = (vbX - pad.l) / plotW();
    const i = Math.round(frac * (pts().length - 1));
    setHi(Math.max(0, Math.min(pts().length - 1, i)));
  };
  // Reactive so the readout tracks the hovered index (a plain Show on `hi != null`
  // would only re-render on the null↔set edge, not index-to-index moves).
  const readout = createMemo(() => {
    const i = hi();
    if (i == null) return null;
    const p = pts()[i];
    if (!p) return null;
    const x = xAt(i);
    const y = yAt(p.value);
    const tipW = 96;
    const tx = Math.max(pad.l, Math.min(viewWidth() - pad.r - tipW, x - tipW / 2));
    return { p, x, y, tipW, tx };
  });

  return (
    <Show
      when={pts().length >= 2}
      fallback={
        <p style={{ color: '#aaa', 'font-size': '0.8rem', padding: '0.6rem 0' }}>
          {props.labels.empty}
        </p>
      }
    >
      <svg
        ref={attachSvg}
        viewBox={`0 0 ${viewWidth()} ${H()}`}
        width="100%"
        height={H()}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', 'max-width': '100%' }}
        role="img"
        aria-label={props.labels.title}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHi(null)}
      >
        <For each={grid()}>
          {(g) => (
            <>
              <line
                x1={pad.l}
                x2={viewWidth() - pad.r}
                y1={g.y}
                y2={g.y}
                stroke="#eee"
                stroke-width="1"
              />
              <text
                x={pad.l - 8}
                y={g.y + 3}
                text-anchor="end"
                fill="#aaa"
                font-size="10"
                font-family="system-ui, sans-serif"
              >
                {props.fmtValue(g.v)}
              </text>
            </>
          )}
        </For>
        <path d={areaPath()} fill={color()} fill-opacity="0.08" stroke="none" />
        {/* estimated prefix (dashed) */}
        <Show when={boundary() !== 0 && pts().some((p) => p.estimated)}>
          <polyline
            points={polyline(0, boundary() < 0 ? pts().length - 1 : boundary())}
            fill="none"
            stroke={color()}
            stroke-opacity="0.5"
            stroke-width="1.8"
            stroke-dasharray="4 3"
          />
        </Show>
        {/* measured suffix (solid) */}
        <Show when={boundary() >= 0}>
          <polyline
            points={polyline(Math.max(0, boundary() === 0 ? 0 : boundary()), pts().length - 1)}
            fill="none"
            stroke={color()}
            stroke-width="2"
          />
        </Show>
        {/* estimate → measured divider */}
        <Show when={boundary() > 0}>
          <line
            x1={xAt(boundary())}
            x2={xAt(boundary())}
            y1={pad.t}
            y2={pad.t + plotH()}
            stroke="#bbb"
            stroke-width="1"
            stroke-dasharray="2 2"
          />
          <text
            x={xAt(boundary()) - 4}
            y={pad.t + 9}
            text-anchor="end"
            fill="#bbb"
            font-size="9"
            font-family="system-ui, sans-serif"
          >
            {props.labels.estimated}
          </text>
          <text
            x={xAt(boundary()) + 4}
            y={pad.t + 9}
            text-anchor="start"
            fill="#999"
            font-size="9"
            font-family="system-ui, sans-serif"
          >
            {props.labels.measured}
          </text>
        </Show>
        <For each={xTicks()}>
          {(tk) => (
            <text
              x={tk.x}
              y={H() - 6}
              text-anchor={tk.i === 0 ? 'start' : tk.i === pts().length - 1 ? 'end' : 'middle'}
              fill="#aaa"
              font-size="10"
              font-family="system-ui, sans-serif"
            >
              {tk.label}
            </text>
          )}
        </For>
        {/* hover readout */}
        <Show when={readout()}>
          {(h) => (
            <>
              <line
                x1={h().x}
                x2={h().x}
                y1={pad.t}
                y2={pad.t + plotH()}
                stroke="#ccc"
                stroke-width="1"
              />
              <circle
                cx={h().x}
                cy={h().y}
                r="3.5"
                fill={color()}
                stroke="#fff"
                stroke-width="1.5"
              />
              <g transform={`translate(${h().tx}, ${pad.t})`}>
                <rect width={h().tipW} height="30" rx="4" fill="var(--fg)" opacity="0.92" />
                <text x="8" y="12" fill="#fff" font-size="10" font-family="system-ui, sans-serif">
                  {fmtDay(h().p.label)}
                  {h().p.estimated ? ` · ${props.labels.est}` : ''}
                </text>
                <text
                  x="8"
                  y="24"
                  fill="var(--surface)"
                  font-size="11"
                  font-weight="600"
                  font-family="system-ui, sans-serif"
                >
                  {props.fmtValue(h().p.value)}
                </text>
              </g>
            </>
          )}
        </Show>
      </svg>
    </Show>
  );
}

// A small titled chart card.
export function ChartCard(props: {
  title: string;
  sub?: string;
  children: JSX.Element;
}): JSX.Element {
  return (
    <div
      style={{
        flex: '1 1 380px',
        'min-width': 0,
        padding: '0.7rem 0.85rem 0.5rem',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        'border-radius': '8px',
      }}
    >
      <div style={{ 'margin-bottom': '0.2rem' }}>
        <span style={{ 'font-size': '0.8rem', 'font-weight': 600, color: '#444' }}>
          {props.title}
        </span>
        <Show when={props.sub}>
          <span style={{ 'font-size': '0.72rem', color: '#aaa', 'margin-left': '0.5rem' }}>
            {props.sub}
          </span>
        </Show>
      </div>
      {props.children}
    </div>
  );
}
