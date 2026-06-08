// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { createSignal } from 'solid-js';
import { setLang, t } from '../../src/client/i18n';

describe('render harness', () => {
  it('renders a Solid component into the DOM', () => {
    const { getByText } = render(() => <div>hello daf</div>);
    expect(getByText('hello daf')).toBeTruthy();
  });

  it('reacts to a signal change', () => {
    const [n, setN] = createSignal(0);
    const { getByTestId } = render(() => <span data-testid="n">{n()}</span>);
    expect(getByTestId('n').textContent).toBe('0');
    setN(1);
    expect(getByTestId('n').textContent).toBe('1');
  });

  it('t() + setLang drive bilingual text and document dir', () => {
    setLang('en');
    const { container } = render(() => <p>{t('app.title')}</p>);
    expect(container.querySelector('p')!.textContent).toBe('Talmud');
    setLang('he');
    expect(container.querySelector('p')!.textContent).toBe('תלמוד');
    expect(document.documentElement.dir).toBe('rtl');
    setLang('en'); // reset for other suites
  });
});
