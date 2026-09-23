import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArgumentPassageDialog, savedPageGraph } from '../../src/client/ArgumentPassageDialog';
import { graphLabels } from '../../src/client/graphLabels';
import { setLang } from '../../src/client/i18n';
import saved from '../fixtures/berakhot-passage.json';

const pageData = saved.pages[0] as Parameters<typeof savedPageGraph>[1];
const graph = savedPageGraph('2a', pageData);

beforeEach(() => {
  setLang('en');
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
  HTMLElement.prototype.scrollIntoView = vi.fn();
  // Replay saved API data. No generated or invented Talmud content.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('statement-spine'))
        return new Response(JSON.stringify(saved.pages.find((p) => url.endsWith(p.page))));
      if (url.includes('spine-view'))
        return new Response(JSON.stringify({ dapim: saved.boundaries }));
      return new Response(JSON.stringify({ derived: [] }));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

describe('passage dialog loading and selection', () => {
  it('keeps current-page source buttons after loading and forwards their selection', async () => {
    const [expanded, setExpanded] = createSignal(false);
    const select = vi.fn();
    const source = saved.firstSectionExits[0];
    render(() => (
      <ArgumentPassageDialog
        tractate="Berakhot"
        page="2a"
        labels={graphLabels()}
        groups={graph.groups.map((g, i) =>
          i
            ? g
            : {
                ...g,
                actions: [{ id: `${g.id}:exit:0`, label: source.ref }],
                actionsLabel: source.ref,
                actionsExpanded: expanded(),
              },
        )}
        edges={graph.edges}
        onClose={() => {}}
        onToggleActions={() => setExpanded((e) => !e)}
        onSelect={select}
      />
    ));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue to 2b' }).hasAttribute('disabled')).toBe(
        false,
      ),
    );
    const statement = saved.pages[0].sections[0].spine.nodes[0];
    const card = document.querySelector(
      `[data-graph-node="2a/section:0:statement:${statement.id}"]`,
    )!;
    expect(card.querySelector('.ui-graph-label')?.textContent).toBe(statement.speaker);
    expect(card.querySelector('.ui-graph-summary')?.textContent).toBe(statement.summary);
    fireEvent.click(screen.getByRole('button', { name: source.ref }));
    await waitFor(() => expect(expanded()).toBe(true));
    const action = document.querySelector('[data-graph-node="2a/section:0:exit:0"]');
    expect(action).toBeTruthy();
    fireEvent.click(action!);
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: 'section:0:exit:0' }));
  });

  it('adds the next daf without selecting the same section index in the original daf', async () => {
    const select = vi.fn();
    render(() => (
      <ArgumentPassageDialog
        tractate="Berakhot"
        page="2a"
        groups={graph.groups}
        edges={graph.edges}
        labels={graphLabels()}
        onClose={() => {}}
        onSelect={select}
      />
    ));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue to 2b' }).hasAttribute('disabled')).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue to 2b' }));
    await waitFor(() =>
      expect(document.querySelector('[data-graph-node="2b/section:0"]')).toBeTruthy(),
    );
    fireEvent.click(document.querySelector('[data-graph-node="2b/section:0"]')!);
    expect(select).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.ui-graph-node.header')).toHaveLength(12);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
