import { GraphView } from '@corpus/ui/GraphView';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { graphLabels } from '../../src/client/graphLabels';
import { setLang } from '../../src/client/i18n';
import SpineFlowGraph from '../../src/client/SpineFlowGraph';
import { edges, graphs, groups } from '../fixtures/argument-graph';

beforeEach(() => {
  setLang('en');
  // jsdom has no top-layer dialog implementation. The browser check covers it.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value() {
        this.open = false;
      },
    },
  });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

describe('shared full-screen graph', () => {
  it('preserves node selection across layouts and restores focus and scrolling on close', () => {
    const select = vi.fn();
    render(() => (
      <GraphView groups={groups} edges={edges} labels={graphLabels()} onSelect={select} />
    ));
    const open = screen.getByRole('button', { name: 'Full-screen map' });
    open.focus();
    fireEvent.click(open);
    const dialog = screen.getByRole('dialog');
    expect(document.body.style.overflow).toBe('hidden');
    expect(dialog.querySelector('.horizontal')).toBeTruthy();
    const id = groups[0].children![0].id;
    fireEvent.click(dialog.querySelector(`[data-graph-node="${id}"]`)!);
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ id }));
    expect(dialog.querySelector('.ui-graph-detail')?.textContent).toContain(
      groups[0].children![0].detail,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stacked' }));
    expect(dialog.querySelector('.horizontal')).toBeNull();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(open);
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps keyboard focus on a node while its controlled selection changes', () => {
    const [selected, setSelected] = createSignal<string | null>(null);
    const { container } = render(() => (
      <GraphView
        groups={groups.map((g) => ({
          ...g,
          children: g.children?.map((n) => ({ ...n, selected: n.id === selected() })),
        }))}
        edges={edges}
        labels={graphLabels()}
        onSelect={(n) => setSelected(n.id)}
      />
    ));
    const node = container.querySelector(
      `[data-graph-node="${groups[0].children![0].id}"]`,
    ) as HTMLElement;
    node.focus();
    fireEvent.click(node);
    expect(node.isConnected).toBe(true);
    expect(document.activeElement).toBe(node);
  });

  it('stops modal keys from reaching reader navigation and drawer shortcuts', () => {
    const readerKey = vi.fn();
    window.addEventListener('keydown', readerKey);
    try {
      render(() => <GraphView groups={groups} edges={edges} labels={graphLabels()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Full-screen map' }));
      const close = screen.getByRole('button', { name: 'Close map' });
      fireEvent.keyDown(close, { key: 'Escape' });
      fireEvent.keyDown(close, { key: 'ArrowRight' });
      expect(readerKey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', readerKey);
    }
  });

  it('selects a tractate statement without toggling its already open section', () => {
    const section = vi.fn(),
      statement = vi.fn();
    const dapim = [
      {
        page: '2a',
        sections: graphs.map((g, index) => ({
          index,
          title: g.title,
          rabbis: [],
          statements: g.spine.nodes,
          statementLinks: g.spine.links,
        })),
        flow: [],
        cross: [],
      },
    ];
    render(() => (
      <SpineFlowGraph
        dapim={dapim}
        activeKey="2a#0"
        onSelectSection={section}
        onSelectStatement={statement}
      />
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Full-screen map' }));
    const id = graphs[0].spine.nodes[0].id;
    fireEvent.click(
      screen.getByRole('dialog').querySelector(`[data-graph-node="2a#0:statement:${id}"]`)!,
    );
    expect(section).not.toHaveBeenCalled();
    expect(statement).toHaveBeenCalledWith(id);
  });

  it('keeps arrowheads unique and fixed size when inline and full-screen maps coexist', () => {
    render(() => <GraphView groups={groups} edges={edges} labels={graphLabels()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Full-screen map' }));
    const markers = [...document.querySelectorAll('marker')];
    expect(markers.length).toBeGreaterThan(0);
    expect(new Set(markers.map((m) => m.id)).size).toBe(markers.length);
    expect(markers.every((m) => m.getAttribute('markerUnits') === 'userSpaceOnUse')).toBe(true);
  });
});
