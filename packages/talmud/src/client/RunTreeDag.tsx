/**
 * RunTreeDag (talmud) — a thin wrapper over the shared @corpus/ui/RunTreeDag.
 *
 * Owns talmud's data: the run-tree (GET /api/run-tree/:t/:p/:id[?instance=…])
 * and, per selected node, its prompt + generation (POST /api/run). The DAG
 * canvas, node header, and provenance render are the shared component; this
 * supplies the per-node DETAIL BODY (generated text + the system/user prompt).
 * Selection + expansion are controlled here so the detail fetch can key on them.
 */

import type { RunResult, RunTree, TreeNode } from '@corpus/ui/RunTree';
import { RunTreeDag as SharedRunTreeDag } from '@corpus/ui/RunTreeDag';
import { createEffect, createResource, createSignal, type JSX, Show } from 'solid-js';
import { lang } from './i18n';

export function RunTreeDag(props: {
  tractate: string;
  page: string;
  pieceId: string;
  instance?: unknown;
}): JSX.Element {
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set([props.pieceId]));
  const [selected, setSelected] = createSignal<string | null>(props.pieceId);
  createEffect(() => {
    const p = props.pieceId;
    setExpanded(new Set([p]));
    setSelected(p);
  });
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const instanceQS = (): string => {
    const inst = props.instance;
    if (!inst || (typeof inst === 'object' && Object.keys(inst as object).length === 0)) return '';
    return `&instance=${encodeURIComponent(JSON.stringify(inst))}`;
  };
  const [tree] = createResource(
    () => `${props.tractate}|${props.page}|${props.pieceId}|${lang()}|${instanceQS()}`,
    async (): Promise<RunTree | null> => {
      const r = await fetch(
        `/api/run-tree/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}/${encodeURIComponent(props.pieceId)}?lang=${lang()}${instanceQS()}`,
      );
      if (!r.ok) return null;
      return (await r.json()) as RunTree;
    },
  );
  const nodeOf = (id: string): TreeNode | undefined => tree()?.nodes[id];

  const [detail] = createResource(
    () => {
      const id = selected();
      const n = id ? nodeOf(id) : null;
      return n && n.kind !== 'source' && n.producer
        ? { id, producer: n.producer, root: id === props.pieceId }
        : null;
    },
    async (sel): Promise<RunResult | null> => {
      const markInput = sel.root ? (props.instance ?? { fields: {} }) : { fields: {} };
      const body =
        sel.producer === 'mark'
          ? { mark_id: sel.id, tractate: props.tractate, page: props.page, lang: lang() }
          : {
              enrichment_id: sel.id,
              tractate: props.tractate,
              page: props.page,
              mark_input: markInput,
              lang: lang(),
            };
      const r = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as { status?: string; result?: RunResult } | RunResult;
      if (j && typeof j === 'object' && 'status' in j)
        return j.status === 'ok' ? (j.result ?? null) : null;
      return j as RunResult;
    },
  );

  // The per-node DETAIL BODY: the generated text + a system/user prompt
  // accordion, from POST /api/run. The shared component renders the header +
  // ProvenanceSection around it.
  const renderDetail = (): JSX.Element => (
    <>
      <Show when={detail.loading}>
        <div style={{ color: '#aaa', 'font-size': '0.78rem' }}>loading run…</div>
      </Show>
      <Show when={detail()}>
        {(r) => (
          <>
            <div
              style={{
                'line-height': 1.5,
                'font-size': '0.82rem',
                color: '#222',
                'white-space': 'pre-wrap',
              }}
            >
              {(r().content ?? '').slice(0, 1600)}
            </div>
            <Show when={r().resolved}>
              {(res) => (
                <details style={{ 'margin-top': '0.7rem' }}>
                  <summary style={{ cursor: 'pointer', 'font-size': '0.74rem', color: '#666' }}>
                    prompt (system + user)
                  </summary>
                  <div style={{ 'font-size': '0.64rem', color: '#999', 'margin-top': '0.3rem' }}>
                    system
                  </div>
                  <pre
                    style={{
                      'white-space': 'pre-wrap',
                      'font-family': 'ui-monospace, Menlo, monospace',
                      'font-size': '11px',
                      margin: 0,
                      background: '#f8f8f8',
                      padding: '0.5rem',
                      'border-radius': '3px',
                      'max-height': '24vh',
                      overflow: 'auto',
                    }}
                  >
                    {res().system_prompt}
                  </pre>
                  <div style={{ 'font-size': '0.64rem', color: '#999', margin: '0.3rem 0 0' }}>
                    user
                  </div>
                  <pre
                    style={{
                      'white-space': 'pre-wrap',
                      'font-family': 'ui-monospace, Menlo, monospace',
                      'font-size': '11px',
                      margin: 0,
                      background: '#f8f8f8',
                      padding: '0.5rem',
                      'border-radius': '3px',
                      'max-height': '24vh',
                      overflow: 'auto',
                    }}
                  >
                    {res().user_prompt}
                  </pre>
                </details>
              )}
            </Show>
          </>
        )}
      </Show>
      <Show when={!detail.loading && !detail()}>
        <div style={{ color: '#bbb', 'font-size': '0.78rem' }}>
          nothing cached for this node on this daf yet.
        </div>
      </Show>
    </>
  );

  return (
    <SharedRunTreeDag
      tree={tree() ?? null}
      loading={tree.loading}
      selected={selected()}
      onSelect={setSelected}
      expanded={expanded()}
      onToggleExpand={toggleExpand}
      renderDetail={renderDetail}
    />
  );
}
