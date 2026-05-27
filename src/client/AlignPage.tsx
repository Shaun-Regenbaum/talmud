import { createResource, createSignal, For, Show, createMemo, type JSX } from 'solid-js';
import { TRACTATE_OPTIONS, type TalmudPageData } from '../lib/sefref';
import { tokenizeHebrewHtml } from './tokenize';
import { injectHadran } from './injectHadran';
import { injectSegmentMarkers, type SegmentStats } from './injectSegmentMarkers';
import { ContextSourcePanel } from './ContextSourcePanel';
import type { ContextItem } from '../lib/context/types';
import { applyMatches, type SegMatch } from '../lib/context/match';
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

/** Drop HTML markup (Sefaria text carries <b>/<strong>/<i>/<big>) for display. */
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** First `n` whitespace words of a Hebrew string, or undefined. */
function leadingWords(s: string | undefined, n: number): string | undefined {
  if (!s) return undefined;
  const w = stripTags(s).split(/\s+/).slice(0, n).join(' ');
  return w || undefined;
}

/** The dibur ha'maschil (lemma) of a Rashi/Tosafot piece — the Gemara words it
 *  quotes, before the " - " that separates the lemma from the comment. */
function diburHaMaschil(he: string | undefined): string | undefined {
  if (!he) return undefined;
  const lemma = stripTags(he).split(/\s[-־–—]\s/)[0];
  return leadingWords(lemma, 6);
}

/** What Hebrew to look for per source. AI quote (if any) wins; else the item's
 *  natural Hebrew anchor — the dibur ha'maschil for Rashi/Tosafot, the term/DH
 *  for dafyomi, leading Hebrew otherwise. `segs` always passed (bias + fallback). */
function hbQueryFor(item: ContextItem, quotes: Map<string, string>): LocateQuery {
  const segs = item.segs;
  const aiQuote = quotes.get(item.key);
  if (aiQuote) return { phrase: aiQuote, segs };
  if (item.source === 'sefaria-rashi' || item.source === 'sefaria-tosafot') {
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
  const [matchingSource, setMatchingSource] = createSignal<string | null>(null);

  const ref = createMemo(() => ({ tractate: tractate(), page: page() }));
  const [daf] = createResource(ref, fetchDaf);
  const [context] = createResource(ref, fetchContext);
  // Reset client-side state when the daf changes.
  createMemo(() => { ref(); setMatches([]); setAiQuotes(new Map()); setPinned(EMPTY); });

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
        // AI grounded this item at whole-daf level (placed by meaning, but no
        // single segment fits): record it as such — no word span to highlight.
        if (it.via === 'ai' && it.segs.length === 0) {
          it.hbVia = 'ai-daf';
          it.hbConfidence = it.confidence;
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

  const runAiMatch = async (source: string, items: ContextItem[]) => {
    setMatchingSource(source);
    try {
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
      if (got.length) {
        const nextQuotes = new Map(aiQuotes());
        for (const m of got) if (m.quote) nextQuotes.set(m.key, m.quote);
        setAiQuotes(nextQuotes);
        setMatches((prev) => [...prev, ...got]);
      }
    } finally {
      setMatchingSource(null);
    }
  };

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
                  onMatch={runAiMatch}
                  matchingSource={matchingSource()}
                />
              </section>
            </div>
        </>
      </Show>
    </main>
  );
}
