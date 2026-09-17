/**
 * #about — the project's front door for people rather than for study: what the
 * reader is, who builds it, what it does, where it came from, and the ways in
 * for a contributor. Laid out like a well-set introduction to a sefer: one
 * reading column with marginalia (Hebrew section letters and small labels) in
 * the left margin. Deep links `#about/<section>` scroll to a section. The
 * Sources & credits list that used to be the whole page lives here as the last
 * section, so old `#about` links still land on it.
 *
 * English only on purpose: the reader's chrome is bilingual, but this page is
 * long-form prose about the project and is maintained in one language. The
 * page is LTR even when the app is in Hebrew.
 */
import { For, type JSX, onCleanup, onMount } from 'solid-js';
import { FEATURED_DAF } from './tutorial';

const REPO = 'https://github.com/Shaun-Regenbaum/talmud';
const DOCS = `${REPO}/blob/master`;

// ── content ──────────────────────────────────────────────────────────────

interface Feature {
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    title: 'The Vilna page, as printed',
    body: 'Gemara in the middle, Rashi and Tosafot at the sides, wrapping the way the book does. The layout comes from daf-renderer.',
  },
  {
    title: 'Notes pinned to their words',
    body: 'Background, argument, halacha, people, places, verses, parallels. Each shows its source and its confidence.',
  },
  {
    title: 'The argument as a map',
    body: 'Who answers whom, what stays open, which other dapim the discussion leans on.',
  },
  {
    title: 'The people, across Shas',
    body: 'One entry per sage: generation, place, teachers, and who they are quoted with.',
  },
  {
    title: 'Two languages, not one translated',
    body: 'Every note in English and in Hebrew. The Hebrew is written as Hebrew.',
  },
  {
    title: 'Ask the page, and open to machines',
    body: 'Answers from the daf in front of you; a documented API and an MCP server for assistants. Recipe, inputs, model, and cost on every note.',
  },
];

interface Milestone {
  when: string;
  title: string;
  body: string;
}

const HISTORY: Milestone[] = [
  {
    when: '2019',
    title: 'A student project at Georgia Tech',
    body: '"The Future of the Talmud", funded by DILAC, advised by Janet Murray. The prototype already lived at talmud.dev.',
  },
  {
    when: 'Nov 2020',
    title: 'daf-renderer',
    body: 'A dependency-free library that lays out a Vilna page. Still the engine underneath.',
  },
  {
    when: '2021',
    title: 'Talmud Lab, and Sefaria',
    body: "A word-by-word Aramaic translation project on Sefaria's Jastrow and Dicta's lexicon.",
  },
  {
    when: 'Dec 2022',
    title: 'This repository begins',
    body: 'Could AI models understand the Gemara and write notes that actually help?',
  },
  {
    when: '2025 →',
    title: 'The reader you are looking at',
    body: 'Rebuilt on Cloudflare Workers and Solid, one engine shared with tanach.dev.',
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
    note: 'text and commentary links, under their open licensing',
  },
  {
    name: 'HebrewBooks',
    url: 'https://www.hebrewbooks.org',
    note: 'printed-page typography',
  },
  {
    name: 'Kollel Iyun HaDaf',
    url: 'https://www.dafyomi.co.il',
    note: 'per-daf study aids, © and with links back to the original pages',
  },
  {
    name: 'daf-renderer',
    url: 'https://github.com/TalmudLab/daf-renderer',
    note: 'MIT, Dan Jutan and Shaun Regenbaum',
  },
];

const SECTIONS = [
  { id: 'who', letter: 'א', label: 'Who is behind it' },
  { id: 'what', letter: 'ב', label: 'What it does' },
  { id: 'how', letter: 'ג', label: 'How it works' },
  { id: 'history', letter: 'ד', label: 'Where it came from' },
  { id: 'ways', letter: 'ה', label: 'Ways in' },
  { id: 'credits', letter: 'ו', label: 'Sources' },
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
          <h1 class="read-title">Bringing the daf to the AI age.</h1>
          <p class="read-drop">
            Talmud.dev is a free, open-source learning app for Gemara. It shows the Vilna page in
            the classic tzurat hadaf layout and supplements it with translations, explanations,
            visual aids, maps, biographies, and more. We do this through smart notes. Every note is
            sourced and backed by the text.
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
          <p class="read-cap">
            Berakhot 2a in the reader, with the argument overview open and anchored to the words it
            explains. The tour opens {FEATURED_DAF.tractate} {FEATURED_DAF.page}.
          </p>
        </div>
      </section>

      <section id="who" ref={register('who')} class="read-sec">
        <Margin id="who" />
        <div class="read-col">
          <p>
            Shaun Regenbaum and Dan Jutan co-founded the Talmud Lab at Georgia Tech in 2020. Shaun
            has kept this project going since. He builds and pays for the reader and the engine
            behind it, and is now a bioengineering PhD student at the Hebrew University.
          </p>
        </div>
      </section>

      <section id="what" ref={register('what')} class="read-sec">
        <Margin id="what" />
        <div class="read-col">
          <h2>The daf stays at the center.</h2>
          <p>
            Everything else is a note attached to it, and every note can be opened, checked, and
            traced back.
          </p>
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
        </div>
      </section>

      <section id="how" ref={register('how')} class="read-sec">
        <Margin id="how" />
        <div class="read-col">
          <h2>Four ideas carry the whole system.</h2>
          <p>
            <strong>A text</strong> is something with addresses: a daf and its segments, a chapter
            and its verses. <strong>A note</strong> is a typed piece of content about the text.{' '}
            <strong>An anchor</strong> is where the note sits; it starts coarse and is narrowed only
            when a rule, a model, or a person is sure, because a wrong anchor is worse than a wide
            one. <strong>A producer</strong> is the recipe that makes a note, and every result is
            cached with that recipe, its inputs, and its cost. A person's correction outranks
            everything and is never overwritten. <a href="#howitworks">The live walkthrough</a>{' '}
            shows this on a real daf, and{' '}
            <Ext href={`${DOCS}/docs/framework.md`}>the framework</Ext> is the written version.
          </p>
        </div>
      </section>

      <section id="history" ref={register('history')} class="read-sec">
        <Margin id="history" />
        <div class="read-col">
          <ol class="read-timeline">
            <For each={HISTORY}>
              {(m) => (
                <li>
                  <span class="read-y">{m.when}</span>
                  <div>
                    <div class="read-t">{m.title}</div>
                    <div class="read-d">{m.body}</div>
                  </div>
                </li>
              )}
            </For>
          </ol>
        </div>
      </section>

      <section id="ways" ref={register('ways')} class="read-sec">
        <Margin id="ways" />
        <div class="read-col">
          <p>
            The code is MIT licensed and you need no keys to build it or run the tests.{' '}
            <Ext href={`${DOCS}/CONTRIBUTING.md`}>Improve the reader</Ext>,{' '}
            <Ext href={`${DOCS}/docs/mcp.md`}>extend the MCP and API</Ext>,{' '}
            <Ext href={`${DOCS}/docs/data.md`}>improve the data</Ext> by reporting a wrong note or
            fixing a sage or a place, or{' '}
            <Ext href={`${DOCS}/docs/README.md`}>learn how it is built</Ext> and fix the docs.
          </p>
          <p>
            <em>Working with an AI assistant?</em> Good. There is a briefing file for agents, a
            worktree per change, checks that need no secrets, and an MCP server so the assistant can
            read the live corpus. Keep changes small, run the checks, say what the tool did, and
            never let it invent a source.{' '}
            <Ext href={`${DOCS}/docs/contributing-with-ai.md`}>Read the guide.</Ext>
          </p>
        </div>
      </section>

      <section id="credits" ref={register('credits')} class="read-sec read-credits">
        <Margin id="credits" />
        <div class="read-col read-small">
          <For each={SOURCES}>
            {(s, i) => (
              <>
                <Ext href={s.url}>{s.name}</Ext>, {s.note}
                {i() < SOURCES.length - 1 ? ' · ' : '. '}
              </>
            )}
          </For>
          Code © Shaun Regenbaum, MIT. Found a wrong note?{' '}
          <Ext href={`${REPO}/issues/new/choose`}>Report it.</Ext>
        </div>
      </section>
    </main>
  );
}
