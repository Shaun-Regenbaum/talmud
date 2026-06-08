import { createMemo, createResource, createSignal, onCleanup, Show, type JSX } from 'solid-js';
import { DafRenderer } from '../lib/daf-render/index.ts';
import { hebrewNumeral } from '../lib/hebrew.ts';

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

const FAM = 'Frank Ruhl Libre';

/** Each verse / commentary piece is tagged with its verse number so hovering one
 *  cross-highlights the pasuk and its Rashi + Onkelos together (like the daf). */
function seg(n: number, html: string, lead = ''): string {
  return `<span class="mg-seg" data-v="${n}">${lead}${html}</span>`;
}

/** The Mikraot Gedolot framed view: the pasuk (panim, with Hebrew verse numbers)
 *  in the center, wrapped by Rashi (inner) and Targum Onkelos (outer), laid out
 *  by the shared daf-renderer — the same engine the Talmud reader uses. */
export function MikraotGedolot(props: { book: string; chapter: number }): JSX.Element {
  const [data] = createResource(() => ({ book: props.book, chapter: props.chapter }), fetchMG);
  const [width, setWidth] = createSignal(wideWidth());
  const onResize = () => setWidth(wideWidth());
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
    return d.verses.filter((v) => v.rashi).map((v) => seg(v.n, v.rashi)).join(' ') || ' ';
  });
  const outer = createMemo(() => {
    const d = data();
    if (!d) return ' ';
    return d.verses.filter((v) => v.targum).map((v) => seg(v.n, v.targum)).join(' ') || ' ';
  });

  let host: HTMLDivElement | undefined;
  let curV: string | null = null;
  const highlight = (v: string | null) => {
    if (v === curV || !host) return;
    curV = v;
    host.querySelectorAll('.mg-seg.hl').forEach((el) => el.classList.remove('hl'));
    if (v) host.querySelectorAll(`.mg-seg[data-v="${v}"]`).forEach((el) => el.classList.add('hl'));
  };
  const onOver = (e: MouseEvent) => {
    const s = (e.target as HTMLElement).closest('.mg-seg');
    highlight(s ? s.getAttribute('data-v') : null);
  };

  return (
    <main class="mg-main">
      <Show when={data.loading}>
        <p class="status">Loading commentaries…</p>
      </Show>
      <Show when={data.error}>
        <p class="status error">{(data.error as Error)?.message}</p>
      </Show>
      <Show when={data()}>
        {(d) => (
          <>
            <div class="mg-host" ref={host} onMouseOver={onOver} onMouseLeave={() => highlight(null)}>
              <DafRenderer
                main={main()}
                inner={inner()}
                outer={outer()}
                options={{
                  contentWidth: width(),
                  mainWidth: 0.5,
                  fontFamily: { main: FAM, inner: FAM, outer: FAM },
                  fontSize: { main: 22, side: 16 },
                  lineHeight: { main: 32, side: 23 },
                }}
              />
            </div>
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
