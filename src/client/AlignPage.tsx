import { createResource, createSignal, For, Show, createMemo, createEffect, type JSX } from 'solid-js';
import { TRACTATE_OPTIONS, type TalmudPageData } from '../lib/sefref';
import { tokenizeHebrewHtml } from './tokenize';
import { injectHadran } from './injectHadran';
import { injectSegmentMarkers, type SegmentStats } from './injectSegmentMarkers';
import { ContextSourcePanel } from './ContextSourcePanel';
import type { ContextItem } from '../lib/context/types';
import { applyMatches, type SegMatch } from '../lib/context/match';
import { placementLevel, isAiGrounded, isReferenceSource } from '../lib/context/placement';
import { diburHaMaschil, leadingWords } from '../lib/context/dibur';
import { buildHbWords, locateInHb, type HbWords, type LocateQuery } from './hbAlign';

interface AlignedDaf extends TalmudPageData {
  _source?: string;
  mainSegmentsHe?: string[];
  mainSegmentsEn?: string[];
}

async function fetchDaf(input: { tractate: string; page: string }): Promise<AlignedDaf> {
  const res = await fetch(`/api/daf/${encodeURIComponent(input.tractate)}/${input.page}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchContext(input: { tractate: string; page: string }): Promise<ContextItem[]> {
  const res = await fetch(`/api/context/${encodeURIComponent(input.tractate)}/${input.page}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: ContextItem[] };
  return data.items ?? [];
}

const PALETTE = [
  '#fee2e2', '#fef3c7', '#dcfce7', '#dbeafe', '#ede9fe',
  '#fce7f3', '#ffedd5', '#d1fae5', '#cffafe', '#e0e7ff',
];
const segColor = (idx: number) => PALETTE[idx % PALETTE.length];

function renderAlignedHtml(mainHtml: string, segmentsHe: string[]): { html: string; stats: SegmentStats } {
  const tokenized = tokenizeHebrewHtml(mainHtml);
  const hadran = injectHadran(tokenized);
  return injectSegmentMarkers(hadran, segmentsHe);
}


/** Sources whose text opens with a Gemara lemma (dibur ha'maschil). */
const DH_SOURCES = new Set(['sefaria-rashi', 'sefaria-tosafot', 'sefaria-rishonim']);

/** What Hebrew to look for per source. AI quote (if any) wins; else the item's
 *  natural Hebrew anchor — the dibur ha'maschil for Rashi/Tosafot/Rishonim, the
 *  term/DH for dafyomi, leading Hebrew otherwise. `segs` always passed (bias +
 *  fallback); when an item has none, the locator's no-window phrase search runs. */
function hbQueryFor(item: ContextItem, quotes: Map<string, string>): LocateQuery {
  const segs = item.segs;
  const aiQuote = quotes.get(item.key);
  if (aiQuote) return { phrase: aiQuote, segs };
  if (DH_SOURCES.has(item.source)) {
    return { phrase: diburHaMaschil(item.body?.he), segs };
  }
  return { phrase: leadingWords(item.title?.he, 6) ?? leadingWords(item.body?.he, 6), segs };
}

interface HL { segs: number[]; words: number[]; daf?: boolean }
const EMPTY: HL = { segs: [], words: [] };

export function AlignPage(): JSX.Element {
  const initialParams = new URLSearchParams(window.location.search);
  const [tractate, setTractate] = createSignal(initialParams.get('tractate') ?? 'Berakhot');
  const [page, setPage] = createSignal(initialParams.get('page') ?? '5a');
  // Highlight has two layers (pinned from a selected source, hover transient)
  // and two granularities: `words` = exact HB word indices, `segs` = segments.
  const [pinned, setPinned] = createSignal<HL>(EMPTY);
  const [hover, setHover] = createSignal<HL>(EMPTY);
  const effective = () => (hover().segs.length || hover().words.length || hover().daf ? hover() : pinned());
  // AI matches + the Hebrew quotes they emit (resolved to HB spans client-side).
  const [matches, setMatches] = createSignal<SegMatch[]>([]);
  const [aiQuotes, setAiQuotes] = createSignal<Map<string, string>>(new Map());
  // Auto-grounding progress: { left, total } while running, null when idle/done.
  const [grounding, setGrounding] = createSignal<{ left: number; total: number } | null>(null);

  const ref = createMemo(() => ({ tractate: tractate(), page: page() }));
  const [daf] = createResource(ref, fetchDaf);
  const [context] = createResource(ref, fetchContext);
  // Reset client-side state when the daf changes.
  createMemo(() => { ref(); setMatches([]); setAiQuotes(new Map()); setPinned(EMPTY); setGrounding(null); });

  const rendered = createMemo(() => {
    const d = daf();
    if (!d) return null;
    return renderAlignedHtml(d.mainText.hebrew, d.mainSegmentsHe ?? []);
  });

  // Indexed HB word stream (for the locator). Derived from the HB render.
  const hbWords = createMemo<HbWords | null>(() => {
    const html = rendered()?.html;
    return html ? buildHbWords(html) : null;
  });

  const segmentCount = () => daf()?.mainSegmentsHe?.length ?? 0;
  const stats = () => rendered()?.stats;

  // The context pool + client-side HB placement: clone, apply AI segment
  // matches, then locate each item's Hebrew on the HB word stream.
  const contextItems = createMemo<ContextItem[]>(() => {
    const items = (context() ?? []).map((i) => ({ ...i }));
    if (matches().length) applyMatches(items, matches());
    const hb = hbWords();
    if (hb && hb.norm.length) {
      const quotes = aiQuotes();
      for (const it of items) {
        // AI returned no segment for this item. If we at least know its amud,
        // keep that (more specific than whole-daf, and avoids clutter); only
        // mark an explicit whole-daf grounding when nothing finer is known.
        if (it.via === 'ai' && it.segs.length === 0) {
          it.hbConfidence = it.confidence;
          if (!it.amud) it.hbVia = 'ai-daf';
          continue;
        }
        const loc = locateInHb(hb, hbQueryFor(it, quotes));
        if (!loc) continue;
        it.hbWords = loc.words;
        if (it.via === 'ai') {
          // Contextual AI placement: trust the segment pick (chosen by meaning);
          // a verbatim quote only TIGHTENS it onto exact words when it lands.
          // Either way carry the AI's own confidence, not the locator's coarse 0.3.
          it.hbVia = loc.via === 'segment' ? 'ai-segment' : 'ai-phrase';
          it.hbConfidence = it.confidence ?? loc.confidence;
        } else {
          it.hbVia = loc.via;
          it.hbConfidence = loc.confidence;
        }
      }
    }
    return items;
  });

  /** Ground one batch of items via the AI placer; apply the results. */
  const groundBatch = async (items: ContextItem[]): Promise<void> => {
    const res = await fetch('/api/context/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tractate: tractate(),
        page: page(),
        items: items.map((it) => ({
          key: it.key,
          label: it.sourceLabel,
          title: it.title?.en ?? it.title?.he,
          text: (it.body?.en ?? it.body?.he ?? '').slice(0, 600),
        })),
      }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { matches?: SegMatch[] };
    const got = data.matches ?? [];
    if (!got.length) return;
    const nextQuotes = new Map(aiQuotes());
    for (const m of got) if (m.quote) nextQuotes.set(m.key, m.quote);
    setAiQuotes(nextQuotes);
    setMatches((prev) => [...prev, ...got]);
  };

  // Items not yet grounded on a span (unplaced, or only amud-level), from a
  // groundable source, that the AI placer hasn't already handled. Reference
  // sources (halachic cross-refs, topics) are daf-level by nature — force-
  // grounding them just yields whole-daf clutter (and LLM spend), so skip them.
  const candidatesToGround = (): ContextItem[] =>
    contextItems().filter((it) => {
      if (isReferenceSource(it)) return false;
      const lvl = placementLevel(it);
      return (lvl === null || lvl === 'amud') && !isAiGrounded(it);
    });

  /** Automatically ground everything on load, batched, with a progress count.
   *  Server-cached per daf, so revisits are instant and don't re-spend. */
  const runAutoGrounding = async (forKey: string) => {
    const total = candidatesToGround().length;
    if (!total) { setGrounding(null); return; }
    setGrounding({ left: total, total });
    const BATCH = 30;
    const sent = new Set<string>(); // CUMULATIVE — each item is sent at most once
    let done = 0;
    // Re-derive each round (a batch may place several items at once); only ever
    // send items we haven't sent, so a model that omits an item can't loop us.
    for (;;) {
      if (`${tractate()}:${page()}` !== forKey) return; // daf changed mid-run
      const batch = candidatesToGround().filter((it) => !sent.has(it.key)).slice(0, BATCH);
      if (!batch.length) break;
      batch.forEach((b) => sent.add(b.key));
      await groundBatch(batch);
      done += batch.length;
      setGrounding({ left: Math.max(0, total - done), total });
    }
    setGrounding(null);
  };

  // Fire once per daf, when the context pool and the HB word stream are ready.
  let autoRunFor = '';
  createEffect(() => {
    const items = context();
    const hb = hbWords();
    const key = `${tractate()}:${page()}`;
    if (!items || !items.length || !hb) return;
    if (autoRunFor === key) return;
    autoRunFor = key;
    void runAutoGrounding(key);
  });

  return (
    <main class="page-shell" style={{ '--page-max': '1400px', 'font-family': 'system-ui, -apple-system, sans-serif', color: '#222' }}>
      <header class="responsive-row" style={{ 'margin-bottom': '1rem' }}>
        <h1 style={{ margin: 0, 'font-size': '1.4rem' }}>Alignment workbench</h1>
        <a href="#daf" style={{ color: '#666', 'font-size': '0.85rem', 'text-decoration': 'none' }}>← back to daf</a>
        <a href="#about" style={{ color: '#666', 'font-size': '0.85rem', 'text-decoration': 'none' }}>sources & credits</a>
        <select
          value={tractate()}
          onChange={(e) => setTractate(e.currentTarget.value)}
          style={{ padding: '0.3rem 0.5rem', 'font-size': '0.9rem', 'margin-left': '1rem' }}
        >
          <For each={TRACTATE_OPTIONS}>{(o) => <option value={o.value}>{o.value}</option>}</For>
        </select>
        <input
          value={page()}
          onInput={(e) => setPage(e.currentTarget.value)}
          style={{ width: '5rem', padding: '0.3rem 0.5rem', 'font-size': '0.9rem' }}
        />
        <Show when={stats()}>
          {(s) => (
            <span style={{ color: '#666', 'font-size': '0.85rem', 'margin-left': 'auto' }}>
              Aligned <b>{s().alignedSegments}</b> / {s().totalSegments} segments · {s().alignedWords} / {s().totalWords} words
              {' '}({Math.round((s().alignedWords / Math.max(1, s().totalWords)) * 100)}%)
            </span>
          )}
        </Show>
      </header>

      <Show when={daf.loading}><p style={{ color: '#888' }}>Loading…</p></Show>
      <Show when={daf.error}><p style={{ color: '#c33' }}>Error: {String(daf.error)}</p></Show>

      <Show when={daf()}>
        <>
          <div class="responsive-2col">
              <section class="align-sticky-source">
                <h2 style={{ 'font-size': '0.9rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', margin: '0 0 0.4rem' }}>
                  Source text <span style={{ 'text-transform': 'none', color: '#bbb', 'font-weight': 400 }}>· HebrewBooks</span>
                </h2>
                <div
                  dir="rtl"
                  lang="he"
                  style={{
                    'font-family': '"Mekorot Vilna", serif',
                    'font-size': '1.05rem',
                    'line-height': 1.7,
                    padding: '1rem',
                    'border-radius': '6px',
                    // A whole-daf grounding (hovering an "ai-daf" item) washes the
                    // entire canvas, since it's about the page as a whole.
                    border: effective().daf ? '1px solid #fcd34d' : '1px solid #eee',
                    'box-shadow': effective().daf ? 'inset 0 0 0 9999px rgba(252,211,77,0.12)' : 'none',
                    background: '#fff',
                    'text-align': 'justify',
                  }}
                  innerHTML={rendered()?.html ?? ''}
                  onMouseOver={(e) => {
                    const w = (e.target as HTMLElement).closest('.daf-word') as HTMLElement | null;
                    if (!w) return;
                    const s = w.getAttribute('data-seg');
                    const wi = w.getAttribute('data-word-index');
                    setHover({ segs: s != null ? [Number(s)] : [], words: wi != null ? [Number(wi)] : [] });
                  }}
                  onMouseLeave={() => setHover(EMPTY)}
                />
                <style>{`
                  ${Array.from({ length: segmentCount() }).map((_, i) =>
                    `.daf-word[data-seg="${i}"] { background-color: ${segColor(i)}; border-radius: 2px; }`
                  ).join('\n')}
                  ${(effective().words.length
                    ? effective().words.map((w) => `.daf-word[data-word-index="${w}"] { outline: 2px solid #8a2a2b; background-color: #fde68a; }`)
                    : effective().segs.map((s) => `.daf-word[data-seg="${s}"] { outline: 2px solid #8a2a2b; }`)
                  ).join('\n')}
                `}</style>
              </section>

              <section>
                <Show when={context.loading}>
                  <p style={{ color: '#aaa', 'font-size': '0.85rem' }}>Loading connections…</p>
                </Show>
                <Show when={!context.loading && contextItems().length === 0}>
                  <p style={{ color: '#aaa', 'font-size': '0.85rem' }}>
                    No external context for {tractate()} {page()}. For dafyomi.co.il content, run{' '}
                    <code>node scripts/scrape-dafyomi.mjs --tractate {tractate()} --daf {(page().match(/\d+/) ?? [''])[0]}</code>.
                  </p>
                </Show>
                <ContextSourcePanel
                  items={contextItems()}
                  onHover={(h) => setHover(h)}
                  onLeave={() => setHover(EMPTY)}
                  onSelectSource={(_source, h) => setPinned(h)}
                  grounding={grounding()}
                />
              </section>
            </div>
        </>
      </Show>
    </main>
  );
}
