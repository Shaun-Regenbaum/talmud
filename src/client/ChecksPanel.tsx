/**
 * Dev-panel surfacing for the post-LLM check layer. Calls
 * GET /api/studio/checks/:tractate/:page — which re-runs each daf-level mark's
 * declared checks against its ALREADY-CACHED (anchored) output, no LLM — and
 * lists what the soft/observe-only checks (anchor-verbatim, partition-clean, …)
 * flag on the daf in view. This is the observation surface for deciding whether
 * a soft check is trustworthy enough to promote to a hard, cache-gating one.
 *
 * Mounted in DevModeShelf (dev mode only), so the read only happens for dev
 * users and never on a reader's page load.
 */

import { createResource, For, Show, type JSX } from 'solid-js';

interface CheckIssue { kind: string; severity?: string; match?: string; index?: number; detail?: string }
interface MarkResult { mark_id: string; cached: boolean; issues: CheckIssue[] }
interface ChecksResponse { tractate: string; page: string; total_issues: number; results: MarkResult[] }

export default function ChecksPanel(props: { tractate: string; page: string }): JSX.Element {
  const [data] = createResource(
    () => `${props.tractate}|${props.page}`,
    async (): Promise<ChecksResponse | null> => {
      const r = await fetch(`/api/studio/checks/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}`);
      if (!r.ok) return null;
      return (await r.json()) as ChecksResponse;
    },
  );
  const flagged = () => (data()?.results ?? []).filter((m) => m.issues.length > 0);

  return (
    <Show when={data()}>
      <div style={{
        border: '1px solid #eee', 'border-radius': '4px', background: '#fff',
        padding: '0.4rem 0.55rem', 'font-size': '0.78rem', 'line-height': 1.45,
      }}>
        <div style={{
          'font-size': '0.65rem', 'text-transform': 'uppercase', 'letter-spacing': '0.06em',
          color: '#888', 'margin-bottom': '0.3rem', display: 'flex', 'justify-content': 'space-between',
        }}>
          <span>Checks (soft)</span>
          <span style={{ color: data()!.total_issues > 0 ? '#a16207' : '#15803d' }}>
            {data()!.total_issues} flag{data()!.total_issues === 1 ? '' : 's'}
          </span>
        </div>

        <Show when={flagged().length === 0}>
          <div style={{ color: '#15803d', 'font-size': '0.72rem' }}>· all clear on this daf</div>
        </Show>

        <For each={flagged()}>{(m) => (
          <div style={{ 'margin-bottom': '0.35rem' }}>
            <div style={{ 'font-weight': 600, color: '#444', 'margin-bottom': '0.1rem' }}>
              {m.mark_id} <span style={{ color: '#a16207', 'font-weight': 400 }}>· {m.issues.length}</span>
            </div>
            <For each={m.issues.slice(0, 12)}>{(i) => (
              <div style={{ display: 'flex', gap: '0.4rem', padding: '0.1rem 0', color: '#666', 'align-items': 'baseline' }}>
                <span style={{
                  'flex-shrink': 0, 'font-size': '0.62rem', 'border-radius': '3px', padding: '0 0.3rem',
                  background: i.severity === 'hard' ? '#fee2e2' : '#fef3c7',
                  color: i.severity === 'hard' ? '#b91c1c' : '#a16207',
                }}>{i.kind}</span>
                <Show when={typeof i.index === 'number' && i.index >= 0}>
                  <span style={{ 'flex-shrink': 0, color: '#999', 'font-size': '0.68rem' }}>seg {i.index}</span>
                </Show>
                <Show when={i.match}>
                  <span dir="rtl" style={{ 'font-size': '0.72rem', color: '#333', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                    {i.match!.slice(0, 48)}
                  </span>
                </Show>
              </div>
            )}</For>
            <Show when={m.issues.length > 12}>
              <div style={{ color: '#999', 'font-size': '0.68rem' }}>+{m.issues.length - 12} more</div>
            </Show>
          </div>
        )}</For>
      </div>
    </Show>
  );
}
