/**
 * #about — the project's front door for people rather than for study: what the
 * reader is, what it does, who builds it, where it came from, and the ways in
 * for a contributor. Deep links `#about/<section>` scroll to a section. The
 * Sources & credits list that used to be the whole page lives here as its own
 * section, so old `#about` links from the alignment workbench still land on it.
 *
 * English only on purpose: the reader's chrome is bilingual, but this page is
 * long-form prose about the project and is maintained in one language. The
 * page is LTR even when the app is in Hebrew.
 */
import { createSignal, For, type JSX, onCleanup, onMount } from 'solid-js';
import { FEATURED_DAF } from './tutorial';

const REPO = 'https://github.com/Shaun-Regenbaum/talmud';

// ── content ──────────────────────────────────────────────────────────────

interface Feature {
  title: string;
  body: string;
  href?: string;
  linkLabel?: string;
}

const FEATURES: Feature[] = [
  {
    title: 'The Vilna page, as printed',
    body: 'Gemara in the middle, Rashi and Tosafot down the sides, wrapping the way the printed page wraps. The layout comes from daf-renderer, a library written for exactly this, so the page you study looks like the page in the book.',
    href: '#daf',
    linkLabel: 'Open the reader',
  },
  {
    title: 'Notes pinned where they belong',
    body: 'Background, the shape of the argument, practical halacha, Rishonim, the people speaking, the places named, the verses quoted, and parallels elsewhere. Each note is attached to the words it is about, and each shows where it came from and how sure the placement is.',
    href: '#tutorial',
    linkLabel: 'Take the tour',
  },
  {
    title: 'The argument as a map',
    body: 'A daf is split into its moves. You can see who answers whom, which questions are left open, and which other dapim the discussion leans on or feeds.',
    href: '#argument',
    linkLabel: 'See an argument map',
  },
  {
    title: 'The people, across Shas',
    body: 'Every sage is one entry: generation, where they taught, who they learned from, and a network of who they are quoted with. The same name on two pages resolves to the same person, or says honestly that it cannot tell.',
    href: '#sages',
    linkLabel: 'Browse the sages',
  },
  {
    title: 'Two languages, not one translated',
    body: 'Every note exists in English and in Hebrew. The Hebrew is written as Hebrew, not run through a translator, so it reads like a study aid and not like a subtitle.',
  },
  {
    title: 'Ask the page',
    body: 'Questions are answered from the daf in front of you and the sources behind it, with word-level translation for the Aramaic when you need it.',
  },
  {
    title: 'Nothing is hidden',
    body: 'Every generated note carries its recipe, its inputs, its model, and its cost. The build graph, cache state, and generation status are on screen for anyone who wants to look.',
    href: '#howitworks',
    linkLabel: 'How it works, live',
  },
  {
    title: 'Open to machines too',
    body: 'The same corpus is reachable through a documented API and an MCP server, so an AI assistant can read a daf and its notes the way a person does.',
    href: '#mcp',
    linkLabel: 'Connect via MCP',
  },
];

interface Person {
  name: string;
  role: string;
  href: string;
}

const PEOPLE: Person[] = [
  {
    name: 'Shaun Regenbaum',
    role: 'Co-founded Talmud Lab at Georgia Tech in 2020 and has kept talmud.dev going since. Builds and pays for the reader and the engine behind it: every note type, the placement model, the caching. Now a bioengineering PhD student at the Hebrew University.',
    href: 'https://shaunregenbaum.com',
  },
  {
    name: 'Dan Jutan',
    role: 'Co-founded Talmud Lab and co-wrote daf-renderer, the library that lays out the Vilna page in the browser. Studied computer science at Georgia Tech, later worked on documentation and teaching for the SolidJS and Astro core teams, and now runs software at a health-tech startup. This reader is built on Solid.',
    href: 'https://danjutan.com',
  },
];

interface Milestone {
  when: string;
  title: string;
  body: string;
  href?: string;
  linkLabel?: string;
}

const HISTORY: Milestone[] = [
  {
    when: '2019',
    title: 'A student project at Georgia Tech',
    body: 'Dan and Shaun, both undergraduates, proposed "The Future of the Talmud" to the Digital Integrative Liberal Arts Center and got it funded, with Janet Murray advising. The question was simple to ask and hard to answer: what should a Talmud page look like on a screen? The first prototype lived at talmud.dev, the same address as today.',
    href: 'https://dilac.iac.gatech.edu/node/66',
    linkLabel: 'The project at DILAC',
  },
  {
    when: 'November 2020',
    title: 'daf-renderer',
    body: 'The answer to the layout question became a library. daf-renderer takes three blocks of HTML and lays them out as a Vilna page with no dependencies: Gemara in the middle, Rashi inside, Tosafot outside, wrapping the way the printed page does. It sorts every page into one of three shapes, which the code calls double-wrap, stairs, and double-extend. It went to npm in January 2021, and a port of it is still the layout engine under this reader.',
    href: 'https://github.com/TalmudLab/daf-renderer',
    linkLabel: 'daf-renderer on GitHub',
  },
  {
    when: '2021',
    title: 'Talmud Lab, and Sefaria',
    body: "The lab took the name Talmud Lab and grew a few more pieces: a demo study app, a pipeline for Bavli text with Rashi and Tosafot, and, with Dov Greenwood, a word-by-word Aramaic translation project that mapped every word of the Talmud to its entry in the Jastrow dictionary, built on Sefaria's digitized Jastrow and Dicta's lexicon and meant for both Talmud Lab and Sefaria to use. Sefaria's engineers had been following the layout work since the first prototype, and the collaboration continued over the years that followed, including work on telling apart sages who share a name.",
    href: 'https://github.com/TalmudLab',
    linkLabel: 'Talmud Lab on GitHub',
  },
  {
    when: 'December 2022',
    title: 'This repository begins',
    body: 'The first commits here were a search over Talmud sources and some early experiments with a language model. The question had changed: could a model write notes worth reading, and could it be trusted to say where on the page they belonged? Then two quiet years.',
  },
  {
    when: '2025 to now',
    title: 'The reader you are looking at',
    body: 'Picked back up in August 2025 and rebuilt in the spring of 2026 on Cloudflare Workers with a Solid front end. By June 2026 it had its domain back, one engine shared with a sister Tanach reader, and most of what you see on a daf today. The engine is four ideas: a text, a note, the anchor that pins a note to the text, and the producer that makes it. A wrong anchor is worse than a wide one, and a human correction is never overwritten by a machine.',
    href: 'https://tanach.dev',
    linkLabel: 'The Tanach reader',
  },
];

interface Door {
  title: string;
  body: string;
  href: string;
  linkLabel: string;
}

const DOORS: Door[] = [
  {
    title: 'Improve the reader',
    body: 'The page, the cards, navigation, mobile, accessibility. A Solid front end with a Hono API on Cloudflare Workers, and a test suite you can run without any keys.',
    href: `${REPO}/blob/master/CONTRIBUTING.md`,
    linkLabel: 'Contributor guide',
  },
  {
    title: 'Extend the MCP and API',
    body: 'Give assistants better tools for the corpus: new endpoints, better shapes, worked examples. The OpenAPI spec and the MCP server live in one file each.',
    href: `${REPO}/blob/master/docs/mcp.md`,
    linkLabel: 'MCP and API guide',
  },
  {
    title: 'Improve the data',
    body: 'Report a wrong or misplaced note. Fix a sage in the registry, a place in the gazetteer, a source that is mapped badly. Human corrections outrank everything the machine produces.',
    href: `${REPO}/blob/master/docs/data.md`,
    linkLabel: 'The data, and how to correct it',
  },
  {
    title: 'Learn how it is built',
    body: 'Read the framework, walk the live build graph, or just study a daf and tell us what is confusing. Documentation fixes are contributions too.',
    href: `${REPO}/blob/master/docs/README.md`,
    linkLabel: 'Documentation index',
  },
];

interface SourceCredit {
  name: string;
  url: string;
  role: string;
  note?: string;
}

/** Credits for the external sources this project ingests. Data-driven so adding
 *  a future source is a one-line edit. */
const SOURCES: SourceCredit[] = [
  {
    name: 'Sefaria',
    url: 'https://www.sefaria.org',
    role: 'Talmud text, segmentation, translations, and commentary links',
    note: 'Open digital library of Jewish texts. Text used under their open/CC licensing.',
  },
  {
    name: 'HebrewBooks',
    url: 'https://www.hebrewbooks.org',
    role: 'Printed-Talmud page typography (Gemara / Rashi / Tosafot columns)',
    note: 'Used to render the daf in its traditional printed layout.',
  },
  {
    name: 'Kollel Iyun HaDaf (Dafyomi Advancement Forum)',
    url: 'https://www.dafyomi.co.il',
    role: "Per-daf study material: Background, Insights, Halacha, Tosfos outlines, Review questions, Points outlines, charts, Yerushalmi parallels, and Revach l'Daf highlights (co-published with Revach l'Neshamah, revach.net)",
    note: 'Headed by Rav Mordecai Kornfeld. Content © Kollel Iyun HaDaf, ingested as a study source with attribution and links back to the original pages. Not redistributed as a standalone copy.',
  },
  {
    name: 'daf-renderer',
    url: 'https://github.com/TalmudLab/daf-renderer',
    role: 'The Vilna page layout engine',
    note: 'MIT licensed, by Dan Jutan and Shaun Regenbaum, from the Talmud Lab at Georgia Tech.',
  },
];

const SECTIONS = [
  { id: 'what', label: 'What it does' },
  { id: 'how', label: 'How it works' },
  { id: 'who', label: 'Who is behind it' },
  { id: 'history', label: 'Where it came from' },
  { id: 'contribute', label: 'Ways in' },
  { id: 'credits', label: 'Sources & credits' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

// ── presentational atoms ─────────────────────────────────────────────────

const h2: JSX.CSSProperties = {
  margin: '0 0 0.25rem',
  'font-size': '1.35rem',
  'font-weight': 700,
  'letter-spacing': '-0.01em',
};

const lede: JSX.CSSProperties = {
  margin: '0 0 1.1rem',
  color: 'var(--muted)',
  'font-size': '0.95rem',
  'line-height': 1.55,
  'max-width': '62ch',
};

const sectionStyle: JSX.CSSProperties = {
  'scroll-margin-top': '1rem',
  'padding-bottom': '2.4rem',
  'margin-bottom': '2.4rem',
  'border-bottom': '1px solid var(--line)',
};

function ExternalLink(props: { href: string; children: JSX.Element }): JSX.Element {
  const external = () => /^https?:/.test(props.href);
  return (
    <a
      href={props.href}
      target={external() ? '_blank' : undefined}
      rel={external() ? 'noreferrer' : undefined}
      style={{ color: 'var(--accent)', 'text-decoration': 'none', 'font-weight': 600 }}
    >
      {props.children}
      {external() ? ' ↗' : ' →'}
    </a>
  );
}

function Card(props: {
  title: string;
  body: string;
  href?: string;
  linkLabel?: string;
  eyebrow?: string;
}): JSX.Element {
  return (
    <article class="about-card">
      {props.eyebrow ? <div class="about-eyebrow">{props.eyebrow}</div> : null}
      <h3 style={{ margin: '0 0 0.35rem', 'font-size': '1rem' }}>{props.title}</h3>
      <p style={{ margin: 0, 'font-size': '0.88rem', 'line-height': 1.55, color: '#333' }}>
        {props.body}
      </p>
      {props.href && props.linkLabel ? (
        <p style={{ margin: '0.6rem 0 0', 'font-size': '0.84rem' }}>
          <ExternalLink href={props.href}>{props.linkLabel}</ExternalLink>
        </p>
      ) : null}
    </article>
  );
}

function CtaButton(props: { href: string; children: JSX.Element; primary?: boolean }): JSX.Element {
  const external = () => /^https?:/.test(props.href);
  return (
    <a
      href={props.href}
      target={external() ? '_blank' : undefined}
      rel={external() ? 'noreferrer' : undefined}
      class="about-cta"
      classList={{ 'is-primary': !!props.primary }}
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
  const [active, setActive] = createSignal<SectionId>('what');
  const refs = new Map<SectionId, HTMLElement>();
  const register = (id: SectionId) => (el: HTMLElement) => refs.set(id, el);

  onMount(() => {
    const wanted = requestedSection();
    if (wanted) refs.get(wanted)?.scrollIntoView({ block: 'start' });

    // Keep the rail in step with the section under the reader's eye.
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const top = visible[0]?.target.id;
        if (top && SECTIONS.some((s) => s.id === top)) setActive(top as SectionId);
      },
      { rootMargin: '-10% 0px -70% 0px' },
    );
    for (const el of refs.values()) io.observe(el);
    onCleanup(() => io.disconnect());
  });

  const jump = (id: SectionId) => {
    refs.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(id);
  };

  return (
    <main class="page-shell about-page" style={{ '--page-max': '1080px' }} dir="ltr">
      <section class="about-hero">
        <div class="about-hero-text">
          <p class="about-kicker">
            <a href="#daf" style={{ color: 'inherit', 'text-decoration': 'none' }}>
              ← back to the daf
            </a>
          </p>
          <h1 class="about-title">
            <span class="about-title-he" lang="he">
              תלמוד
            </span>
            <span>The daf, covered in smart notes.</span>
          </h1>
          <p class="about-lede">
            Talmud.dev is a free, open-source study reader. It shows the Vilna page as printed and
            layers explanations, argument maps, people, places, verses, and practical halacha onto
            the exact words they are about. Every note says where it came from and how sure it is.
            When the system cannot place a note precisely, it says so instead of guessing.
          </p>
          <div class="about-ctas">
            <CtaButton href="#daf" primary>
              Open the reader
            </CtaButton>
            <CtaButton href="#tutorial">Take the five-minute tour</CtaButton>
            <CtaButton href={REPO}>Source on GitHub</CtaButton>
          </div>
          <p class="about-fineprint">
            The tour opens {FEATURED_DAF.tractate} {FEATURED_DAF.page}, a rich early daf where every
            kind of note shows up.
          </p>
        </div>
      </section>

      <div class="about-layout">
        <nav class="about-rail" aria-label="Sections">
          <ol>
            <For each={SECTIONS}>
              {(s) => (
                <li>
                  <button
                    type="button"
                    classList={{ 'is-active': active() === s.id }}
                    onClick={() => jump(s.id)}
                  >
                    {s.label}
                  </button>
                </li>
              )}
            </For>
          </ol>
        </nav>

        <div class="about-body">
          <section id="what" ref={register('what')} style={sectionStyle}>
            <h2 style={h2}>What it does</h2>
            <p style={lede}>
              The daf stays at the center. Everything else is a note attached to it, and every note
              can be opened, checked, and traced back.
            </p>
            <div class="about-grid">
              <For each={FEATURES}>
                {(f) => (
                  <Card title={f.title} body={f.body} href={f.href} linkLabel={f.linkLabel} />
                )}
              </For>
            </div>
          </section>

          <section id="how" ref={register('how')} style={sectionStyle}>
            <h2 style={h2}>How it works</h2>
            <p style={lede}>
              Four ideas carry the whole system, and the same four run the Tanach reader.
            </p>
            <div class="about-grid about-grid-4">
              <Card
                eyebrow="1"
                title="A text"
                body="Something with addresses: a daf and its segments, a chapter and its verses, or a set of people. The code calls it a spine."
              />
              <Card
                eyebrow="2"
                title="A note"
                body="A typed piece of content about the text: a background note, an argument map, a halacha, a sage. The code calls it an artifact."
              />
              <Card
                eyebrow="3"
                title="An anchor"
                body="Where the note sits. It starts coarse (the whole daf) and is narrowed only when a rule, a model, or a person is sure. A wrong anchor is worse than a wide one."
              />
              <Card
                eyebrow="4"
                title="A producer"
                body="The recipe that makes a note: which sources it reads, which model runs, what shape comes back. Every result is cached with that recipe, its inputs, and its cost."
              />
            </div>
            <p style={{ margin: '1.1rem 0 0', 'font-size': '0.9rem', 'line-height': 1.6 }}>
              Deterministic rules do what they can and a model does the rest, but a person's
              correction outranks both and is never overwritten. The{' '}
              <ExternalLink href="#howitworks">live walkthrough</ExternalLink> shows all of this on
              a real daf, pulled from the running system. The written version is{' '}
              <ExternalLink href={`${REPO}/blob/master/docs/framework.md`}>
                the framework
              </ExternalLink>
              .
            </p>
          </section>

          <section id="who" ref={register('who')} style={sectionStyle}>
            <h2 style={h2}>Who is behind it</h2>
            <p style={lede}>
              A personal, non-commercial project. It runs on a small budget for model calls, which
              is why a cold page sometimes takes a few minutes and why the reader will tell you when
              generation is paused.
            </p>
            <div class="about-grid about-grid-2">
              <For each={PEOPLE}>
                {(p) => <Card title={p.name} body={p.role} href={p.href} linkLabel="GitHub" />}
              </For>
            </div>
            <p style={{ margin: '1.1rem 0 0', 'font-size': '0.9rem', 'line-height': 1.6 }}>
              It stands on <ExternalLink href="https://www.sefaria.org">Sefaria</ExternalLink>,
              whose open library supplies the text and much of the commentary, and on the study
              material of{' '}
              <ExternalLink href="https://www.dafyomi.co.il">Kollel Iyun HaDaf</ExternalLink>. The
              full list is in the credits below.
            </p>
          </section>

          <section id="history" ref={register('history')} style={sectionStyle}>
            <h2 style={h2}>Where it came from</h2>
            <p style={lede}>
              The reader is the latest shape of a project that started with one narrow problem:
              drawing a Talmud page correctly in a browser.
            </p>
            <ol class="about-timeline">
              <For each={HISTORY}>
                {(m) => (
                  <li>
                    <div class="about-when">{m.when}</div>
                    <div>
                      <h3 style={{ margin: '0 0 0.3rem', 'font-size': '1rem' }}>{m.title}</h3>
                      <p
                        style={{
                          margin: 0,
                          'font-size': '0.9rem',
                          'line-height': 1.6,
                          color: '#333',
                        }}
                      >
                        {m.body}
                      </p>
                      {m.href && m.linkLabel ? (
                        <p style={{ margin: '0.45rem 0 0', 'font-size': '0.84rem' }}>
                          <ExternalLink href={m.href}>{m.linkLabel}</ExternalLink>
                        </p>
                      ) : null}
                    </div>
                  </li>
                )}
              </For>
            </ol>
          </section>

          <section id="contribute" ref={register('contribute')} style={sectionStyle}>
            <h2 style={h2}>Ways in</h2>
            <p style={lede}>
              The code is MIT licensed and everything runs from one repository. You do not need any
              keys to build it, run the tests, or work on the reader.
            </p>
            <div class="about-grid about-grid-2">
              <For each={DOORS}>
                {(d) => (
                  <Card title={d.title} body={d.body} href={d.href} linkLabel={d.linkLabel} />
                )}
              </For>
            </div>
            <div class="about-callout">
              <strong>Working with an AI assistant?</strong> Good. Much of this reader was built
              that way, and the repository is set up for it: a briefing file for agents, an isolated
              worktree per change, a check suite that runs without secrets, and an MCP server so the
              assistant can read the live corpus. Read{' '}
              <ExternalLink href={`${REPO}/blob/master/docs/contributing-with-ai.md`}>
                how to contribute with AI
              </ExternalLink>{' '}
              before you start. The short version: keep changes small, run the checks, say what the
              tool did, and never let it invent a source.
            </div>
          </section>

          <section
            id="credits"
            ref={register('credits')}
            style={{ ...sectionStyle, 'border-bottom': 'none' }}
          >
            <h2 style={h2}>Sources &amp; credits</h2>
            <p style={lede}>
              The sources below make the daf legible, searchable, and richly annotated. Each is used
              with attribution and links back to the original.
            </p>
            <div class="about-grid about-grid-2">
              <For each={SOURCES}>
                {(s) => (
                  <article class="about-card">
                    <div
                      style={{
                        display: 'flex',
                        'align-items': 'baseline',
                        'justify-content': 'space-between',
                        gap: '1rem',
                        'flex-wrap': 'wrap',
                      }}
                    >
                      <h3 style={{ margin: 0, 'font-size': '1rem' }}>{s.name}</h3>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          'font-size': '0.8rem',
                          color: 'var(--accent)',
                          'text-decoration': 'none',
                        }}
                      >
                        {s.url.replace(/^https?:\/\//, '')} ↗
                      </a>
                    </div>
                    <p style={{ margin: '0.4rem 0 0', 'font-size': '0.88rem', color: '#333' }}>
                      {s.role}
                    </p>
                    {s.note ? (
                      <p
                        style={{
                          margin: '0.35rem 0 0',
                          'font-size': '0.8rem',
                          color: 'var(--muted)',
                          'line-height': 1.5,
                        }}
                      >
                        {s.note}
                      </p>
                    ) : null}
                  </article>
                )}
              </For>
            </div>
            <p
              style={{
                margin: '1.5rem 0 0',
                'font-size': '0.8rem',
                color: 'var(--muted)',
                'line-height': 1.6,
              }}
            >
              Code © Shaun Regenbaum, MIT license. Texts and study material stay under their own
              terms. Found a wrong note?{' '}
              <ExternalLink href={`${REPO}/issues/new/choose`}>Report it</ExternalLink>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
