import { createSignal, createMemo, createEffect, For, Show, type JSX } from 'solid-js';
import { type ContextItem, rangeLabel } from '../lib/context/types';
import { isLocated, placementOf, isReferenceSource } from '../lib/context/placement';
import { ChartTableView } from './ChartTableView';

/** Highlight payload: precise HB word indices + the segments they sit in, or a
 *  whole-daf wash (`daf`). */
interface Hl { segs: number[]; words: number[]; daf?: boolean }
const EMPTY: Hl = { segs: [], words: [] };

/** Drop HTML markup (Sefaria text carries <b>/<strong>/<i>/<big>) for display. */
function stripTags(s: string | undefined): string {
  return s ? s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
}

/**
 * The alignment workbench's external-context panel. Source tabs pick a
 * "match-up"; selecting one pins its placement onto the HB daf (`onSelectSource`).
 * Cards report how each item landed on the text (via + confidence). Sources with
 * items not yet precisely located get a "Match to text (AI)" button.
 */
export function ContextSourcePanel(props: {
  items: ContextItem[];
  onHover: (h: Hl) => void;
  onLeave: () => void;
  onSelectSource?: (source: string, h: Hl) => void;
  /** Auto-grounding progress, or null when idle/done. */
  grounding?: { left: number; total: number } | null;
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

  const itemsOf = (source: string) =>
    source === 'all' ? props.items : props.items.filter((i) => i.source === source);
  const hlOf = (source: string): Hl => {
    const segs = new Set<number>();
    const words = new Set<number>();
    for (const it of itemsOf(source)) {
      for (const s of it.segs) segs.add(s);
      for (const w of it.hbWords ?? []) words.add(w);
    }
    return { segs: [...segs].sort((a, b) => a - b), words: [...words].sort((a, b) => a - b) };
  };

  const visible = createMemo(() => itemsOf(selected()));
  const locatedCount = createMemo(() => props.items.filter(isLocated).length);
  const dafCount = createMemo(() => props.items.filter((i) => placementOf(i)?.level === 'daf').length);

  const pick = (source: string) => {
    setSelected(source);
    props.onSelectSource?.(source, source === 'all' ? EMPTY : hlOf(source));
  };

  // Re-pin when items change (e.g. after AI matching places words).
  createEffect(() => {
    props.items; // track
    if (selected() !== 'all') props.onSelectSource?.(selected(), hlOf(selected()));
  });

  return (
    <section>
      <h2 style={{ 'font-size': '0.9rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', 'margin-bottom': '0.4rem' }}>
        Connections
        <span style={{ 'text-transform': 'none', 'margin-left': '0.6rem', color: '#aaa', 'font-size': '0.8rem' }}>
          {props.items.length} items · {locatedCount()} located on the text{dafCount() > 0 ? ` · ${dafCount()} whole-daf` : ''}
        </span>
      </h2>

      <style>{`@keyframes ctx-spin { to { transform: rotate(360deg); } } .ctx-spin { animation: ctx-spin 0.7s linear infinite; }`}</style>
      <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.35rem', 'margin-bottom': '0.6rem', 'align-items': 'center' }}>
        <Tab active={selected() === 'all'} label="All" n={props.items.length} onClick={() => pick('all')} />
        <For each={sources()}>
          {(s) => <Tab active={selected() === s.source} label={s.label} n={s.n} onClick={() => pick(s.source)} />}
        </For>
        <Show when={props.grounding}>
          {(g) => (
            <span style={{ 'margin-left': '0.5rem', display: 'inline-flex', 'align-items': 'center', gap: '0.4rem', 'font-size': '0.78rem', color: '#0369a1' }}>
              <span
                class="ctx-spin"
                style={{ width: '0.8rem', height: '0.8rem', border: '2px solid #bae6fd', 'border-top-color': '#0369a1', 'border-radius': '50%', 'box-sizing': 'border-box' }}
              />
              {g().left > 0 ? `grounding ${g().left} more…` : 'finishing…'}
            </span>
          )}
        </Show>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.5rem' }}>
        <For each={visible()}>
          {(item) => (
            <ContextCard
              item={item}
              onEnter={() => props.onHover(
                placementOf(item)?.level === 'daf'
                  ? { segs: [], words: [], daf: true }
                  : { segs: item.segs, words: item.hbWords ?? [] },
              )}
              onLeave={props.onLeave}
            />
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
  // One read of the grounding layer drives the card's label + colours.
  const place = () => placementOf(props.item);
  const level = () => place()?.level;
  const via = () => place()?.via ?? it.hbVia ?? it.via;
  const conf = () => place()?.confidence;
  // Segment is the unit the rest of the app consumes, so the headline is the
  // segment range for BOTH `words` and `segment` — a word landing is the same
  // segment grounding, just tightened. The word count rides along as a muted
  // sub-detail (see `wordDetail`) rather than the headline.
  const located = () => level() === 'words' || level() === 'segment';
  const placeLabel = () => {
    switch (level()) {
      case 'daf': return 'whole daf';
      case 'words':
      case 'segment': return rangeLabel(it.segs, it.amud);
      case 'amud': return `amud ${it.amud}`;
      // unplaced: distinguish daf-level reference context from a placement miss.
      default: return isReferenceSource(it) ? 'reference' : 'not located';
    }
  };
  // The precise landing, shown small and muted — visible for debugging, but it
  // doesn't change what downstream sees (which is the segment span above).
  const wordDetail = () =>
    level() === 'words' && it.hbWords?.length ? `${it.hbWords.length} word${it.hbWords.length === 1 ? '' : 's'}` : '';
  // Located on the text (words OR segment, indistinguishable downstream) → green;
  // whole-daf → violet; else neutral.
  const accent = () => (located() ? '#059669' : level() === 'daf' ? '#a78bfa' : '#d1d5db');
  const labelColor = () => (located() ? '#059669' : level() === 'daf' ? '#7c3aed' : '#999');
  const bodyEn = () => stripTags(it.body?.en ?? '');
  const long = () => bodyEn().length > 280;
  const shown = () => (open() || !long() ? bodyEn() : bodyEn().slice(0, 280) + '…');

  return (
    <article
      onMouseEnter={props.onEnter}
      onMouseLeave={props.onLeave}
      style={{
        border: '1px solid #eee', 'border-radius': '6px', padding: '0.55rem 0.7rem', background: '#fff',
        'border-left': `3px solid ${accent()}`,
      }}
    >
      <div style={{ display: 'flex', 'align-items': 'baseline', gap: '0.5rem', 'margin-bottom': '0.25rem', 'flex-wrap': 'wrap' }}>
        <span style={{ 'font-size': '0.68rem', 'font-weight': 700, color: '#8a2a2b', 'text-transform': 'uppercase', 'letter-spacing': '0.04em' }}>
          {it.sourceLabel}
        </span>
        <span style={{ 'font-size': '0.68rem', 'font-family': 'monospace', color: labelColor() }}>
          {placeLabel()}
        </span>
        <Show when={wordDetail()}>
          <span style={{ 'font-size': '0.62rem', 'font-family': 'monospace', color: '#aaa' }}>
            {wordDetail()}
          </span>
        </Show>
        <Show when={via()}>
          <span style={{ 'font-size': '0.62rem', 'font-family': 'monospace', color: '#0369a1', background: '#e0f2fe', padding: '0 0.3rem', 'border-radius': '3px' }}>
            {via()}{conf() != null ? ` ${conf()!.toFixed(2)}` : ''}
          </span>
        </Show>
        <Show when={it.url}>
          <a href={it.url} target="_blank" rel="noopener" style={{ 'margin-left': 'auto', 'font-size': '0.72rem', color: '#888', 'text-decoration': 'none' }}>
            source ↗
          </a>
        </Show>
      </div>

      <Show when={it.title?.he || it.title?.en}>
        <div style={{ 'margin-bottom': '0.2rem' }}>
          <Show when={it.title?.he}>
            <span dir="rtl" lang="he" style={{ 'font-family': '"Mekorot Vilna", serif', 'font-size': '0.95rem', 'margin-left': '0.4rem' }}>{stripTags(it.title!.he)}</span>
          </Show>
          <Show when={it.title?.en}>
            <span style={{ 'font-weight': 600, 'font-size': '0.85rem' }}>{stripTags(it.title!.en)}</span>
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
      <Show when={it.table}>
        {(tbl) => <ChartTableView table={tbl()} />}
      </Show>
      <Show when={!it.table && !bodyEn() && it.body?.he}>
        <div dir="rtl" lang="he" style={{ 'font-family': '"Mekorot Vilna", serif', 'font-size': '0.9rem', 'line-height': 1.55 }}>{stripTags(it.body!.he)}</div>
      </Show>
    </article>
  );
}
