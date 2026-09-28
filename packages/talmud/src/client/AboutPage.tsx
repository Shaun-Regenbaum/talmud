/**
 * #about — the project's front door for people rather than for study: a short
 * signed letter from the author and the two ways in. Laid out like the introduction to a sefer: one reading
 * column with marginalia in the left margin. The technical story lives on
 * #howitworks and in docs/, not here.
 *
 * English only on purpose: the reader's chrome is bilingual, but this page is
 * prose about the project and is maintained in one language. The page is LTR
 * even when the app is in Hebrew.
 */
import type { JSX } from 'solid-js';

const REPO = 'https://github.com/Shaun-Regenbaum/talmud';

function Ext(props: { href: string; children: JSX.Element }): JSX.Element {
  return (
    <a href={props.href} target="_blank" rel="noreferrer">
      {props.children}
    </a>
  );
}

function He(props: { children: string }): JSX.Element {
  return (
    <span class="read-he" lang="he" dir="rtl">
      {props.children}
    </span>
  );
}

export function AboutPage(): JSX.Element {
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
        <div class="read-col read-letter-body">
          <h1 class="read-sr">About Talmud.dev</h1>
          <p class="read-drop">
            Talmud.dev is an app I built for myself. It started at Georgia Tech in 2019 with Dan
            Jutan as an exploration of what a proper digital Talmud would look like. We built a
            tzurat-hadaf library for Sefaria. Since then, I have been continually improving it. All
            the code is open source and it is provided for free for anyone that wants to use it
            however they want.
          </p>
          <p>
            Its goal is to make it easier to learn by answering the questions that naturally arise
            on a daf. What does <He>תְּרוּמָה</He> (terumah, the priests' portion) mean here? Who was{' '}
            <He>רַבִּי אֱלִיעֶזֶר</He>, and why is he arguing with <He>רַבָּן גַּמְלִיאֵל</He>? Which <He>פָּסוּק</He>{' '}
            is the Gemara quoting half of, and how is it reading it?
          </p>
          <p>
            Most of the notes are written by AI, based on the daf and the commentaries on it. So
            every note tells you where it came from, and you can check it against the text.
            Occasionally they are wrong, so please{' '}
            <Ext href={`${REPO}/issues/new/choose`}>report it</Ext> if you find something and I'll
            fix it (but it is quite rare).
          </p>
          <p class="read-sig">Shaun</p>
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
    </main>
  );
}
