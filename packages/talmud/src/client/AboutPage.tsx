/**
 * #about — the project's front door for people rather than for study: what the
 * reader is, what it does, who makes it, and a footer with sources and the
 * ways in. Kept short on purpose; the technical story lives on #howitworks and
 * in docs/. Laid out like a well-set introduction to a sefer: one reading
 * column with marginalia (Hebrew section letters and small labels) in the left
 * margin. Deep links `#about/<section>` scroll to a section.
 *
 * English only on purpose: the reader's chrome is bilingual, but this page is
 * long-form prose about the project and is maintained in one language. The
 * page is LTR even when the app is in Hebrew.
 */
import { For, type JSX, onCleanup, onMount } from 'solid-js';

const REPO = 'https://github.com/Shaun-Regenbaum/talmud';
const DOCS = `${REPO}/blob/master`;

// ── content ──────────────────────────────────────────────────────────────

interface Feature {
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    title: 'The page as printed',
    body: 'Gemara in the middle, Rashi and Tosafot at the sides, laid out the way the Vilna Shas is.',
  },
  {
    title: 'Notes pinned to the words they explain',
    body: 'Background, halacha, people, places, verses. Each note shows where it came from.',
  },
  {
    title: 'The argument as a map',
    body: 'Who asks, who answers, and what is left open.',
  },
  {
    title: 'Every sage across the whole Talmud',
    body: 'When and where each one lived, and who they are quoted with.',
  },
];

interface SourceCredit {
  name: string;
  url: string;
  note: string;
}

/** Credits for the external sources this project ingests. Data-driven so adding
 *  a future source is a one-line edit. */
const SOURCES: SourceCredit[] = [
  {
    name: 'Sefaria',
    url: 'https://www.sefaria.org',
    note: 'the texts and commentary links, under their open licenses',
  },
  {
    name: 'HebrewBooks',
    url: 'https://www.hebrewbooks.org',
    note: 'the printed-page type',
  },
  {
    name: 'Kollel Iyun HaDaf',
    url: 'https://www.dafyomi.co.il',
    note: 'daf study aids, © theirs, linked back to their pages',
  },
  {
    name: 'daf-renderer',
    url: 'https://github.com/TalmudLab/daf-renderer',
    note: 'the page layout, MIT',
  },
];

const SECTIONS = [
  { id: 'what', letter: 'א', label: 'What you get' },
  { id: 'who', letter: 'ב', label: 'Who makes it' },
  { id: 'credits', letter: 'ג', label: 'Sources' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

// ── presentational atoms ─────────────────────────────────────────────────

function Margin(props: { id: SectionId }): JSX.Element {
  const s = SECTIONS.find((x) => x.id === props.id);
  return (
    <div class="read-margin">
      <span class="read-letter" lang="he">
        {s?.letter}
      </span>
      {s?.label}
    </div>
  );
}

function Ext(props: { href: string; children: JSX.Element }): JSX.Element {
  const external = () => /^https?:/.test(props.href);
  return (
    <a
      href={props.href}
      target={external() ? '_blank' : undefined}
      rel={external() ? 'noreferrer' : undefined}
    >
      {props.children}
    </a>
  );
}

// ── page ─────────────────────────────────────────────────────────────────

/** `#about/<section>` deep link → the section id, or null for the top. */
function requestedSection(): SectionId | null {
  const raw = window.location.hash.replace(/^#/, '');
  const rest = raw.startsWith('about/') ? raw.slice('about/'.length) : '';
  return SECTIONS.some((s) => s.id === rest) ? (rest as SectionId) : null;
}

export function AboutPage(): JSX.Element {
  const refs = new Map<SectionId, HTMLElement>();
  const register = (id: SectionId) => (el: HTMLElement) => refs.set(id, el);

  onMount(() => {
    const wanted = requestedSection();
    if (wanted) refs.get(wanted)?.scrollIntoView({ block: 'start' });

    // A later #about/<section> link (e.g. from the footer while already on
    // this page) does not re-render the route, so follow it here.
    const onHash = () => {
      const next = requestedSection();
      if (next) refs.get(next)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.addEventListener('hashchange', onHash);
    onCleanup(() => window.removeEventListener('hashchange', onHash));
  });

  return (
    <main class="read-page" dir="ltr">
      <header class="read-head">
        <div class="read-margin read-margin-plain">About</div>
        <div class="read-head-row">
          <a href="#daf" class="read-wordmark">
            Talmud.dev
          </a>
          <nav class="read-nav" aria-label="Site">
            <a href="#daf">Reader</a>
            <a href="#tutorial">Tour</a>
            <a href="#howitworks">How it works</a>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <section class="read-sec read-hero">
        <div class="read-margin">
          <span class="read-letter read-letter-big" lang="he">
            תלמוד
          </span>
          {'A learning app '}
          <br />
          for Gemara
        </div>
        <div class="read-col">
          <h1 class="read-title">Learn Gemara with the page in front of you.</h1>
          <p class="read-drop">
            Talmud.dev is a free learning app for Gemara. It shows the Vilna page as it is printed,
            with notes beside it: translations, explanations, maps, and the people in the
            discussion. Every note shows its source.
          </p>
          <div class="read-ctas">
            <a href="#daf" class="read-btn is-fill">
              Open the reader
            </a>
            <a href="#tutorial" class="read-btn">
              Take the five-minute tour
            </a>
          </div>
        </div>
      </section>

      <section class="read-sec read-plate">
        <div class="read-margin" aria-hidden="true" />
        <div class="read-col">
          <img
            src="/about/talmud-reader.jpg"
            alt="Berakhot 2a in the reader, with the argument overview open"
            class="read-img"
            width="1600"
            height="1000"
          />
          <p class="read-cap">Berakhot 2a, with the overview of the argument open.</p>
        </div>
      </section>

      <section id="what" ref={register('what')} class="read-sec">
        <Margin id="what" />
        <div class="read-col">
          <ol class="read-list">
            <For each={FEATURES}>
              {(f, i) => (
                <li>
                  <span class="read-n">{i() + 1}</span>
                  <div>
                    <div class="read-t">{f.title}</div>
                    <div class="read-d">{f.body}</div>
                  </div>
                </li>
              )}
            </For>
          </ol>
          <p>
            Every note is written in both English and Hebrew. Curious how the notes are made?{' '}
            <a href="#howitworks">See how it works.</a>
          </p>
        </div>
      </section>

      <section id="who" ref={register('who')} class="read-sec">
        <Margin id="who" />
        <div class="read-col">
          <p>
            Shaun Regenbaum builds Talmud.dev and pays for it. He is a bioengineering PhD student at
            the Hebrew University. The project began in 2019 as a student project at Georgia Tech.
            In 2020 he and Dan Jutan started the Talmud Lab there and wrote{' '}
            <Ext href="https://github.com/TalmudLab/daf-renderer">daf-renderer</Ext>, which still
            lays out the page. This version dates from 2025.
          </p>
        </div>
      </section>

      <section id="credits" ref={register('credits')} class="read-sec read-credits">
        <Margin id="credits" />
        <div class="read-col read-small">
          Built on{' '}
          <For each={SOURCES}>
            {(s, i) => (
              <>
                <Ext href={s.url}>{s.name}</Ext> ({s.note}){i() < SOURCES.length - 1 ? ', ' : '. '}
              </>
            )}
          </For>
          The code is open source under the MIT license.{' '}
          <Ext href={`${REPO}/issues/new/choose`}>Report a wrong note</Ext> or{' '}
          <Ext href={`${DOCS}/CONTRIBUTING.md`}>help on GitHub</Ext>.
        </div>
      </section>
    </main>
  );
}
