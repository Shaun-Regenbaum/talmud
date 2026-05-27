import { createSignal, createMemo, For, Show, type JSX } from 'solid-js';
import type { ContextItem, AnchorState } from '../lib/context/types';

/**
 * The alignment workbench's external-context panel: source tabs across the top,
 * one card per ContextItem below. Hovering a card reports the segments it
 * anchors to (via `onHover`) so the daf above lights them up. Cards show their
 * anchor state so you can judge anchoring quality at a glance.
 */
export function ContextSourcePanel(props: {
  items: ContextItem[];
  onHover: (segs: number[]) => void;
  onLeave: () => void;
}): JSX.Element {
  const [selected, setSelected] = createSignal<string>('all');

  const sources = createMemo(() => {
    const counts = new Map<string, { label: string; n: number }>();
    for (const it of props.items) {
      const cur = counts.get(it.source) ?? { label: it.sourceLabel, n: 0 };
      cur.n++;
      counts.set(it.source, cur);
    }
    return Array.from(counts.entries()).map(([source, v]) => ({ source, ...v }));
  });

  const visible = createMemo(() =>
    selected() === 'all' ? props.items : props.items.filter((i) => i.source === selected()),
  );

  const matchedCount = createMemo(() => props.items.filter((i) => i.anchorMatched).length);

  return (
    <section>
      <h2 style={{ 'font-size': '0.9rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', 'margin-bottom': '0.4rem' }}>
        External context
        <span style={{ 'text-transform': 'none', 'margin-left': '0.6rem', color: '#aaa', 'font-size': '0.8rem' }}>
          {props.items.length} items · {matchedCount()} segment-anchored
        </span>
      </h2>

      <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.35rem', 'margin-bottom': '0.6rem' }}>
        <Tab active={selected() === 'all'} label="All" n={props.items.length} onClick={() => setSelected('all')} />
        <For each={sources()}>
          {(s) => <Tab active={selected() === s.source} label={s.label} n={s.n} onClick={() => setSelected(s.source)} />}
        </For>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.5rem' }}>
        <For each={visible()}>
          {(item) => (
            <ContextCard item={item} onEnter={() => props.onHover(item.highlightSegs)} onLeave={props.onLeave} />
          )}
        </For>
        <Show when={visible().length === 0}>
          <p style={{ color: '#aaa', 'font-size': '0.85rem' }}>No context for this source.</p>
        </Show>
      </div>
    </section>
  );
}

function Tab(props: { active: boolean; label: string; n: number; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        padding: '0.2rem 0.6rem', 'font-size': '0.8rem', 'border-radius': '999px', cursor: 'pointer',
        border: `1px solid ${props.active ? '#8a2a2b' : '#ddd'}`,
        background: props.active ? '#8a2a2b' : '#fff',
        color: props.active ? '#fff' : '#555',
      }}
    >
      {props.label} <span style={{ opacity: 0.7 }}>{props.n}</span>
    </button>
  );
}

function ContextCard(props: { item: ContextItem; onEnter: () => void; onLeave: () => void }): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const it = props.item;
  const bodyEn = () => it.body?.en ?? '';
  const long = () => bodyEn().length > 280;
  const shown = () => (open() || !long() ? bodyEn() : bodyEn().slice(0, 280) + '…');

  return (
    <article
      onMouseEnter={props.onEnter}
      onMouseLeave={props.onLeave}
      style={{
        border: '1px solid #eee', 'border-radius': '6px', padding: '0.55rem 0.7rem', background: '#fff',
        'border-left': `3px solid ${it.anchorMatched ? '#059669' : '#d1d5db'}`,
      }}
    >
      <div style={{ display: 'flex', 'align-items': 'baseline', gap: '0.5rem', 'margin-bottom': '0.25rem', 'flex-wrap': 'wrap' }}>
        <span style={{ 'font-size': '0.68rem', 'font-weight': 700, color: '#8a2a2b', 'text-transform': 'uppercase', 'letter-spacing': '0.04em' }}>
          {it.sourceLabel}
        </span>
        <span style={{ 'font-size': '0.68rem', 'font-family': 'monospace', color: it.anchorMatched ? '#059669' : '#999' }}>
          {anchorLabel(it.anchor)}
        </span>
        <Show when={it.url}>
          <a href={it.url} target="_blank" rel="noopener" style={{ 'margin-left': 'auto', 'font-size': '0.72rem', color: '#888', 'text-decoration': 'none' }}>
            source ↗
          </a>
        </Show>
      </div>

      <Show when={it.title?.he || it.title?.en}>
        <div style={{ 'margin-bottom': '0.2rem' }}>
          <Show when={it.title?.he}>
            <span dir="rtl" lang="he" style={{ 'font-family': '"Mekorot Vilna", serif', 'font-size': '0.95rem', 'margin-left': '0.4rem' }}>{it.title!.he}</span>
          </Show>
          <Show when={it.title?.en}>
            <span style={{ 'font-weight': 600, 'font-size': '0.85rem' }}>{it.title!.en}</span>
          </Show>
        </div>
      </Show>

      <Show when={bodyEn()}>
        <div style={{ 'font-size': '0.82rem', color: '#333', 'line-height': 1.5, 'white-space': 'pre-wrap' }}>{shown()}</div>
        <Show when={long()}>
          <button type="button" onClick={() => setOpen(!open())} style={{ 'margin-top': '0.2rem', 'font-size': '0.72rem', color: '#8a2a2b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {open() ? 'show less' : 'show more'}
          </button>
        </Show>
      </Show>
      <Show when={!bodyEn() && it.body?.he}>
        <div dir="rtl" lang="he" style={{ 'font-family': '"Mekorot Vilna", serif', 'font-size': '0.9rem', 'line-height': 1.55 }}>{it.body!.he}</div>
      </Show>
    </article>
  );
}

function anchorLabel(a: AnchorState): string {
  switch (a.kind) {
    case 'whole-daf': return 'whole daf';
    case 'amud': return `amud ${a.amud}`;
    case 'segment': return `seg #${a.segIdx}`;
    case 'phrase': return `seg #${a.segIdx} phrase`;
    case 'segment-range': return `seg #${a.startSegIdx}–${a.endSegIdx}`;
  }
}
