/**
 * Inline "based on: rich-rabbi · per-section" footnote that follows a prose
 * paragraph. Names the strategies whose output produced the paragraph (or
 * the structured field) above it, so the reader can audit each rendered
 * sentence against its source enrichment.
 */
import { For, Show, type JSX } from 'solid-js';

export function ProvenanceBadge(props: {
  strategies: string[];
  /** Optional first-pass label (e.g. "stage-1 halacha"). Shown when no
   *  enrichment strategy is the source — the field came from the identify
   *  pass. */
  firstPass?: string;
}): JSX.Element {
  const list = () => props.strategies.filter((s, i, a) => a.indexOf(s) === i);
  return (
    <Show when={list().length > 0 || props.firstPass}>
      <span class="prov">
        <span class="prov-label">based on</span>
        <Show when={props.firstPass && list().length === 0}>
          <span class="prov-strat prov-strat-stage1">{props.firstPass}</span>
        </Show>
        <For each={list()}>{(s, i) => (
          <>
            <Show when={i() > 0}><span class="prov-sep">·</span></Show>
            <span class="prov-strat">{s}</span>
          </>
        )}</For>
      </span>
    </Show>
  );
}

export const PROVENANCE_CSS = `
.prov { display: inline-flex; align-items: baseline; gap: 0.3rem; flex-wrap: wrap; margin-top: 0.2rem; padding-top: 0.15rem; font-size: 9.5px; color: #94a3b8; line-height: 1.3; }
.prov-label { text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; color: #cbd5e1; }
.prov-strat { font-family: ui-monospace, Menlo, monospace; font-size: 9.5px; color: #6366f1; padding: 0 4px; background: #eef2ff; border-radius: 2px; }
.prov-strat-stage1 { color: #64748b; background: #f1f5f9; }
.prov-sep { color: #cbd5e1; }
`;
