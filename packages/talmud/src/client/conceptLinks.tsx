/**
 * Concept-link utilities: wrap mentions of glossary terms in prose with a hover
 * tooltip showing the term's gloss — the reader-facing half of "if there's
 * Hebrew, the translation is one hover away".
 *
 * The pool is the unified term registry for the daf (src/lib/terms/registry):
 * the always-known globals (CANONICAL_HEBREW_TERMS) ∪ THIS daf's curated
 * background concepts, the daf's term winning on a Hebrew-key collision. A term
 * is matched by every surface a reader might see it as — its Hebrew script (the
 * dominant form after hebraization) AND its English label — so a Hebrew
 * technical term in prose links to its gloss just as an English one does.
 *
 * Layering: rabbi mentions take priority (RabbiText tokenizes first, then hands
 * its plain-text parts to ConceptAwareText), so a rabbi name is never also
 * tagged as a concept. This module imports only Hebraized — RabbiText imports
 * ConceptAwareText, not the reverse, so there's no cycle.
 *
 * The context value uses ACCESSORS (functions) so Solid tracks reads and
 * consumers re-tokenize when the daf's background terms load async.
 */
import {
  type Accessor,
  createContext,
  createMemo,
  createSignal,
  For,
  type JSX,
  Show,
  useContext,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import type { Term } from '../lib/terms/registry';
import { Hebraized } from './Hebraized';
import { lang } from './i18n';

/** The surfaces a reader might actually SEE for a term in prose: the Hebrew
 *  script (the dominant form after hebraization) and the English label, if any.
 *  Deliberately NOT the romanization/variants — "get", "rov", "siman" etc. are
 *  common English words and matching them would mis-fire. Hebrew script can't
 *  collide with English, so it's the safe, high-precision surface. */
export function surfacesOf(t: Term): string[] {
  const out: string[] = [];
  for (const s of [t.hebrew, t.en]) {
    const v = (s || '').trim();
    if (v.length >= 2) out.push(v);
  }
  return out;
}

/** The bold label shown atop the tooltip — the English reading when we have one,
 *  else the romanization, else the Hebrew itself. */
export function termLabel(t: Term): string {
  return t.en || t.translit || t.hebrew;
}

/** The gloss/meaning shown in the active language: the authored Hebrew gloss in
 *  Hebrew mode (falling back to the English gloss for per-daf concepts, whose
 *  single gloss is already in the daf-enrichment's language), the English gloss
 *  otherwise. */
export function termGloss(t: Term): string {
  return lang() === 'he' ? (t.glossHe ?? t.gloss) : t.gloss;
}

/** A compiled term matcher: a regex over the term surfaces + a lowercased
 *  surface -> term map for gloss lookup. Built once per terms array (hoisted to
 *  the provider) rather than per prose fragment. */
export interface ConceptMatcher {
  re: RegExp;
  bySurface: Map<string, Term>;
}

export interface ConceptLinkContextValue {
  /** Pre-compiled matcher for this daf's terms. Null when there's nothing to
   *  match. Memoized at the provider so prose fragments don't recompile it. */
  matcher: Accessor<ConceptMatcher | null>;
}

const ConceptLinkContext = createContext<ConceptLinkContextValue | null>(null);

export function ConceptLinkProvider(props: {
  value: ConceptLinkContextValue;
  children: JSX.Element;
}): JSX.Element {
  return (
    <ConceptLinkContext.Provider value={props.value}>{props.children}</ConceptLinkContext.Provider>
  );
}

export function useConceptLinks(): ConceptLinkContextValue | null {
  return useContext(ConceptLinkContext);
}

/** Render `text` with background-term mentions wrapped in a gloss tooltip when
 *  a ConceptLink context is in scope; otherwise behave exactly like Hebraized.
 *  This is what RabbiText hands its plain-text parts to (and what cards with no
 *  rabbi pool can use directly). */
export function ConceptAwareText(props: { text: string | undefined | null }): JSX.Element {
  const ctx = useConceptLinks();
  if (!ctx) return <Hebraized text={props.text} />;
  return <ConceptText text={props.text} matcher={ctx.matcher()} />;
}

export interface ConceptTextPart {
  kind: 'text' | 'concept';
  value: string;
  term?: Term;
}

/** Compile a whole-word, case-insensitive matcher over the English term labels,
 *  longest-first so "oral law" beats "law". Word boundaries are Unicode-aware
 *  (a term may carry transliteration diacritics, e.g. "ḥerem", that ASCII `\b`
 *  splits wrongly). Null when there's nothing to match. */
export function buildConceptMatcher(terms: readonly Term[]): ConceptMatcher | null {
  const bySurface = new Map<string, Term>();
  for (const t of terms) {
    // A term contributes every surface it can appear as in prose (Hebrew +
    // English label), so a mention in either script links to the same gloss.
    for (const surface of surfacesOf(t)) {
      const key = surface.toLowerCase();
      // First term to claim a surface wins (deterministic; dedupes repeats).
      if (!bySurface.has(key)) bySurface.set(key, t);
    }
  }
  if (bySurface.size === 0) return null;
  const surfaces = [...bySurface.keys()]
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Unicode letter/number/underscore lookarounds instead of \b: a "word" edge
  // is "not adjacent to another letter/digit", which holds for diacritics and
  // (later) Hebrew script too. `u` makes \p{...} valid; `i` for case-insensitive.
  return {
    re: new RegExp(`(?<![\\p{L}\\p{N}_])(${surfaces.join('|')})(?![\\p{L}\\p{N}_])`, 'giu'),
    bySurface,
  };
}

/** Split prose into plain-text and concept parts using a pre-compiled matcher.
 *  Each matched term yields a 'concept' part whose `value` is the matched text
 *  verbatim (so a linkified term is never rendered empty) and whose `term`
 *  carries the gloss. Pure. */
export function tokenizeWithMatcher(
  text: string,
  matcher: ConceptMatcher | null,
): ConceptTextPart[] {
  if (!text) return [];
  if (!matcher) return [{ kind: 'text', value: text }];
  const { re, bySurface } = matcher;
  const out: ConceptTextPart[] = [];
  let lastIdx = 0;
  re.lastIndex = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const term = bySurface.get(m[1].toLowerCase());
    if (!term) continue;
    if (m.index > lastIdx) out.push({ kind: 'text', value: text.slice(lastIdx, m.index) });
    out.push({ kind: 'concept', value: m[1], term });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) out.push({ kind: 'text', value: text.slice(lastIdx) });
  return out;
}

/** Convenience for callers that have terms but no compiled matcher (tests).
 *  Whole-word, case-insensitive, longest-first. Pure + exported for tests. */
export function tokenizeConceptMentions(text: string, terms: readonly Term[]): ConceptTextPart[] {
  return tokenizeWithMatcher(text, buildConceptMatcher(terms));
}

// ── First-mention gloss policy ────────────────────────────────────────────────
// A glossary term is glossed inline on its FIRST mention in a prose unit and
// runs bare thereafter — the tooltip carries the gloss for every later mention,
// so the repeated parenthetical is pure clutter. This makes the page consistent
// (one gloss per term, deterministically) without the model having to remember
// what it already defined. We only ever STRIP a repeat gloss, never invent one,
// and only when the parenthetical restates the SAME gloss — a meaningful
// parenthetical (a qualifier like "(according to Rashi)") is always kept.

/** Normalize a gloss for comparison: lowercase, drop surrounding quotes /
 *  trailing punctuation, strip a leading article, collapse whitespace. */
export function glossKey(s: string): string {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/^[('"“”‘’\s]+/, '')
    .replace(/[)\]'"“”‘’.,;:!?\s]+$/, '')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether a parenthetical's content is (a restatement of) the term's own gloss
 *  — the ONLY thing we ever strip. Matching is DIRECTIONAL: the parenthetical
 *  must equal the registry gloss, or be CONTAINED in it (the model's inline
 *  gloss is often a shorter form of a longer registry gloss). We never accept
 *  the reverse (gloss contained in the parenthetical), because a meaningful
 *  qualifier that happens to include the gloss text — "(not binding law in this
 *  case)" — must be kept. Containment needs ≥4 chars so a tiny word can't match. */
function isGlossRestatement(parenKey: string, glossK: string): boolean {
  if (!parenKey || !glossK) return false;
  if (parenKey === glossK) return true;
  return parenKey.length >= 4 && glossK.includes(parenKey);
}

/** Match a leading parenthetical: optional whitespace, then a balanced `(...)`
 *  tolerating nested parens (registry glosses like "a shechita organ (trachea /
 *  esophagus)" carry one). A linear hand scan, NOT a regex — the obvious
 *  `(?:[^()]+|\(...\))*` form catastrophically backtracks on an unterminated
 *  `(`. `len` spans the leading whitespace + the paren; `inner` is the content
 *  without the outer parens. Null when there's no balanced leading paren. */
function matchLeadingParen(s: string): { len: number; inner: string } | null {
  let i = 0;
  while (i < s.length && /\s/.test(s[i])) i++;
  if (s[i] !== '(') return null;
  const open = i;
  let depth = 0;
  for (; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) {
      return { len: i + 1, inner: s.slice(open + 1, i) };
    }
  }
  return null; // unterminated
}

/** Consume the gloss parentheticals that lead `text` (the fragment right after a
 *  term mention): keep the FIRST one that restates the term's gloss (recording
 *  it in `glossed`), strip every later one. Loops so adjacent duplicates all go
 *  in a single pass (keeps the function idempotent). A non-gloss parenthetical
 *  (a real qualifier) stops the peel and is left untouched.
 *
 *  No seam cleanup is needed: `len` always covers the whitespace BEFORE the
 *  paren too, so a stripped paren leaves the whitespace that FOLLOWED it intact
 *  as the single separator — and text further along the fragment is never
 *  touched. */
function peelGlosses(text: string, term: Term, glossed: Set<Term>): string {
  const glossK = glossKey(term.gloss);
  let kept = '';
  let rest = text;
  for (let m = matchLeadingParen(rest); m; m = matchLeadingParen(rest)) {
    if (!isGlossRestatement(glossKey(m.inner), glossK)) break;
    if (!glossed.has(term)) {
      glossed.add(term);
      kept += rest.slice(0, m.len); // first gloss: keep verbatim, peel past it
    } // else: a repeat — drop it (don't append)
    rest = rest.slice(m.len);
  }
  return kept + rest;
}

/** Strip every-but-first inline gloss of each glossary term in one prose unit:
 *  a term is glossed on first mention and runs bare after (the tooltip carries
 *  the gloss). Only a parenthetical that restates the term's OWN gloss is ever
 *  removed — qualifiers are always kept. Pure; idempotent, so it's safe to apply
 *  at more than one layer of the prose pipeline. */
export function firstMentionGloss(text: string, matcher: ConceptMatcher | null): string {
  if (!text || !matcher) return text;
  const parts = tokenizeWithMatcher(text, matcher);
  const glossed = new Set<Term>();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.kind !== 'concept' || !p.term) continue;
    const next = parts[i + 1];
    if (next?.kind !== 'text') continue;
    next.value = peelGlosses(next.value, p.term, glossed);
  }
  return parts.map((p) => p.value).join('');
}

const termStyle: JSX.CSSProperties = {
  'text-decoration': 'underline',
  'text-decoration-style': 'dotted',
  'text-decoration-color': '#9ca3af',
  'text-underline-offset': '2px',
  cursor: 'help',
  position: 'relative',
};

const tooltipStyle: JSX.CSSProperties = {
  // Fixed + portaled to <body> so the sidebar's `overflow: auto` (.daf-aside)
  // can't clip it; left/top are set dynamically and clamped to the viewport.
  position: 'fixed',
  'z-index': 1000,
  'max-width': '20rem',
  'min-width': '12rem',
  width: 'max-content',
  background: '#1f2937',
  color: '#f9fafb',
  padding: '0.5rem 0.6rem',
  'border-radius': '5px',
  'box-shadow': '0 4px 12px rgba(0,0,0,0.18)',
  'font-size': '0.78rem',
  'line-height': 1.45,
  'text-align': 'left',
  'white-space': 'normal',
  cursor: 'default',
};

/** A single background-term mention: dotted-underlined, with a gloss tooltip on
 *  hover/focus. The matched text stays in the document flow (copyable).
 *
 *  The tooltip is rendered through a Portal (to <body>) and positioned `fixed`
 *  against the term's live bounding rect. That escapes the sidebar's scroll
 *  clip (`.daf-aside { overflow: auto }`) which was cutting it off; once its
 *  size is known (ref callback at mount) we clamp it inside the viewport and
 *  flip above the term when there isn't room below. */
function ConceptMention(props: { value: string; term: Term }): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [pos, setPos] = createSignal<{ left: number; top: number }>({ left: 0, top: 0 });
  let termRef: HTMLSpanElement | undefined;

  const openTip = (): void => {
    if (termRef) {
      const a = termRef.getBoundingClientRect();
      setPos({ left: a.left, top: a.bottom + 6 }); // initial; place() refines on mount
    }
    setOpen(true);
  };

  // Clamp the tooltip inside the viewport once its size is known. Re-reads the
  // term rect so the vertical flip uses live geometry.
  const place = (el: HTMLSpanElement): void => {
    if (!termRef) return;
    const margin = 8;
    const gap = 6;
    const a = termRef.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    let left = a.left;
    if (left + r.width > window.innerWidth - margin) left = window.innerWidth - margin - r.width;
    if (left < margin) left = margin;
    const below = a.bottom + gap;
    const flipUp =
      below + r.height > window.innerHeight - margin && a.top - gap - r.height > margin;
    setPos({ left, top: flipUp ? a.top - gap - r.height : below });
  };

  // The tooltip reads in the active language's direction: in Hebrew mode the
  // Hebrew term is the heading and the romanization a muted aside (the reverse
  // of English mode), and the meaning is the authored Hebrew gloss.
  const heMode = (): boolean => lang() === 'he';
  const heading = (): string => (heMode() ? props.term.hebrew : termLabel(props.term));
  const subheading = (): string => (heMode() ? (props.term.translit ?? '') : props.term.hebrew);

  return (
    // biome-ignore lint/a11y/useSemanticElements: inline span inside flowing prose; a button element would break text layout and selection/copy
    <span
      ref={termRef}
      style={termStyle}
      tabIndex={0}
      role="button"
      aria-label={`${heading()}: ${termGloss(props.term)}`}
      onMouseEnter={openTip}
      onMouseLeave={() => setOpen(false)}
      onFocus={openTip}
      onBlur={() => setOpen(false)}
    >
      {props.value}
      <Show when={open()}>
        <Portal>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: tooltip body; onClick only stops propagation so a click on the tooltip doesn't trigger the surrounding card's click action */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: tooltip body; onClick only stops propagation — there is no activation behavior to mirror on the keyboard */}
          <span
            ref={place}
            style={{
              ...tooltipStyle,
              'text-align': heMode() ? 'right' : 'left',
              left: `${pos().left}px`,
              top: `${pos().top}px`,
            }}
            dir={heMode() ? 'rtl' : 'ltr'}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ 'font-weight': 600 }} dir={heMode() ? 'rtl' : 'ltr'}>
              {heading()}
            </span>
            <Show when={subheading() && subheading() !== heading()}>
              <span
                dir={heMode() ? 'ltr' : 'rtl'}
                style={{ 'margin-inline-start': '0.35rem', color: '#cbd5e1' }}
              >
                {subheading()}
              </span>
            </Show>
            <span style={{ display: 'block', 'margin-top': '0.25rem', color: '#e5e7eb' }}>
              {termGloss(props.term)}
            </span>
          </span>
        </Portal>
      </Show>
    </span>
  );
}

/** Render `text`, wrapping every occurrence of a known background term as a
 *  gloss-tooltip mention. Reads `props` inside a memo so a late daf background
 *  load (new matcher) re-tokenizes. The matcher is compiled once at the
 *  provider, so this is just a scan per fragment. */
export function ConceptText(props: {
  text: string | undefined | null;
  matcher: ConceptMatcher | null;
}): JSX.Element {
  // Strip every-but-first inline gloss before tokenizing, then tokenize the
  // cleaned text so each remaining mention still gets its tooltip.
  const parts = createMemo(() => {
    const cleaned = firstMentionGloss(props.text ?? '', props.matcher);
    return tokenizeWithMatcher(cleaned, props.matcher);
  });
  return (
    <For each={parts()}>
      {(p) => {
        if (p.kind === 'text' || !p.term) return <Hebraized text={p.value} />;
        return <ConceptMention value={p.value} term={p.term} />;
      }}
    </For>
  );
}
