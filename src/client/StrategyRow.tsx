/**
 * One strategy on one entity card. Renders status + run button + collapsible
 * JSON preview of the slice that applies to this card. Used inside each card
 * type's "individual strategies" expansion in EnrichmentPage.
 */
import { Show, type JSX } from 'solid-js';

export interface StrategyRowProps {
  id: string;
  label: string;
  desc?: string;
  data: unknown;
  running: boolean;
  error?: string;
  onRun: (refresh: boolean) => void;
}

export function StrategyRow(props: StrategyRowProps): JSX.Element {
  const hasData = () => props.data !== undefined && props.data !== null;
  // Stop propagation on every interactive control so clicks inside a card's
  // strategy panel don't bubble up to the card's segment-selection handler.
  const stop = (e: MouseEvent) => { e.stopPropagation(); };
  return (
    <div class="strat-row" onClick={stop}>
      <div class="strat-row-head">
        <span class="strat-row-label" title={props.desc}>{props.label}</span>
        <span class="strat-row-status" classList={{
          'strat-row-cached': hasData() && !props.running,
          'strat-row-empty':  !hasData() && !props.running,
          'strat-row-running': props.running,
        }}>
          {props.running ? 'running' : (hasData() ? 'cached' : 'empty')}
        </span>
        <button
          class="enrich-btn strat-row-btn"
          disabled={props.running}
          onClick={(e) => { e.stopPropagation(); props.onRun(hasData()); }}
          title={hasData() ? 'Re-run; busts cache' : 'Run; uses cache if present'}
        >
          {props.running ? '…' : (hasData() ? '↻ re-enrich' : '+ enrich')}
        </button>
        <Show when={props.error}>
          <span class="enrich-btn-err">{props.error}</span>
        </Show>
      </div>
      <Show when={hasData()}>
        <details class="strat-row-preview" onClick={stop}>
          <summary onClick={stop}>preview</summary>
          <pre class="strat-row-json">{JSON.stringify(props.data, null, 2)}</pre>
        </details>
      </Show>
    </div>
  );
}

export const STRATEGY_ROW_CSS = `
.strat-expand { margin-top: 0.4rem; padding: 0.3rem 0.4rem; border-top: 1px dashed #e5e7eb; }
.strat-expand > summary { cursor: pointer; font-size: 10.5px; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; padding: 0.15rem 0; list-style: none; }
.strat-expand > summary::-webkit-details-marker { display: none; }
.strat-expand > summary::before { content: '▸ '; color: #cbd5e1; transition: transform 0.1s; display: inline-block; }
.strat-expand[open] > summary::before { content: '▾ '; }
.strat-expand-body { display: flex; flex-direction: column; gap: 0.3rem; padding-top: 0.3rem; }

.strat-row { padding: 0.25rem 0.35rem; background: #fafafa; border-radius: 3px; border-left: 2px solid #e5e7eb; }
.strat-row-head { display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap; }
.strat-row-label { font-size: 11px; font-weight: 600; color: #1e293b; }
.strat-row-status { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px 5px; border-radius: 8px; font-weight: 700; }
.strat-row-cached { background: #dcfce7; color: #166534; }
.strat-row-empty { background: #f1f5f9; color: #94a3b8; }
.strat-row-running { background: #fef3c7; color: #92400e; }
.strat-row-btn { font-size: 10.5px; padding: 0.15rem 0.45rem; }
.strat-row-preview { margin-top: 0.25rem; }
.strat-row-preview > summary { cursor: pointer; font-size: 10px; color: #64748b; padding: 0.1rem 0; }
.strat-row-json { font-family: ui-monospace, Menlo, monospace; font-size: 10px; color: #334155; background: #fff; padding: 0.35rem 0.45rem; border-radius: 2px; max-height: 240px; overflow: auto; margin: 0.2rem 0 0; white-space: pre-wrap; word-break: break-word; }
`;
