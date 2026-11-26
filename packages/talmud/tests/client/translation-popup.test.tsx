// @vitest-environment jsdom

import { dismissAiStatus } from '@corpus/ui/aiStatus';
import { render, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLang, t } from '../../src/client/i18n';
import { TranslationPopup } from '../../src/client/TranslationPopup';

const KEY_URL = 'https://openrouter.ai/settings/keys';

function popup(word: string) {
  return render(() => (
    <TranslationPopup
      word={word}
      tractate="Berakhot"
      page="2a"
      anchor={{ top: 200, left: 100, bottom: 220, right: 160 }}
      onClose={() => {}}
    />
  ));
}

afterEach(() => {
  setLang('en');
  dismissAiStatus();
  vi.unstubAllGlobals();
});

describe('translation popup errors', () => {
  it('does not show an upstream key URL that the server used to return', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: 'All translation models failed',
              attempts: [
                `deepseek-v4-flash: Key limit exceeded (weekly limit). Manage it using ${KEY_URL}`,
              ],
            }),
            { status: 502, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    const { container } = popup('פילפול');
    await waitFor(() => {
      expect(container.textContent).toContain(t('translation.unavailable'));
    });
    expect(container.textContent).not.toContain('openrouter.ai');
    expect(container.textContent).not.toContain('Key limit');
    expect(container.textContent).not.toContain('attempts');
  });

  it('shows the Hebrew catalog line for the same failure', async () => {
    setLang('he');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: `Key limit exceeded ${KEY_URL}`,
              aiUnavailable: true,
              reason: 'key-limit',
            }),
            { status: 503, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    const { container } = popup('סברא');
    await waitFor(() => {
      expect(container.textContent).toContain('התרגום אינו זמין כרגע');
    });
    expect(container.textContent).not.toContain(KEY_URL);
  });

  it('still shows a translation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ translation: 'dialectic' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const { container } = popup('פלפולא');
    await waitFor(() => {
      expect(container.textContent).toContain('dialectic');
    });
  });
});
