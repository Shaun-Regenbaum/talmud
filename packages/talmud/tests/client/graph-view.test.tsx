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
  HTMLElement.prototype.scrollIntoView = vi.fn();
  SVGElement.prototype.scrollIntoView = vi.fn();
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
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  Reflect.deleteProperty(SVGElement.prototype, 'scrollIntoView');
});

describe('shared full-screen graph', () => {
  it('clears inline inspection before opening a separate full-screen map', () => {
    const connection = vi.fn();
    const { container } = render(() => (
      <GraphView
        groups={groups}
        edges={edges}
        labels={graphLabels()}
        onSelectConnection={connection}
      />
    ));
    const line = container.querySelector(`[data-graph-edge="${edges[0].id}"]`)!;
    fireEvent.click(line);
    fireEvent.click(screen.getByRole('button', { name: 'Full-screen map' }));
    expect(line.getAttribute('aria-pressed')).toBe('false');
    expect(connection).toHaveBeenLastCalledWith(null);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog.querySelector(`[data-graph-edge="${edges[0].id}"]`)!);
    expect(connection).toHaveBeenLastCalledWith(edges[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Close map' }));
    expect(connection).toHaveBeenLastCalledWith(null);
    expect(container.querySelector('.ui-graph-connection-detail')).toBeNull();
  });

  it('pins a real connection, names both endpoints, and clears it without selecting a statement', () => {
    const select = vi.fn(),
      connection = vi.fn();
    const { container } = render(() => (
      <GraphView
        groups={groups}
        edges={edges}
        labels={graphLabels()}
        onSelect={select}
        onSelectConnection={connection}
      />
    ));
    const edge = edges[0];
    const line = container.querySelector(`[data-graph-edge="${edge.id}"]`)!;
    fireEvent.click(line);
    fireEvent.pointerLeave(line);
    fireEvent.blur(line);
    expect(line.getAttribute('aria-pressed')).toBe('true');
    expect(line.querySelector('.ui-graph-edge-line')?.getAttribute('stroke-width')).toBe('2.5');
    expect(container.querySelectorAll('.connection-endpoint')).toHaveLength(2);
    const detail = container.querySelector('.ui-graph-connection-detail')!;
    for (const id of [edge.from, edge.to]) {
      const node = groups.flatMap((g) => g.children ?? []).find((n) => n.id === id)!;
      expect(detail.textContent).toContain(node.label);
      expect(line.getAttribute('aria-label')).toContain(node.label);
    }
    expect(detail.textContent).toContain(edge.label);
    expect(connection).toHaveBeenLastCalledWith(edge);
    fireEvent.click(detail.querySelector('.ui-graph-connection-endpoint')!);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(line.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Clear connection selection' }));
    expect(container.querySelector('.ui-graph-connection-detail')).toBeNull();
    expect(container.querySelectorAll('.connection-endpoint')).toHaveLength(0);
    expect(line.getAttribute('aria-pressed')).toBe('false');
    expect(connection).toHaveBeenLastCalledWith(null);
  });

  it('keeps a selected connection across layouts but clears it when its endpoints are hidden', () => {
    const connection = vi.fn();
    render(() => (
      <GraphView
        groups={groups}
        edges={edges}
        labels={graphLabels()}
        onSelectConnection={connection}
      />
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Full-screen map' }));
    const dialog = screen.getByRole('dialog');
    const line = dialog.querySelector(`[data-graph-edge="${edges[0].id}"]`)!;
    fireEvent.keyDown(line, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Stacked' }));
    expect(line.isConnected).toBe(true);
    expect(line.getAttribute('aria-pressed')).toBe('true');
    expect(dialog.querySelectorAll('.connection-endpoint')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Sections only' }));
    expect(dialog.querySelector('.ui-graph-connection-detail')).toBeNull();
    expect(connection).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Show statements' }));
    expect(dialog.querySelector('[aria-pressed="true"][data-graph-edge]')).toBeNull();
  });

  it('updates a selected link from current props and discards it when it is removed', () => {
    const [current, setCurrent] = createSignal(edges);
    const [currentGroups, setCurrentGroups] = createSignal(groups);
    const { container } = render(() => (
      <GraphView groups={currentGroups()} edges={current()} labels={graphLabels()} />
    ));
    const line = container.querySelector(`[data-graph-edge="${edges[0].id}"]`)!;
    fireEvent.focus(line);
    fireEvent.keyDown(line, { key: ' ' });
    setCurrent(edges.map((edge) => ({ ...edge })));
    expect(line.isConnected).toBe(true);
    expect(line.getAttribute('aria-pressed')).toBe('true');
    const annotated = {
      ...edges[0],
      kindLabel: edges[0].label,
      label: groups.flatMap((g) => g.children ?? []).find((n) => n.id === edges[0].from)!.label,
    };
    setCurrent([annotated, ...edges.slice(1)]);
    expect(line.getAttribute('aria-label')).toContain(annotated.kindLabel);
    expect(container.querySelector('.ui-graph-connection-detail')?.textContent).toContain(
      annotated.label,
    );
    setCurrent(edges.slice(1));
    expect(container.querySelector('.ui-graph-connection-detail')).toBeNull();
    expect(
      [...container.querySelectorAll<HTMLElement>('.ui-graph-node-wrap')].every(
        (node) => node.style.opacity === '1',
      ),
    ).toBe(true);
    setCurrent(edges);
    expect(container.querySelector('.ui-graph-connection-detail')).toBeNull();
    fireEvent.click(container.querySelector(`[data-graph-edge="${edges[0].id}"]`)!);
    setCurrentGroups([]);
    setCurrentGroups(groups);
    expect(container.querySelector('.ui-graph-connection-detail')).toBeNull();
  });

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
