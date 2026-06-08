/**
 * Toggle pill for an enrichment source. Each enrichment is a switch that
 * says "use this in the synthesis." States:
 *
 *   off + not cached: dim, click → fetch the strategy + include + re-synth
 *   off + cached:     medium, click → include + re-synth
 *   on  + cached:     bright green, click → exclude + re-synth
 *   running:          amber, disabled
 *
 * The synthesize step re-fires whenever the include set changes; only the
 * sources currently toggled on contribute to the rewritten prose.
 */
import { Show, type JSX } from 'solid-js';

export interface EnrichmentToggleProps {
  id: string;
  label: string;
  desc?: string;
  cached: boolean;
  included: boolean;
  running: boolean;
  error?: string;
  onClick: () => void;
}

export function EnrichmentToggle(props: EnrichmentToggleProps): JSX.Element {
  return (
    <button
      class="toggle-pill"
      classList={{
        'toggle-on': props.included && !props.running,
        'toggle-off-cached': !props.included && props.cached && !props.running,
        'toggle-off-empty': !props.included && !props.cached && !props.running,
        'toggle-running': props.running,
      }}
      disabled={props.running}
      onClick={props.onClick}
      title={props.desc}
    >
      <span class="toggle-mark">
        {props.running ? '…' : (props.included ? '✓' : (props.cached ? '○' : '+'))}
      </span>
      <span class="toggle-label">{props.label}</span>
      <Show when={props.error}>
        <span class="toggle-err">!</span>
      </Show>
    </button>
  );
}

export const ENRICHMENT_TOGGLE_CSS = `
.toggle-pill { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.7rem; border-radius: 999px; font-size: 12px; cursor: pointer; transition: background 0.12s, border-color 0.12s, color 0.12s; line-height: 1.2; }
.toggle-pill:disabled { cursor: not-allowed; }
.toggle-mark { font-family: ui-monospace, Menlo, monospace; font-size: 11px; min-width: 0.7rem; text-align: center; }
.toggle-label { font-weight: 500; }
.toggle-err { color: #b91c1c; font-weight: 700; margin-left: 0.2rem; }

.toggle-off-empty { background: white; border: 1px solid #cbd5e1; color: #64748b; }
.toggle-off-empty:hover { background: #f1f5f9; color: #1e293b; }
.toggle-off-empty .toggle-mark { color: #94a3b8; }

.toggle-off-cached { background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; }
.toggle-off-cached:hover { background: #e2e8f0; color: #1e293b; }
.toggle-off-cached .toggle-mark { color: #64748b; }

.toggle-on { background: #dcfce7; border: 1px solid #86efac; color: #166534; }
.toggle-on:hover { background: #bbf7d0; color: #14532d; }
.toggle-on .toggle-mark { color: #16a34a; font-weight: 700; }

.toggle-running { background: #fef3c7; border: 1px solid #fcd34d; color: #92400e; }
.toggle-running .toggle-mark { color: #d97706; }
`;
