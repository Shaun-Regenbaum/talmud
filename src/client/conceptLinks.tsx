/**
 * Concept-link utilities: wrap mentions of the current daf's background terms
 * (the daf-background.concepts enrichment — legal-concepts / realia /
 * assumed-prior) in prose with a hover tooltip showing the term's gloss.
 *
 * This is the local, same-daf, high-precision half of the concept glossary:
 * the pool is THIS daf's curated background terms, so a match is a term the
 * daf itself defined — no cross-daf identity resolution, no anchoring. The
 * canonical cross-daf glossary (built from the observed-concept backlog) is a
 * later step; this just connects a term a reader meets in the overview/halacha
 * prose to the definition the Background card already produced.
 *
 * Layering: rabbi mentions take priority (RabbiText tokenizes first, then hands
 * its plain-text parts to ConceptAwareText), so a rabbi name is never also
 * tagged as a concept. This module imports only Hebraized — RabbiText imports
 * ConceptAwareText, not the reverse, so there's no cycle.
 *
 * The context value uses ACCESSORS (functions) so Solid tracks reads and
 * consumers re-tokenize when the daf's background terms load async.
 */
import { For, Show, createContext, createMemo, createSignal, useContext, type Accessor, type JSX } from 'solid-js';
import { Hebraized } from './Hebraized';

export interface ConceptTerm {
  term: string;     // English label (the match surface, e.g. "Kohen")
  termHe: string;   // Hebrew script (shown in the tooltip)
  gloss: string;    // 1-2 sentence explanation
  category?: string;
}

/** A compiled term matcher: a regex over the term surfaces + a lowercased
 *  surface -> term map for gloss lookup. Built once per terms array (hoisted to
 *  the provider) rather than per prose fragment. */
export interface ConceptMatcher { re: RegExp; bySurface: Map<string, ConceptTerm> }

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
    <ConceptLinkContext.Provider value={props.value}>
      {props.children}
    </ConceptLinkContext.Provider>
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
  term?: ConceptTerm;
}

/** Compile a whole-word, case-insensitive matcher over the English term labels,
 *  longest-first so "oral law" beats "law". Word boundaries are Unicode-aware
 *  (a term may carry transliteration diacritics, e.g. "ḥerem", that ASCII `\b`
 *  splits wrongly). Null when there's nothing to match. */
export function buildConceptMatcher(terms: ConceptTerm[]): ConceptMatcher | null {
  const bySurface = new Map<string, ConceptTerm>();
  for (const t of terms) {
    const surface = (t.term || '').trim();
    if (surface.length < 2) continue; // 1-char labels are too noisy to link
    const key = surface.toLowerCase();
    // First term to claim a surface wins (deterministic; dedupes repeats).
    if (!bySurface.has(key)) bySurface.set(key, t);
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
export function tokenizeWithMatcher(text: string, matcher: ConceptMatcher | null): ConceptTextPart[] {
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
export function tokenizeConceptMentions(text: string, terms: ConceptTerm[]): ConceptTextPart[] {
  return tokenizeWithMatcher(text, buildConceptMatcher(terms));
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
  position: 'absolute',
  'z-index': 50,
  top: '1.5em',
  left: 0,
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
 *  hover/focus. The matched text stays in the document flow (copyable). */
function ConceptMention(props: { value: string; term: ConceptTerm }): JSX.Element {
  const [open, setOpen] = createSignal(false);
  return (
    <span
      style={termStyle}
      tabindex={0}
      role="button"
      aria-label={`${props.term.term}: ${props.term.gloss}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {props.value}
      <Show when={open()}>
        <span style={tooltipStyle} dir="ltr" onClick={(e) => e.stopPropagation()}>
          <span style={{ 'font-weight': 600 }}>{props.term.term}</span>
          <Show when={props.term.termHe}>
            <span dir="rtl" style={{ 'margin-left': '0.35rem', color: '#cbd5e1' }}>{props.term.termHe}</span>
          </Show>
          <span style={{ display: 'block', 'margin-top': '0.25rem', color: '#e5e7eb' }}>{props.term.gloss}</span>
        </span>
      </Show>
    </span>
  );
}

/** Render `text`, wrapping every occurrence of a known background term as a
 *  gloss-tooltip mention. Reads `props` inside a memo so a late daf background
 *  load (new matcher) re-tokenizes. The matcher is compiled once at the
 *  provider, so this is just a scan per fragment. */
export function ConceptText(props: { text: string | undefined | null; matcher: ConceptMatcher | null }): JSX.Element {
  const parts = createMemo(() => tokenizeWithMatcher(props.text ?? '', props.matcher));
  return (
    <For each={parts()}>{(p) => {
      if (p.kind === 'text' || !p.term) return <Hebraized text={p.value} />;
      return <ConceptMention value={p.value} term={p.term} />;
    }}</For>
  );
}
