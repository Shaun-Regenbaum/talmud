/**
 * Narrow 340px sidebar render of an enriched DafAnalysis. Shared between:
 *   - /#enrichment page (strategy preview)
 *   - DafViewer's right-side aside (live daf reading companion)
 *
 * Layout (minimal, neutral palette):
 *   Header — tractate · page · optional partial note
 *   Daf summary (prose)
 *   For each argument section:
 *     Section header + section summary
 *     Stack of rabbi cards — each with its own "…" toggle that reveals the
 *       rabbi's opinionStart…opinionEnd span + +/− relationships.
 *     Section "…" toggle that reveals pesukim / parallels / difficulty.
 *
 * Section cards hook into a caller-supplied onAnchorClick callback so the
 * consuming view (DafViewer) can scroll to the matching Hebrew span in the
 * main daf column. The callback receives the section excerpt (verbatim
 * Hebrew) which the daf renderer can use as a search anchor.
 */
import { createSignal, For, Show, type JSX } from 'solid-js';

export interface BiblicalRef {
  ref: string;
  hebrewRef?: string;
  hebrewQuote?: string;
}
export interface DifficultyRating { score: 1 | 2 | 3 | 4 | 5; reason: string; }
export interface Rabbi {
  name: string;
  nameHe?: string;
  period?: string;
  location?: string;
  role?: string;
  opinionStart?: string;
  opinionEnd?: string;
  generation?: string;
  agreesWith?: string[];
  disagreesWith?: string[];
}
export interface AnalysisSection {
  title: string;
  summary: string;
  excerpt?: string;
  references?: BiblicalRef[];
  parallels?: string[];
  difficulty?: DifficultyRating;
  rabbis: Rabbi[];
}
export interface FlowAnalysis {
  summary: string;
  difficulty?: DifficultyRating;
  sections: AnalysisSection[];
}

export interface ArgumentFlowSidebarProps {
  tractate: string;
  page: string;
  analysis: FlowAnalysis;
  /** Optional caller-side note, e.g. "partial 3/5" while strategies load. */
  partialNote?: string | null;
  /** Called when the user clicks a section header — the excerpt can be
   *  used by the consuming daf view to scroll to / highlight that span. */
  onAnchorClick?: (excerpt: string, sectionIdx: number) => void;
}

export function ArgumentFlowSidebar(props: ArgumentFlowSidebarProps): JSX.Element {
  const a = () => props.analysis;
  return (
    <aside class="flow-sidebar">
      <header class="flow-header">
        <span class="flow-tractate">{props.tractate}</span>
        <span class="flow-page">{props.page}</span>
        <Show when={props.partialNote}>
          <span class="flow-partial">{props.partialNote}</span>
        </Show>
      </header>

      <Show when={a().summary}>
        <p class="flow-daf-summary">{a().summary}</p>
      </Show>

      <For each={a().sections}>{(sec, idx) => (
        <ArgumentSection
          sec={sec}
          idx={idx()}
          onAnchorClick={props.onAnchorClick}
        />
      )}</For>
    </aside>
  );
}

function ArgumentSection(props: {
  sec: AnalysisSection;
  idx: number;
  onAnchorClick?: (excerpt: string, sectionIdx: number) => void;
}): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const sec = () => props.sec;
  const hasSectionDetail = () => !!(
    (sec().references && sec().references!.length > 0)
    || (sec().parallels && sec().parallels!.length > 0)
    || sec().difficulty
  );
  const clickHead = () => {
    if (props.onAnchorClick && sec().excerpt) {
      props.onAnchorClick(sec().excerpt!, props.idx);
    }
  };

  return (
    <section class="flow-section">
      <h3
        class="flow-section-head"
        classList={{ 'flow-section-head-linked': !!props.onAnchorClick }}
        onClick={clickHead}
      >
        <span class="flow-section-num">§{props.idx + 1}</span>
        <span class="flow-section-title">{sec().title}</span>
      </h3>
      <Show when={sec().summary}>
        <p class="flow-section-summary">{sec().summary}</p>
      </Show>

      <Show when={sec().rabbis && sec().rabbis.length > 0}>
        <div class="flow-rabbis">
          <For each={sec().rabbis}>{(r) => <RabbiCard rabbi={r} />}</For>
        </div>
      </Show>

      <Show when={hasSectionDetail()}>
        <div class="flow-section-more">
          <button
            class="flow-more-btn"
            onClick={() => setOpen(!open())}
            aria-expanded={open()}
          >{open() ? '−' : '…'}</button>
        </div>

        <Show when={open()}>
          <div class="flow-detail">
            <Show when={sec().references && sec().references!.length > 0}>
              <div class="flow-d-row">
                <span class="flow-d-label">Pesukim</span>
                <div class="flow-d-body flow-d-wrap">
                  <For each={sec().references!}>{(ref) => (
                    <span class="flow-d-ref" title={ref.hebrewQuote || ref.ref}>
                      {ref.hebrewRef || ref.ref}
                    </span>
                  )}</For>
                </div>
              </div>
            </Show>
            <Show when={sec().parallels && sec().parallels!.length > 0}>
              <div class="flow-d-row">
                <span class="flow-d-label">See also</span>
                <div class="flow-d-body flow-d-wrap">
                  <For each={sec().parallels!}>{(p) => <span class="flow-d-parallel">{p}</span>}</For>
                </div>
              </div>
            </Show>
            <Show when={sec().difficulty}>
              <div class="flow-d-row">
                <span class="flow-d-label">Difficulty</span>
                <div class="flow-d-body">
                  <span class="flow-d-stars">{'★'.repeat(sec().difficulty!.score)}{'☆'.repeat(5 - sec().difficulty!.score)}</span>
                  <span class="flow-d-diff-reason"> {sec().difficulty!.reason}</span>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </Show>
    </section>
  );
}

function RabbiCard(props: { rabbi: Rabbi }): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const r = () => props.rabbi;
  const hasDetail = () => !!(
    r().opinionStart || r().opinionEnd
    || (r().agreesWith && r().agreesWith!.length > 0)
    || (r().disagreesWith && r().disagreesWith!.length > 0)
    || r().location
  );
  return (
    <div class="flow-rabbi">
      <div class="flow-rabbi-name">
        <span class="flow-rabbi-name-en">{r().name}</span>
        <Show when={r().nameHe}><span class="flow-rabbi-he"> · {r().nameHe}</span></Show>
        <Show when={r().period}>
          <span class="flow-rabbi-era">{r().period!.replace(/,.*$/, '')}</span>
        </Show>
      </div>
      <Show when={r().role}>
        <div class="flow-rabbi-role">{r().role}</div>
      </Show>

      <Show when={hasDetail()}>
        <button
          class="flow-rabbi-toggle"
          onClick={() => setOpen(!open())}
          aria-expanded={open()}
          aria-label={open() ? 'hide details' : 'show details'}
        >{open() ? '−' : '…'}</button>

        <Show when={open()}>
          <div class="flow-rabbi-detail">
            <Show when={r().opinionStart || r().opinionEnd}>
              <div class="flow-rabbi-span">
                <Show when={r().opinionStart}><span>{r().opinionStart}</span></Show>
                <Show when={r().opinionStart && r().opinionEnd}>
                  <span class="flow-rabbi-span-gap">&nbsp;…&nbsp;</span>
                </Show>
                <Show when={r().opinionEnd}><span>{r().opinionEnd}</span></Show>
              </div>
            </Show>
            <Show when={r().agreesWith && r().agreesWith!.length > 0}>
              <div class="flow-rabbi-rel">
                <span class="flow-d-plus">+</span>
                <span class="flow-d-prep"> with </span>{r().agreesWith!.join(', ')}
              </div>
            </Show>
            <Show when={r().disagreesWith && r().disagreesWith!.length > 0}>
              <div class="flow-rabbi-rel">
                <span class="flow-d-minus">−</span>
                <span class="flow-d-prep"> vs </span>{r().disagreesWith!.join(', ')}
              </div>
            </Show>
            <Show when={r().location}>
              <div class="flow-rabbi-loc">{r().location}</div>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}

/** Default export for convenient import. */
export default ArgumentFlowSidebar;

/** Scoped styles. Consumers can import and inject once.
 *  Kept as a string so any page can embed it without a CSS loader. */
export const ARGUMENT_FLOW_CSS = `
.flow-sidebar {
  width: 100%;
  max-width: 340px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: #334155;
  background: transparent;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.flow-header { display: flex; align-items: baseline; gap: 0.35rem; color: #64748b; font-size: 12px; }
.flow-tractate { font-weight: 600; color: #1e293b; }
.flow-partial { margin-left: auto; font-size: 10px; color: #94a3b8; }
.flow-daf-summary { font-size: 12.5px; color: #475569; margin: 0 0 0.25rem; line-height: 1.55; }

.flow-section { display: flex; flex-direction: column; gap: 0.35rem; }
.flow-section-head { display: flex; align-items: baseline; gap: 0.35rem; margin: 0; font-weight: 600; }
.flow-section-head-linked { cursor: pointer; }
.flow-section-head-linked:hover .flow-section-title { text-decoration: underline; text-decoration-color: #cbd5e1; text-underline-offset: 3px; }
.flow-section-num { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #94a3b8; font-weight: 600; }
.flow-section-title { color: #1e293b; font-size: 13.5px; line-height: 1.3; font-weight: 600; }
.flow-section-summary { font-size: 12.5px; color: #475569; margin: 0 0 0.2rem; line-height: 1.5; }

.flow-rabbis { display: flex; flex-direction: column; gap: 0.3rem; }
.flow-rabbi { position: relative; background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; padding: 0.4rem 0.6rem 0.4rem 0.6rem; }
.flow-rabbi-name { font-size: 12.5px; color: #1e293b; font-weight: 600; display: flex; align-items: baseline; gap: 0.25rem; flex-wrap: wrap; padding-right: 1.5rem; }
.flow-rabbi-name-en { font-weight: 600; }
.flow-rabbi-he { font-family: Arial Hebrew, David, serif; color: #64748b; font-weight: 500; }
.flow-rabbi-era { margin-left: auto; font-size: 10px; color: #94a3b8; font-weight: 400; white-space: nowrap; }
.flow-rabbi-role { font-size: 12px; color: #475569; margin-top: 0.2rem; line-height: 1.45; padding-right: 1.5rem; }

.flow-rabbi-toggle { position: absolute; bottom: 0.2rem; right: 0.4rem; border: none; background: transparent; color: #cbd5e1; font-size: 14px; cursor: pointer; padding: 0.1rem 0.35rem; line-height: 1; border-radius: 2px; }
.flow-rabbi-toggle:hover { color: #475569; background: #f1f5f9; }
.flow-rabbi-detail { margin-top: 0.45rem; padding-top: 0.35rem; border-top: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 0.3rem; }
.flow-rabbi-span { font-family: Arial Hebrew, David, serif; direction: rtl; text-align: right; font-size: 13px; color: #475569; padding: 0.2rem 0.4rem; background: #f8fafc; border-radius: 2px; }
.flow-rabbi-span-gap { color: #94a3b8; font-family: system-ui; }
.flow-rabbi-rel { font-size: 11.5px; color: #334155; line-height: 1.4; }
.flow-rabbi-loc { font-size: 11px; color: #94a3b8; font-style: italic; }

.flow-section-more { display: flex; justify-content: center; margin-top: 0.1rem; }
.flow-more-btn { border: 1px dashed #e5e7eb; background: transparent; color: #94a3b8; font-size: 12px; cursor: pointer; padding: 0 0.7rem; line-height: 1.3; border-radius: 3px; }
.flow-more-btn:hover { color: #475569; border-color: #cbd5e1; }

.flow-detail { padding: 0.5rem 0.25rem 0; display: flex; flex-direction: column; gap: 0.4rem; }
.flow-d-row { display: flex; gap: 0.5rem; align-items: baseline; }
.flow-d-label { font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; width: 64px; flex-shrink: 0; }
.flow-d-body { flex: 1; font-size: 11.5px; color: #334155; display: flex; flex-direction: column; gap: 0.2rem; }
.flow-d-wrap { flex-direction: row; flex-wrap: wrap; gap: 0.35rem; }
.flow-d-plus  { color: #16a34a; font-weight: 700; }
.flow-d-minus { color: #b91c1c; font-weight: 700; }
.flow-d-prep  { color: #94a3b8; font-style: italic; }
.flow-d-ref   { font-family: Arial Hebrew, David, serif; color: #64748b; cursor: help; }
.flow-d-parallel { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: #64748b; }
.flow-d-stars { color: #64748b; margin-right: 0.35rem; letter-spacing: 0.5px; }
.flow-d-diff-reason { color: #475569; font-style: italic; }

/* Brief highlight applied to a .daf-word when the sidebar scrolls into it */
.daf-excerpt-flash { background: #fef3c7 !important; transition: background 0.4s ease; border-radius: 3px; box-shadow: 0 0 0 2px #fbbf24; }
`;
