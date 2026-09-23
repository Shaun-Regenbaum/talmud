// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import type { IdentifiedRabbi } from '../../src/client/dafContext';
import { RabbiText, resolveRabbi } from '../../src/client/rabbiLinks';

// The house rule puts a rabbi's Hebrew name first ("רב אחא (Rav Acha)"), so the
// Hebrew name has to stay a clickable link, even though the list stores it
// with nikud and the prose carries none.
const RAV_ACHA = [
  { name: 'Rav Acha', nameHe: 'רַב אַחָא', mentions: [] } as unknown as IdentifiedRabbi,
];

describe('rabbi links on Hebrew names', () => {
  it('links the Hebrew name and resolves it to the rabbi', () => {
    const pushed: string[] = [];
    const { container } = render(() => (
      <RabbiText
        text="רב אחא (Rav Acha) rules, and later רב אחא agrees."
        rabbis={RAV_ACHA}
        onPushRabbi={(n) => pushed.push(n)}
      />
    ));
    const links = [...container.querySelectorAll('[role="link"]')].map((l) => l.textContent);
    expect(links).toEqual(['רב אחא', 'Rav Acha', 'רב אחא']);
    (container.querySelector('[role="link"]') as HTMLElement).click();
    expect(pushed).toEqual(['Rav Acha']);
    expect(resolveRabbi('רב אחא', RAV_ACHA)?.name).toBe('Rav Acha');
  });
});
