import { GraphView } from '@corpus/ui/GraphView';
import { HOVER_LEAVE_MS } from '@corpus/ui/hoverIntent';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArgumentFlowGraph from '../../src/client/ArgumentFlowGraph';
import { graphLabels } from '../../src/client/graphLabels';
import { setLang } from '../../src/client/i18n';
import { edges, graphs, groups } from '../fixtures/argument-graph';

beforeEach(() => setLang('en'));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const node = (root: HTMLElement, id: string) =>
  Array.from(root.querySelectorAll<HTMLElement>('[data-graph-node]')).find(
    (n) => n.dataset.graphNode === id,
  )!;

describe('hovering the argument map', () => {
  it('reports the node under the pointer and clears after it leaves', () => {
    vi.useFakeTimers();
    const hover = vi.fn();
    const { container } = render(() => (
      <GraphView groups={groups} edges={edges} labels={graphLabels()} onHover={hover} />
    ));
    fireEvent.pointerEnter(node(container, groups[0].id), { pointerType: 'mouse' });
    expect(hover).toHaveBeenLastCalledWith(expect.objectContaining({ id: groups[0].id }));
    fireEvent.pointerLeave(node(container, groups[0].id), { pointerType: 'mouse' });
    fireEvent.pointerEnter(node(container, groups[1].id), { pointerType: 'mouse' });
    expect(hover).not.toHaveBeenCalledWith(null);
    fireEvent.pointerLeave(node(container, groups[1].id), { pointerType: 'mouse' });
    vi.advanceTimersByTime(HOVER_LEAVE_MS + 10);
    expect(hover).toHaveBeenLastCalledWith(null);
  });

  it('never hovers on touch, where a tap selects instead', () => {
    const hover = vi.fn();
    const { container } = render(() => (
      <GraphView groups={groups} edges={edges} labels={graphLabels()} onHover={hover} />
    ));
    fireEvent.pointerEnter(node(container, groups[0].id), { pointerType: 'touch' });
    expect(hover).not.toHaveBeenCalled();
  });

  it('carries a hovered statement with its text range', () => {
    const section = graphs.findIndex((g) => g.spine.nodes.length > 0);
    const statement = graphs[section].spine.nodes[0];
    const hover = vi.fn();
    const { container } = render(() => (
      <ArgumentFlowGraph
        nodes={graphs.map((g, index) => ({
          index,
          title: g.title,
          statements: g.spine.nodes,
          statementLinks: g.spine.links,
        }))}
        connections={[]}
        activeIndex={section}
        onSelect={() => {}}
        onHover={hover}
      />
    ));
    fireEvent.pointerEnter(node(container, `section:${section}:statement:${statement.id}`), {
      pointerType: 'mouse',
    });
    const target = hover.mock.lastCall?.[0];
    expect(target.section).toBe(section);
    expect(target.statement.id).toBe(statement.id);
    expect(typeof target.statement.startSegIdx).toBe('number');
    fireEvent.pointerEnter(node(container, `section:${section}`), { pointerType: 'mouse' });
    expect(hover).toHaveBeenLastCalledWith({ section, statement: undefined });
  });
});
