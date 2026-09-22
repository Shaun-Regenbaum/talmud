import { createEffect, createSignal, For, type JSX, onMount, Show } from 'solid-js';
import { Button } from '../Button';
import { Drawer } from '../Drawer';
import { LangToggle } from '../LangToggle';
import { PageNavigation } from '../PageNavigation';
import { Pill, PillRow } from '../Pill';
import { Prose } from '../Prose';
import { ReaderHeader } from '../ReaderHeader';
import { Select } from '../Select';
import { ToolbarMenu } from '../ToolbarMenu';
import { ArgumentExample } from './ArgumentExample';
import { DataExamples } from './DataExamples';
import { type GalleryKey, type GalleryLang, t } from './i18n';

const sections = [
  'headers',
  'buttons',
  'navigation',
  'panels',
  'text',
  'theme',
  'argumentMaps',
  'icons',
  'charts',
  'maps',
  'graphs',
  'overview',
  'studyControls',
  'missing',
] as const;
const colors: { token: string; label: GalleryKey }[] = [
  { token: '--bg', label: 'paper' },
  { token: '--surface', label: 'surface' },
  { token: '--surface-sunk', label: 'sunk' },
  { token: '--fg', label: 'ink' },
  { token: '--muted', label: 'muted' },
  { token: '--line', label: 'line' },
  { token: '--accent', label: 'accent' },
  { token: '--accent-strong', label: 'strong' },
];

export function Gallery(): JSX.Element {
  const params = new URLSearchParams(window.location.search);
  const embedded = params.get('embed') === '1';
  const [mobile, setMobile] = createSignal(!embedded && params.get('view') === 'mobile');
  const [phoneWidth, setPhoneWidth] = createSignal(390);
  const [lang, setLang] = createSignal<GalleryLang>(params.get('lang') === 'he' ? 'he' : 'en');
  const setView = (phone: boolean) => {
    setMobile(phone);
    const url = new URL(window.location.href);
    if (phone) url.searchParams.set('view', 'mobile');
    else url.searchParams.delete('view');
    window.history.replaceState(null, '', url);
  };
  const [reader, setReader] = createSignal<'talmud' | 'tanach'>('talmud');
  const [section, setSection] = createSignal(0);
  const [pressed, setPressed] = createSignal(false);
  const [drawer, setDrawer] = createSignal(false);
  const [values, setValues] = createSignal<Record<string, string>>({});
  const label = (key: GalleryKey) => t(key, lang());
  let returnFocus: HTMLElement | null = null;
  const openDrawer = () => {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDrawer(true);
  };
  const closeDrawer = () => {
    setDrawer(false);
    returnFocus?.focus();
  };
  const go = (index: number) => {
    setSection(index);
    document.getElementById(sections[index])?.scrollIntoView({ block: 'start' });
  };
  createEffect(() => {
    document.documentElement.lang = lang();
    document.documentElement.dir = lang() === 'he' ? 'rtl' : 'ltr';
  });
  onMount(() => {
    const css = getComputedStyle(document.documentElement);
    setValues(
      Object.fromEntries(colors.map(({ token }) => [token, css.getPropertyValue(token).trim()])),
    );
  });

  const source = (name: string) => (
    <code class="gallery-source">
      {label('source')} · @corpus/ui/{name}
    </code>
  );
  const heading = (key: (typeof sections)[number], hint: GalleryKey, number: string) => (
    <div class="gallery-section-heading">
      <span class="gallery-number">{number}</span>
      <div>
        <h2>{label(key)}</h2>
        <p>{label(hint)}</p>
      </div>
    </div>
  );
  const navigation = () => (
    <PageNavigation
      label={label('section')}
      previousLabel={label('previous')}
      nextLabel={label('next')}
      previousDisabled={section() === 0}
      nextDisabled={section() === sections.length - 1}
      onPrevious={() => go(section() - 1)}
      onNext={() => go(section() + 1)}
    >
      <span class="ui-page-number">{section() + 1}</span>
    </PageNavigation>
  );

  return (
    <div class="gallery" classList={{ 'is-embedded': embedded }} id="top">
      <header class="gallery-masthead">
        <a href="#top" class="gallery-wordmark">
          Talmud / Tanach
        </a>
        <span>@corpus/ui</span>
        <Show when={!embedded}>
          <div class="gallery-view-switch">
            <Button active={!mobile()} onClick={() => setView(false)}>
              {label('desktop')}
            </Button>
            <Button active={mobile()} onClick={() => setView(true)}>
              {label('mobile')}
            </Button>
          </div>
        </Show>
        <LangToggle lang={lang()} onChange={setLang} />
      </header>
      <Show
        when={mobile()}
        fallback={
          <div class="gallery-layout">
            <nav class="gallery-index" aria-label={label('contents')}>
              <p>{label('contents')}</p>
              <For each={sections}>
                {(key, index) => (
                  <a href={`#${key}`} onClick={() => setSection(index())}>
                    <span>{String(index() + 1).padStart(2, '0')}</span>
                    {label(key)}
                  </a>
                )}
              </For>
              <small>{label('libraryNote')}</small>
            </nav>
            <main>
              <div class="gallery-intro">
                <h1>{label('title')}</h1>
                <p>{label('intro')}</p>
              </div>
              <section id="headers">
                {heading('headers', 'headersHint', '01')}
                <div class="gallery-row gallery-reader-choice">
                  <Pill active={reader() === 'talmud'} onClick={() => setReader('talmud')}>
                    {label('talmud')}
                  </Pill>
                  <Pill active={reader() === 'tanach'} onClick={() => setReader('tanach')}>
                    {label('tanach')}
                  </Pill>
                </div>
                <div class="gallery-header-preview">
                  <ReaderHeader
                    title={label(reader())}
                    hint={label(sections[section()])}
                    utilities={
                      <>
                        <ToolbarMenu label={label('more')}>
                          <Button onClick={openDrawer}>{label('openDrawer')}</Button>
                          <a class="ui-button" href="#theme">
                            {label('theme')}
                          </a>
                        </ToolbarMenu>
                        <LangToggle lang={lang()} onChange={setLang} />
                      </>
                    }
                  >
                    <Select
                      aria-label={label('section')}
                      value={section()}
                      onChange={(event) => go(Number(event.currentTarget.value))}
                    >
                      <For each={sections}>
                        {(key, index) => <option value={index()}>{label(key)}</option>}
                      </For>
                    </Select>
                    {navigation()}
                    <a
                      class="ui-button ui-button-primary"
                      href={`https://${reader()}.dev`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {label('openReader')}
                    </a>
                  </ReaderHeader>
                </div>
                {source('ReaderHeader')}
              </section>
              <section id="buttons">
                {heading('buttons', 'buttonsHint', '02')}
                <div class="gallery-control-grid">
                  <div>
                    <p class="gallery-caption">{label('primary')}</p>
                    <Button variant="primary" onClick={openDrawer}>
                      {label('openDrawer')}
                    </Button>
                  </div>
                  <div>
                    <p class="gallery-caption">{label('secondary')}</p>
                    <Button onClick={() => document.getElementById('top')?.scrollIntoView()}>
                      {label('top')}
                    </Button>
                  </div>
                  <div>
                    <p class="gallery-caption">{label('toggle')}</p>
                    <Button active={pressed()} onClick={() => setPressed(!pressed())}>
                      {label(pressed() ? 'selected' : 'unselected')}
                    </Button>
                  </div>
                  <div>
                    <p class="gallery-caption">{label('disabled')}</p>
                    <Button disabled>{label('disabled')}</Button>
                  </div>
                </div>
                {source('Button')}
                <div class="gallery-pill-preview">
                  <PillRow>
                    <For each={sections}>
                      {(key, index) => (
                        <Pill active={section() === index()} onClick={() => setSection(index())}>
                          {label(key)}
                        </Pill>
                      )}
                    </For>
                  </PillRow>
                </div>
                {source('Pill')}
              </section>
              <section id="navigation">
                {heading('navigation', 'navigationHint', '03')}
                <div class="gallery-control-grid">
                  <div>
                    <p class="gallery-caption">Select</p>
                    <Select
                      aria-label={`${label('section')} · Select`}
                      value={section()}
                      onChange={(event) => setSection(Number(event.currentTarget.value))}
                    >
                      <For each={sections}>
                        {(key, index) => <option value={index()}>{label(key)}</option>}
                      </For>
                    </Select>
                    {source('Select')}
                  </div>
                  <div>
                    <p class="gallery-caption">PageNavigation</p>
                    {navigation()}
                    {source('PageNavigation')}
                  </div>
                  <div>
                    <p class="gallery-caption">LangToggle</p>
                    <LangToggle lang={lang()} onChange={setLang} />
                    {source('LangToggle')}
                  </div>
                </div>
              </section>
              <section id="panels">
                {heading('panels', 'panelsHint', '04')}
                <div class="gallery-control-grid">
                  <div>
                    <p class="gallery-caption">ToolbarMenu</p>
                    <ToolbarMenu label={label('more')}>
                      <a class="ui-button" href="#theme">
                        {label('theme')}
                      </a>
                      <Button onClick={openDrawer}>{label('openDrawer')}</Button>
                    </ToolbarMenu>
                    {source('ToolbarMenu')}
                  </div>
                  <div>
                    <p class="gallery-caption">Drawer</p>
                    <Button onClick={openDrawer}>{label('openDrawer')}</Button>
                    {source('Drawer')}
                  </div>
                </div>
              </section>
              <section id="text">
                {heading('text', 'textHint', '05')}
                <div class="gallery-reading-grid">
                  <div>
                    <p class="gallery-caption">{label('english')} · Spectral</p>
                    <Prose en={t('proseEn', 'en')} lang="en" />
                  </div>
                  <div class="gallery-talmud-type">
                    <p class="gallery-caption">{label('talmud')} · Mekorot Vilna</p>
                    <Prose he={t('proseHe', 'he')} lang="he" />
                  </div>
                  <div>
                    <p class="gallery-caption">{label('tanach')} · Frank Ruhl Libre</p>
                    <Prose he={t('proseHe', 'he')} lang="he" />
                  </div>
                </div>
                {source('Prose')}
              </section>
              <section id="theme">
                {heading('theme', 'themeHint', '06')}
                <div class="gallery-swatches">
                  <For each={colors}>
                    {({ token, label: key }) => (
                      <div class="gallery-swatch">
                        <div class="gallery-swatch-color" style={{ background: `var(${token})` }} />
                        <strong>{label(key)}</strong>
                        <code>{token}</code>
                        <span>{values()[token]}</span>
                      </div>
                    )}
                  </For>
                </div>
                {source('tokens.css')}
              </section>
              <ArgumentExample lang={lang()} />
              <DataExamples lang={lang()} />
              <footer>{label('libraryNote')}</footer>
            </main>
          </div>
        }
      >
        <main class="gallery-phone-stage">
          <div class="gallery-phone-notes">
            <h1>{label('phoneTitle')}</h1>
            <p>{label('phoneHint')}</p>
            <label class="gallery-phone-width-label" for="phone-width">
              {label('phoneWidth')}
            </label>
            <Select
              id="phone-width"
              value={phoneWidth()}
              onChange={(event) => setPhoneWidth(Number(event.currentTarget.value))}
            >
              <option value={320}>{label('smallPhone')}</option>
              <option value={390}>{label('standardPhone')}</option>
              <option value={430}>{label('largePhone')}</option>
            </Select>
            <p class="gallery-phone-detail">{label('phoneDetail')}</p>
            <div class="gallery-palette-note">
              <span aria-hidden="true" />
              {label('paletteNote')}
            </div>
            <a class="ui-button" href={`?embed=1&lang=${lang()}`} target="_blank" rel="noreferrer">
              {label('fullPage')}
            </a>
          </div>
          <div class="gallery-phone-frame" style={{ width: `${phoneWidth() + 16}px` }}>
            <iframe title={label('phoneFrame')} src={`?embed=1&lang=${lang()}`} />
          </div>
        </main>
      </Show>
      <Show when={drawer()}>
        <Drawer
          title={label('drawerTitle')}
          label="Drawer"
          dir={lang() === 'he' ? 'rtl' : 'ltr'}
          onClose={closeDrawer}
        >
          <div class="gallery-drawer-copy">
            <Prose en={t('drawerBody', 'en')} he={t('drawerBody', 'he')} lang={lang()} />
            <Prose en={t('drawerDetail', 'en')} he={t('drawerDetail', 'he')} lang={lang()} />
            {source('Drawer')}
          </div>
        </Drawer>
      </Show>
    </div>
  );
}
