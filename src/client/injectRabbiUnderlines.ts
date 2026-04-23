import type { GenerationId } from './generations';

export interface GenerationRabbi {
  name: string;
  nameHe: string;
  generation: GenerationId;
}

/**
 * Normalize Hebrew for fuzzy matching: drop nikkud/cantillation and common
 * punctuation, collapse whitespace. Keeps letters + geresh variants.
 */
export function normalizeHebrew(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')      // nikkud + cantillation
    .replace(/[.,:;?!"'״׳]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * For each rabbi in the provided list, find every occurrence of their Hebrew
 * name in the tokenized daf HTML and wrap the run of `.daf-word` spans in a
 * `<span class="rabbi-underline rabbi-gen-<id>">` so CSS can render a colored
 * underline. The underline only covers the rabbi's name, not the surrounding
 * text.
 *
 * Matching is word-by-word: the name "ר' אליעזר" is tokenized to
 * ["ר", "אליעזר"] (since our tokenizer splits on whitespace and our
 * normalizer strips geresh). We look for that sequence in consecutive word
 * spans. Matches multiple occurrences per rabbi.
 */
export function injectRabbiUnderlines(html: string, rabbis: GenerationRabbi[]): string {
  if (!html || typeof document === 'undefined' || rabbis.length === 0) return html;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const words = Array.from(doc.body.querySelectorAll<HTMLSpanElement>('.daf-word'));
  if (words.length === 0) return html;

  const normed = words.map((el) => normalizeHebrew(el.textContent ?? ''));

  // Build a list of (normalized-tokens, generation) pairs, longest first so
  // multi-word names match before single-word ones that might be a prefix.
  // `ר` covers `ר'`, `רבי` is the full form. For each candidate we also emit:
  //   - an `אר` variant for the abbreviation `א"ר X` (= "Rabbi X said"),
  //   - prefix-particle variants (ו/ד/ל/כ/ש + רבי) so `ורבי יוסי` underlines,
  //   - a single-token abbreviation like `ארי` / `ריבל` / `רשבי` when the
  //     canonical name matches one of the well-known collapsed forms.
  // Candidate: a token sequence we try to find in `normed`. By default the
  // entire match is underlined, but for context-dependent abbreviations (e.g.
  // `ר"מ` which means Rabbi Meir only in specific phrases) `underlineStart` /
  // `underlineEnd` narrow the underline to a subset of the matched tokens.
  type Candidate = {
    tokens: string[];
    generation: GenerationId;
    rabbiName: string;
    underlineStart?: number;  // default 0
    underlineEnd?: number;    // default tokens.length - 1
  };
  const TITLE_PREFIXES = new Set(['רבי', 'ר', 'רב']);
  const HEBREW_PARTICLES = ['ו', 'ד', 'ל', 'כ', 'ש'];
  // Single-token collapsed abbreviations. Matched against the candidate's
  // canonical token sequence — if the name contains that sequence, add a
  // single-word candidate so `אר"י` / `ריב"ל` / `רשב"י` underline correctly.
  const ABBREV_TOKENS: Array<{ abbrev: string; canonicalTokens: string[] }> = [
    { abbrev: 'ארי',   canonicalTokens: ['רבי', 'יוחנן'] },
    { abbrev: 'ארל',   canonicalTokens: ['ריש', 'לקיש'] },
    { abbrev: 'ארז',   canonicalTokens: ['רבי', 'זירא'] },
    { abbrev: 'ריבל',  canonicalTokens: ['רבי', 'יהושע', 'בן', 'לוי'] },
    { abbrev: 'רשבי',  canonicalTokens: ['רבי', 'שמעון', 'בר', 'יוחאי'] },
  ];
  // Context-dependent abbreviations. The abbreviation by itself (e.g. `ר"מ`
  // → `רמ`) is ambiguous; we only underline it when the surrounding tokens
  // confirm the rabbi. Each rule says: if the canonical name contains
  // `canonicalTokens`, emit a contextual candidate matching `contextTokens`
  // and underline only the range `[underlineStart, underlineEnd]` within it.
  const CONTEXTUAL_ABBREVS: Array<{
    canonicalTokens: string[];
    contextTokens: string[];
    underlineIndex: number;
  }> = [
    // Rabbi Meir — `ר"מ` disambiguated by classic Mishna attribution phrases.
    { canonicalTokens: ['רבי', 'מאיר'], contextTokens: ['דברי', 'רמ'],       underlineIndex: 1 },
    { canonicalTokens: ['רבי', 'מאיר'], contextTokens: ['לדברי', 'רמ'],      underlineIndex: 1 },
    { canonicalTokens: ['רבי', 'מאיר'], contextTokens: ['כדברי', 'רמ'],      underlineIndex: 1 },
    { canonicalTokens: ['רבי', 'מאיר'], contextTokens: ['אמר', 'רמ'],        underlineIndex: 1 },
    { canonicalTokens: ['רבי', 'מאיר'], contextTokens: ['ואמר', 'רמ'],       underlineIndex: 1 },
    { canonicalTokens: ['רבי', 'מאיר'], contextTokens: ['רמ', 'וחכמים'],     underlineIndex: 0 },
    { canonicalTokens: ['רבי', 'מאיר'], contextTokens: ['רמ', 'אומר'],       underlineIndex: 0 },
  ];
  const tokensContainSequence = (tokens: string[], seq: string[]): boolean => {
    if (seq.length === 0 || seq.length > tokens.length) return false;
    for (let i = 0; i <= tokens.length - seq.length; i++) {
      let ok = true;
      for (let j = 0; j < seq.length; j++) {
        if (tokens[i + j] !== seq[j]) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  };
  const candidates: Candidate[] = rabbis
    .flatMap((r) => {
      const tokens = normalizeHebrew(r.nameHe).split(' ').filter(Boolean);
      const base: Candidate = { tokens, generation: r.generation, rabbiName: r.name };
      const variants: Candidate[] = [base];
      // `א"ר X` variant.
      if (tokens.length >= 2 && TITLE_PREFIXES.has(tokens[0])) {
        variants.push({ ...base, tokens: ['אר', ...tokens.slice(1)] });
      }
      // Particle-prefix variants on `רבי` (only — others are ambiguous).
      if (tokens.length >= 2 && tokens[0] === 'רבי') {
        for (const p of HEBREW_PARTICLES) {
          variants.push({ ...base, tokens: [p + 'רבי', ...tokens.slice(1)] });
        }
      }
      // `ר` variant covers the geresh-shorthand form `ר' X`, which normalizes
      // to a bare `ר` first token. Only for `רבי`-prefixed names to avoid
      // adding too many single-character false-positive opportunities.
      if (tokens.length >= 2 && tokens[0] === 'רבי') {
        variants.push({ ...base, tokens: ['ר', ...tokens.slice(1)] });
      }
      // Single-token collapsed abbreviations.
      for (const { abbrev, canonicalTokens } of ABBREV_TOKENS) {
        if (tokensContainSequence(tokens, canonicalTokens)) {
          variants.push({ ...base, tokens: [abbrev] });
        }
      }
      // Context-dependent abbreviations (e.g. `ר"מ` → Rabbi Meir only in
      // certain phrases). Underline narrows to the single abbreviation token.
      for (const rule of CONTEXTUAL_ABBREVS) {
        if (tokensContainSequence(tokens, rule.canonicalTokens)) {
          variants.push({
            ...base,
            tokens: rule.contextTokens,
            underlineStart: rule.underlineIndex,
            underlineEnd: rule.underlineIndex,
          });
        }
      }
      return variants;
    })
    .filter((c) => c.tokens.length > 0 && c.tokens.length <= 5)
    .sort((a, b) => b.tokens.length - a.tokens.length);

  // Track which word indices have already been wrapped so we don't double-wrap
  // when a shorter name is a prefix of a longer one.
  const wrapped = new Uint8Array(words.length);

  // Group consecutive wrapped words by (generation, occurrence) so we wrap
  // once per match, not per word.
  interface Wrap { start: number; end: number; generation: GenerationId; rabbiName: string }
  const wraps: Wrap[] = [];

  for (const c of candidates) {
    const n = c.tokens.length;
    const uStart = c.underlineStart ?? 0;
    const uEnd = c.underlineEnd ?? n - 1;
    for (let i = 0; i <= words.length - n; i++) {
      // Only the tokens within the underline range must be free — context
      // tokens (e.g. דברי before רמ) are allowed to be already wrapped or
      // free, since we don't wrap them. Check the underline window only.
      let clear = true;
      for (let j = uStart; j <= uEnd; j++) {
        if (wrapped[i + j]) { clear = false; break; }
      }
      if (!clear) continue;

      let match = true;
      for (let j = 0; j < n; j++) {
        if (normed[i + j] !== c.tokens[j]) { match = false; break; }
      }
      if (!match) continue;

      // Record the wrap over the underline range and mark those indices only.
      wraps.push({ start: i + uStart, end: i + uEnd, generation: c.generation, rabbiName: c.rabbiName });
      for (let j = uStart; j <= uEnd; j++) wrapped[i + j] = 1;
    }
  }

  if (wraps.length === 0) return html;

  // Apply wraps in DOM order. For each wrap, create a parent span wrapping
  // the contiguous word spans.
  for (const w of wraps) {
    const first = words[w.start];
    const last = words[w.end];
    const parent = first.parentNode;
    if (!parent) continue;

    const wrapperEl = doc.createElement('span');
    wrapperEl.className = `rabbi-underline rabbi-gen-${w.generation}`;
    wrapperEl.setAttribute('data-rabbi', w.rabbiName);

    // Move first..last (inclusive) + any whitespace/text nodes between them
    // into the wrapper. We need to walk siblings from `first` until we hit
    // `last`, collecting nodes, then insert the wrapper at first's position.
    parent.insertBefore(wrapperEl, first);
    const nodesToMove: Node[] = [];
    let current: Node | null = first;
    while (current) {
      nodesToMove.push(current);
      if (current === last) break;
      current = current.nextSibling;
    }
    for (const n of nodesToMove) wrapperEl.appendChild(n);
  }

  return doc.body.innerHTML;
}
