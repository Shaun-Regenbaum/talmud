// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLang, t } from '../../src/client/i18n';
import {
  ACCENTS,
  HebrewProse,
  kindLabelKey,
  Panel,
  SectionCard,
} from '../../src/client/sidebar/primitives';

beforeEach(() => setLang('en'));
afterEach(() => setLang('en'));

describe('Section', () => {
  it('renders the label via the catalog and the canonical box styling', () => {
    const { container } = render(() => <SectionCard label="aggadata.background" text="hello" />);
    const box = container.querySelector('div')!;
    expect(box.style.getPropertyValue('border-radius')).toBe('6px');
    expect(box.style.getPropertyValue('padding')).toBe('0.7rem 0.85rem');
    expect(box.style.getPropertyValue('margin-top')).toBe('0.7rem');
    // label is the translated catalog value, not the raw key
    expect(box.textContent).toContain(t('aggadata.background'));
    expect(box.textContent).not.toContain('aggadata.background');
  });

  it('defaults to the tight label gap and honours loose', () => {
    const tight = render(() => <SectionCard label="aggadata.background" text="x" />);
    const loose = render(() => (
      <SectionCard label="aggadata.background" spacing="loose" text="x" />
    ));
    // box = first div in the container; label = box's first child div.
    const labelOf = (c: HTMLElement) => c.firstElementChild!.firstElementChild as HTMLElement;
    expect(labelOf(tight.container).style.getPropertyValue('margin-bottom')).toBe('0.4rem');
    expect(labelOf(loose.container).style.getPropertyValue('margin-bottom')).toBe('0.5rem');
  });

  it('renders prose body for `text` and arbitrary children otherwise', () => {
    const prose = render(() => <SectionCard label="aggadata.background" text="bodytext" />);
    const proseBody = prose.container.firstElementChild!.lastElementChild as HTMLElement;
    expect(proseBody.style.getPropertyValue('font-size')).toBe('0.88rem');
    expect(proseBody.textContent).toContain('bodytext');

    const custom = render(() => (
      <SectionCard label="aggadata.parallels">
        <span data-testid="custom">x</span>
      </SectionCard>
    ));
    expect(custom.getByTestId('custom')).toBeTruthy();
  });
});

describe('HebrewProse', () => {
  it('is RTL Hebrew in the Vilna serif by default', () => {
    const { container } = render(() => <HebrewProse text="שלום" />);
    const p = container.querySelector('p')!;
    expect(p.getAttribute('dir')).toBe('rtl');
    expect(p.getAttribute('lang')).toBe('he');
    expect(p.style.getPropertyValue('font-family')).toContain('Mekorot Vilna');
  });

  it('widens the font fallback for tanakh cantillation', () => {
    const { container } = render(() => <HebrewProse text="בְּרֵאשִׁית" variant="tanakh" />);
    const fam = container.querySelector('p')!.style.getPropertyValue('font-family');
    expect(fam).toContain('Cardo');
    expect(fam).toContain('SBL Hebrew');
  });

  it('renders children verbatim when no text is given', () => {
    const { getByText } = render(() => <HebrewProse>{'נוסח'}</HebrewProse>);
    expect(getByText('נוסח')).toBeTruthy();
  });
});

describe('Panel', () => {
  it('default: title is the accent h3, Hebrew twin is an RTL subtitle', () => {
    const { container } = render(() => (
      <Panel accent={ACCENTS.aggadata} title="The Story" titleHe="הסיפור">
        <div data-testid="body">body</div>
      </Panel>
    ));
    const h3 = container.querySelector('h3')!;
    expect(h3.textContent).toBe('The Story');
    expect(h3.getAttribute('dir')).toBeNull(); // LTR primary
    expect(h3.style.getPropertyValue('color')).toBeTruthy();
    const sub = container.querySelector('p')!;
    expect(sub.getAttribute('dir')).toBe('rtl');
    expect(sub.textContent).toContain('הסיפור');
    expect(container.querySelector('[data-testid="body"]')).toBeTruthy();
  });

  it('rabbi flip leads with the Latin name in en and the Hebrew name in he', () => {
    const en = render(() => (
      <Panel accent={ACCENTS.rabbi} flip="rabbi" title="R. Yochanan" titleHe="ר׳ יוחנן" />
    ));
    expect(en.container.querySelector('h3')!.textContent).toBe('R. Yochanan');
    expect(en.container.querySelector('h3')!.getAttribute('dir')).toBeNull();

    setLang('he');
    const he = render(() => (
      <Panel accent={ACCENTS.rabbi} flip="rabbi" title="R. Yochanan" titleHe="ר׳ יוחנן" />
    ));
    const h3 = he.container.querySelector('h3')!;
    expect(h3.textContent).toBe('ר׳ יוחנן');
    expect(h3.getAttribute('dir')).toBe('rtl');
    // secondary line is now the Latin name, not Hebrew
    expect(he.container.querySelector('p')!.getAttribute('dir')).toBeNull();
  });

  it('renders an optional meta slot', () => {
    const { getByTestId } = render(() => (
      <Panel accent={ACCENTS.rabbi} title="x" meta={<span data-testid="meta">m</span>} />
    ));
    expect(getByTestId('meta')).toBeTruthy();
  });
});

describe('SectionCard collapse', () => {
  it('omitting `collapsed` keeps the body always rendered (no toggle)', () => {
    const { container } = render(() => (
      <SectionCard label="aggadata.background" text="body-text" />
    ));
    expect(container.textContent).toContain('body-text');
    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  it('`collapsed` hides the body until the label is clicked', () => {
    const { container } = render(() => (
      <SectionCard label="aggadata.background" text="hidden-body" collapsed />
    ));
    expect(container.textContent).not.toContain('hidden-body');
    const toggle = container.querySelector('[role="button"]') as HTMLElement;
    expect(toggle).toBeTruthy();
    toggle.click();
    expect(container.textContent).toContain('hidden-body');
  });

  it('`collapsed={false}` starts open but stays toggleable', () => {
    const { container } = render(() => (
      <SectionCard label="aggadata.background" text="shown-body" collapsed={false} />
    ));
    expect(container.textContent).toContain('shown-body');
    const toggle = container.querySelector('[role="button"]') as HTMLElement;
    toggle.click();
    expect(container.textContent).not.toContain('shown-body');
  });
});

describe('kindLabelKey / ACCENTS', () => {
  it('maps every kind to a real catalog key', () => {
    for (const kind of Object.keys(ACCENTS) as Array<keyof typeof ACCENTS>) {
      const key = kindLabelKey(kind);
      // t() falls back to the key itself for unknown keys; a real key resolves
      // to something different.
      expect(t(key)).not.toBe(key);
    }
  });
});
