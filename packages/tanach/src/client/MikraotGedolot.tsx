import { paintRangeOverlay, resetOverlay } from '@corpus/ui/highlightOverlay';
import { clusterByLine, MarginPod } from '@corpus/ui/MarginPod';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Index,
  type JSX,
  onCleanup,
  Show,
} from 'solid-js';
import { DafRenderer } from '../lib/daf-render/index.ts';
import { hebrewNumeral } from '../lib/hebrew.ts';
import { type SourceKind, type SourceVerse, verseKinds } from '../lib/sources.ts';
import { t } from './i18n.ts';

interface MGVerse {
  n: number;
  pasuk: string;
  rashi: string;
  targum: string;
}
interface MG {
  book: string;
  chapter: number;
  ref: string;
  heRef: string;
  verses: MGVerse[];
  next: string | null;
  prev: string | null;
  error?: string;
}
interface Section {
  verse: number;
  en: string;
  he: string;
}

async function fetchMG(loc: { book: string; chapter: number }): Promise<MG> {
  const res = await fetch(`/api/mikraot/${encodeURIComponent(loc.book)}/${loc.chapter}`);
  const data = (await res.json()) as MG;
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

/** A wide content width — broad like a Mikraot Gedolot spread, but leaving side
 *  gutters so a side panel can sit alongside it (like the Talmud reader). */
function wideWidth(): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  return Math.min(1300, Math.max(680, vw - 240));
}

// Panim (main biblical text) gets a more formal serif; the commentaries keep
// Frank Ruhl Libre so the central column reads distinct from the margins.
const MAIN_FAM = 'Noto Serif Hebrew';
const SIDE_FAM = 'Frank Ruhl Libre';
const ICON_SIZE = 16;

/** Each verse / commentary piece is tagged with its verse number so hovering one
 *  cross-highlights the pasuk and its Rashi + Onkelos together (like the daf). */
function seg(n: number, html: string, lead = ''): string {
  return `<span class="mg-seg" data-v="${n}">${lead}${html}</span>`;
}

/** The Mikraot Gedolot framed view: the pasuk (panim, with Hebrew verse numbers)
 *  in the center, wrapped by Rashi (inner) and Targum Onkelos (outer), laid out
 *  by the shared daf-renderer. Event-section labels + source icons are pinned in
 *  the side gutters (measured against the centered pasuk segments). */
export function MikraotGedolot(props: {
  book: string;
  chapter: number;
  lang: 'en' | 'he';
  sections: Section[];
  sources: SourceVerse[];
  activeVerse: number | null;
  onAnchor: (verse: number) => void;
  onSource: (verse: number, kind: SourceKind) => void;
}): JSX.Element {
  const [data] = createResource(() => ({ book: props.book, chapter: props.chapter }), fetchMG);
  const [width, setWidth] = createSignal(wideWidth());
  const [reflow, setReflow] = createSignal(0);
  const onResize = () => {
    setWidth(wideWidth());
    setReflow((n) => n + 1);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onResize);
    onCleanup(() => window.removeEventListener('resize', onResize));
  }

  const main = createMemo(() => {
    const d = data();
    if (!d) return ' ';
    return d.verses
      .map((v) => seg(v.n, v.pasuk, `<span class="vnum">${hebrewNumeral(v.n)}</span> `))
      .join(' ');
  });
  const inner = createMemo(() => {
    const d = data();
    if (!d) return ' ';
    return (
      d.verses
        .filter((v) => v.rashi)
        .map((v) => seg(v.n, v.rashi))
        .join(' ') || ' '
    );
  });
  const outer = createMemo(() => {
    const d = data();
    if (!d) return ' ';
    return (
      d.verses
        .filter((v) => v.targum)
        .map((v) => seg(v.n, v.targum))
        .join(' ') || ' '
    );
  });

  let mainEl: HTMLElement | undefined;
  let host: HTMLDivElement | undefined;
  let curV: string | null = null;
  const highlight = (v: string | null) => {
    if (v === curV || !host) return;
    curV = v;
    host.querySelectorAll('.mg-seg.hl').forEach((el) => {
      el.classList.remove('hl');
    });
    if (v)
      host.querySelectorAll(`.mg-seg[data-v="${v}"]`).forEach((el) => {
        el.classList.add('hl');
      });
    paintSegments();
  };
  // The verse is marked in all three columns (text, Rashi, Onkelos), each as a
  // continuous block — the same overlay geometry as the scroll view.
  const paintSegments = () => {
    if (!host) return;
    const overlay = resetOverlay(host, 'verse-hl-overlay');
    const ranges = Array.from(host.querySelectorAll<HTMLElement>('.mg-seg.hl')).map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range;
    });
    paintRangeOverlay(overlay, host, ranges, {
      className: 'verse-hl',
      firstClass: 'verse-hl-first',
      lastClass: 'verse-hl-last',
      tolerance: 8,
    });
  };
  // Shared by mouse-over and focus so keyboard focus mirrors the hover highlight.
  const onOver = (e: Event) => {
    const s = (e.target as HTMLElement).closest('.mg-seg');
    highlight(s ? s.getAttribute('data-v') : null);
  };

  // Map each verse to the top of its PASUK segment (the centered main column),
  // relative to .mg-main; used to pin gutter anchors + icons.
  const [anchors, setAnchors] = createSignal<{ verse: number; label: string; top: number }[]>([]);
  // One shared pod per line of source icons, like the scroll and the Talmud.
  const [icons, setIcons] = createSignal<
    { y: number; items: { verse: number; kind: SourceKind }[] }[]
  >([]);
  const measure = () => {
    if (!mainEl || !host) {
      setAnchors([]);
      setIcons([]);
      return;
    }
    const mRect = mainEl.getBoundingClientRect();
    const hRect = host.getBoundingClientRect();
    const hostCenter = hRect.left + hRect.width / 2;
    // gutter room: between the daf (mg-host) and the mg-main edge
    const gutter = (mRect.width - hRect.width) / 2;
    if (gutter < 40) {
      setAnchors([]);
      setIcons([]);
      return;
    }
    // per verse, pick the pasuk seg (the one nearest the host centre)
    const segTop = new Map<number, number>();
    const best = new Map<number, number>();
    host.querySelectorAll<HTMLElement>('.mg-seg[data-v]').forEach((el) => {
      const v = Number(el.dataset.v);
      if (!v) return;
      const r = el.getBoundingClientRect();
      if (!r.height) return;
      const dist = Math.abs(r.left + r.width / 2 - hostCenter);
      if (!best.has(v) || dist < (best.get(v) as number)) {
        best.set(v, dist);
        segTop.set(v, r.top - mRect.top);
      }
    });

    const an: { verse: number; label: string; top: number }[] = [];
    for (const s of props.sections) {
      const t = segTop.get(s.verse);
      if (t == null) continue;
      an.push({
        verse: s.verse,
        label: (props.lang === 'he' ? s.he : s.en) || s.en || s.he,
        top: t,
      });
    }
    // de-collide labels (estimate height from text wrapped to the gutter width)
    an.sort((a, b) => a.top - b.top);
    const perLine = Math.max(8, Math.floor((Math.min(gutter, 120) - 12) / 6));
    let prevBottom = -Infinity;
    for (const a of an) {
      const h = Math.max(1, Math.ceil(a.label.length / perLine)) * 14 + 8;
      if (a.top < prevBottom + 4) a.top = prevBottom + 4;
      prevBottom = a.top + h;
    }
    setAnchors(an);

    const ic: { verse: number; kind: SourceKind; y: number }[] = [];
    for (const sv of props.sources) {
      const t = segTop.get(sv.verse);
      if (t == null) continue;
      for (const kind of verseKinds(sv)) ic.push({ verse: sv.verse, kind, y: t + ICON_SIZE / 2 });
    }
    setIcons(
      clusterByLine(ic).map((line) => ({
        y: line.reduce((sum, i) => sum + i.y, 0) / line.length,
        items: line.map(({ verse, kind }) => ({ verse, kind })),
      })),
    );
  };

  // Re-measure after the daf lays out / inputs change. The daf renders async, so
  // give it a couple of frames.
  createEffect(() => {
    data();
    width();
    reflow();
    props.sections;
    props.sources;
    props.lang;
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          measure();
          paintSegments();
        }),
      ),
    );
  });
  // Persist-highlight the verse whose drawer is open.
  createEffect(() => {
    const v = props.activeVerse;
    requestAnimationFrame(() => highlight(v == null ? null : String(v)));
  });

  return (
    <main class="mg-main" ref={mainEl}>
      <Show when={data.loading}>
        <p class="status">Loading commentaries…</p>
      </Show>
      <Show when={data.error}>
        <p class="status error">{(data.error as Error)?.message}</p>
      </Show>
      <Show when={data()}>
        {(d) => (
          <>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: hover-only cross-highlighting of pasuk/Rashi/Onkelos segments is decorative; activation lives on the gutter <button>s — a role would mis-announce the rendered daf text */}
            <div
              class="mg-host"
              ref={host}
              onMouseOver={onOver}
              onFocus={onOver}
              onMouseLeave={() => highlight(null)}
              onBlur={() => highlight(null)}
            >
              <DafRenderer
                main={main()}
                inner={inner()}
                outer={outer()}
                options={{
                  contentWidth: width(),
                  mainWidth: 0.5,
                  fontFamily: { main: MAIN_FAM, inner: SIDE_FAM, outer: SIDE_FAM },
                  fontSize: { main: 22, side: 16 },
                  lineHeight: { main: 32, side: 23 },
                }}
              />
            </div>
            <For each={anchors()}>
              {(a) => (
                <button
                  type="button"
                  class="evt-margin evt-left mg-anchor"
                  style={{ top: `${a.top}px` }}
                  title={`${a.label} (verse ${a.verse})`}
                  onClick={() => props.onAnchor(a.verse)}
                >
                  {a.label}
                </button>
              )}
            </For>
            <Index each={icons()}>
              {(pod) => (
                <MarginPod
                  items={pod().items.map(({ verse, kind }) => ({
                    id: `${verse}:${kind}`,
                    kind,
                    label: `${t(kind, props.lang)} \u00b7 ${t('verse', props.lang)} ${verse}`,
                  }))}
                  textSide="left"
                  x={`calc(100% - ${6 + ICON_SIZE / 2}px)`}
                  y={pod().y}
                  onActivate={(item) => {
                    const [verse, kind] = item.id.split(':');
                    props.onSource(Number(verse), kind as SourceKind);
                  }}
                  onPreview={(item) => highlight(item ? item.id.split(':')[0] : null)}
                />
              )}
            </Index>
            <p class="mg-caption">
              <span class="he">{d().heRef}</span>
              <span class="apparatus">פנים · רש״י · אונקלוס</span>
            </p>
          </>
        )}
      </Show>
    </main>
  );
}
