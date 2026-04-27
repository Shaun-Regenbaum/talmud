/**
 * Daf text side-panel for EnrichmentPage. Loads Hebrew Sefaria segments,
 * lets the user click one to highlight cards anchored to that segment.
 * Cards in turn can scroll the panel by setting selectedSegment.
 */
import { createEffect, createResource, For, Show, type JSX } from 'solid-js';

interface DafSegments {
  mainSegmentsHe?: string[];
  mainSegmentsEn?: string[];
}

export interface AnchorMatch {
  segmentIdx?: number;
  segmentRange?: [number, number];
  quote?: string;
}

export function anchorMatches(anchor: AnchorMatch | null | undefined, segIdx: number, segText?: string): boolean {
  if (!anchor) return false;
  if (anchor.segmentIdx === segIdx) return true;
  if (anchor.segmentRange && segIdx >= anchor.segmentRange[0] && segIdx <= anchor.segmentRange[1]) return true;
  if (anchor.quote && segText) {
    const q = anchor.quote.replace(/\s+/g, ' ').trim();
    if (!q || q.length < 6) return false;
    const seg = segText.replace(/\s+/g, ' ').trim();
    return seg.includes(q.slice(0, Math.min(40, q.length)));
  }
  return false;
}

export function DafTextPanel(props: {
  tractate: string;
  page: string;
  loadKey: number;
  selectedSegment: number | null;
  setSelectedSegment: (n: number | null) => void;
}): JSX.Element {
  const [daf] = createResource(
    () => `${props.tractate}|${props.page}|${props.loadKey}`,
    async (): Promise<DafSegments | null> => {
      if (props.loadKey === 0) return null;
      const res = await fetch(`/api/daf/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}`);
      if (!res.ok) return null;
      return res.json();
    },
  );

  let containerEl: HTMLDivElement | undefined;

  // Scroll the selected segment into view whenever it changes (typically
  // because a card was clicked elsewhere). Without this, the bidirectional
  // link "works" but the user can't see the segment when it's off-screen.
  createEffect(() => {
    const idx = props.selectedSegment;
    if (idx == null || !containerEl) return;
    const target = containerEl.querySelector<HTMLElement>(`[data-seg-idx="${idx}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  return (
    <>
      <style>{DAF_PANEL_CSS}</style>
      <Show when={daf.loading}><p class="loading">Loading daf text…</p></Show>
      <Show when={daf()}>
        {(d) => (
          <div class="daf-segs" ref={containerEl}>
            <For each={d().mainSegmentsHe ?? []}>{(seg, i) => (
              <div
                class="daf-seg"
                classList={{ 'daf-seg-selected': props.selectedSegment === i() }}
                onClick={() => props.setSelectedSegment(props.selectedSegment === i() ? null : i())}
                data-seg-idx={i()}
              >
                <span class="daf-seg-idx">[{i()}]</span>
                <span class="daf-seg-text" innerHTML={seg} />
              </div>
            )}</For>
          </div>
        )}
      </Show>
    </>
  );
}

const DAF_PANEL_CSS = `
.daf-segs { display: flex; flex-direction: column; gap: 0.2rem; max-height: calc(100vh - 250px); overflow-y: auto; padding: 0.4rem; background: #fafafa; border: 1px solid #e5e7eb; border-radius: 4px; }
.daf-seg { display: flex; gap: 0.4rem; padding: 0.3rem 0.45rem; border-radius: 3px; cursor: pointer; font-family: "Mekorot Vilna", "Arial Hebrew", David, serif; font-size: 14px; line-height: 1.55; color: #334155; }
.daf-seg:hover { background: #f1f5f9; }
.daf-seg-selected { background: #fef3c7; }
.daf-seg-idx { font-family: ui-monospace, Menlo, monospace; font-size: 10px; color: #94a3b8; flex-shrink: 0; padding-top: 0.15rem; }
.daf-seg-text { flex: 1; direction: rtl; text-align: right; }
`;
