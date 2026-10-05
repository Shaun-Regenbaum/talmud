/**
 * Data and wording for the rabbi card's "Interactions" box.
 *
 * The data is built offline by research/sage-network/pipeline/31_app_interactions.py from the text itself: every
 * passage where this sage's name stands near another name, and what the passage says between them (they argue, one
 * speaks to the other, one passes on the other's teaching...). It lives in static/sage-interactions/<slug>.json and
 * exists only for sages the study is sure are one man behind one name; for anyone else the card keeps the old
 * lineage box.
 */

export type InteractionKind =
  | 'disputes'
  | 'addresses'
  | 'asks'
  | 'before'
  | 'cites'
  | 'explains'
  | 'follows'
  | 'together'
  | 'kin'
  | 'teacher'
  | 'alternative'
  | 'juxtaposed';

export interface Partner {
  nameHe: string;
  /** English label from the sage list, when that Hebrew name has one entry there. A label, not an identification. */
  name?: string;
  /** Set only when the study is also sure this partner's name is one man. */
  slug?: string;
  total: number;
  kinds: Partial<Record<InteractionKind, number>>;
  /** Passages where this sage acts on the partner (speaks to him, passes on his teaching...). */
  out: Partial<Record<InteractionKind, number>>;
  /** Passages where the partner acts on this sage. */
  in: Partial<Record<InteractionKind, number>>;
  refs: Partial<Record<InteractionKind, string[]>>;
}

export interface SageInteractions {
  slug: string;
  nameHe: string;
  name: string;
  generated: string;
  partners: Partner[];
  partnersInAll: number;
}

/** Order, colour and wording of each kind. `mine`/`theirs` name the two directions; kinds without them have none. */
export const KINDS: ReadonlyArray<{
  kind: InteractionKind;
  color: string;
  en: string;
  he: string;
  mine?: { en: string; he: string };
  theirs?: { en: string; he: string };
}> = [
  { kind: 'disputes', color: 'var(--ink-brick)', en: 'argue', he: 'חולקים' },
  {
    kind: 'addresses',
    color: 'var(--ink-blue)',
    en: 'speak to each other',
    he: 'מדברים זה עם זה',
    mine: { en: '{s} speaks to him', he: '{s} אומר לו' },
    theirs: { en: 'he speaks to {s}', he: 'הוא אומר ל{s}' },
  },
  {
    kind: 'asks',
    color: 'var(--ink-blue)',
    en: 'ask each other',
    he: 'שואלים זה את זה',
    mine: { en: '{s} asks him', he: '{s} שואל אותו' },
    theirs: { en: 'he asks {s}', he: 'הוא שואל את {s}' },
  },
  {
    kind: 'before',
    color: 'var(--ink-blue)',
    en: 'sit before each other',
    he: 'יושבים זה לפני זה',
    mine: { en: '{s} sits before him', he: '{s} יושב לפניו' },
    theirs: { en: 'he sits before {s}', he: 'הוא יושב לפני {s}' },
  },
  {
    kind: 'cites',
    color: 'var(--ink-moss)',
    en: 'pass on teachings',
    he: 'אומרים בשם',
    mine: { en: '{s} passes on his teaching', he: '{s} אומר בשמו' },
    theirs: { en: "he passes on {s}'s teaching", he: 'הוא אומר בשם {s}' },
  },
  {
    kind: 'explains',
    color: 'var(--ink-ochre)',
    en: 'explain teachings',
    he: 'מפרשים דברים',
    mine: { en: '{s} explains his teaching', he: '{s} מפרש את דבריו' },
    theirs: { en: "he explains {s}'s teaching", he: 'הוא מפרש את דברי {s}' },
  },
  {
    kind: 'follows',
    color: 'var(--ink-ochre)',
    en: 'rule alike',
    he: 'פוסקים כמותו',
    mine: { en: '{s} rules like him', he: '{s} פוסק כמותו' },
    theirs: { en: 'he rules like {s}', he: 'הוא פוסק כמו {s}' },
  },
  {
    kind: 'teacher',
    color: 'var(--ink-plum)',
    en: 'teacher and student, in the text',
    he: 'רב ותלמיד, בטקסט',
  },
  { kind: 'kin', color: 'var(--ink-plum)', en: 'family, in the text', he: 'קרובי משפחה, בטקסט' },
  { kind: 'together', color: 'var(--ink-slate-light)', en: 'named together', he: 'נזכרים יחד' },
  { kind: 'juxtaposed', color: 'var(--ink-slate-light)', en: 'side by side', he: 'זה לצד זה' },
  {
    kind: 'alternative',
    color: 'var(--ink-slate-light)',
    en: 'one teaching, credited to either',
    he: 'ואיתימא',
  },
];

export interface KindLine {
  kind: InteractionKind;
  color: string;
  label: string;
  n: number;
  /** "Rava speaks to him 13 · he speaks to Rava 27", when a reader recorded the direction. */
  directions: string;
  refs: string[];
}

/** One line per kind this pair has, in KINDS order, worded for `subject` (the card's sage, in the reader's language). */
export function kindLines(p: Partner, subject: string, lang: 'en' | 'he'): KindLine[] {
  const out: KindLine[] = [];
  for (const k of KINDS) {
    const n = p.kinds[k.kind] ?? 0;
    if (n <= 0) continue;
    const parts: string[] = [];
    const mine = p.out[k.kind] ?? 0;
    const theirs = p.in[k.kind] ?? 0;
    if (k.mine && mine > 0) parts.push(`${k.mine[lang].replace('{s}', subject)} ${mine}`);
    if (k.theirs && theirs > 0) parts.push(`${k.theirs[lang].replace('{s}', subject)} ${theirs}`);
    out.push({
      kind: k.kind,
      color: k.color,
      label: lang === 'he' ? k.he : k.en,
      n,
      directions: parts.join(' · '),
      refs: p.refs[k.kind] ?? [],
    });
  }
  return out;
}

/** The coloured segments of a partner's bar: each kind's share of his total. */
export function barSegments(p: Partner): Array<{ color: string; share: number }> {
  const total = KINDS.reduce((s, k) => s + (p.kinds[k.kind] ?? 0), 0);
  if (total <= 0) return [];
  return KINDS.filter((k) => (p.kinds[k.kind] ?? 0) > 0).map((k) => ({
    color: k.color,
    share: (p.kinds[k.kind] ?? 0) / total,
  }));
}

/** The row shows the name as the text writes it, in Hebrew only: mixing an English gloss into a right-to-left row
 *  broke the line up, and the English label adds nothing the card's own header does not. */
export function partnerLabel(p: Partner): string {
  return p.nameHe;
}

const stripNikud = (s: string): string => s.replace(/[֑-ׇ]/g, '').trim();

/** Is this partner also on the page? By slug when both have one, else by the Hebrew name as written. */
export function onThisPage(
  p: Partner,
  pageRabbis: ReadonlyArray<{ slug: string | null; nameHe: string }>,
): boolean {
  const he = stripNikud(p.nameHe);
  return pageRabbis.some(
    (r) => (p.slug && r.slug === p.slug) || (!!r.nameHe && stripNikud(r.nameHe) === he),
  );
}

/** A passage reference such as "Berakhot 56a:2" or "Jerusalem Talmud Berakhot 1:1:2" as a Sefaria link. */
export function sefariaUrl(ref: string): string | null {
  // Some midrash references carry an internal section slug ("Sifra sifra-shemini-chapter-10:5") that Sefaria does
  // not know: show those as plain text rather than a link that may not work.
  if (/[a-z]+-[a-z]+/.test(ref)) return null;
  const m = ref.match(/^(.*?)\s+([\d]+[ab]?(?::\d+)*)$/);
  const book = (m ? m[1] : ref).trim().replace(/\s+/g, '_');
  const loc = m ? m[2].replace(/:/g, '.') : '';
  return `https://www.sefaria.org/${encodeURIComponent(book)}${loc ? `.${loc}` : ''}`;
}

/** Hebrew name as the text writes it, without vowel marks, with ר' spelled out, so "רַבִּי עֲקִיבָא" and "ר' עקיבא" match. */
export function nameKey(he: string): string {
  return stripNikud(he)
    .replace(/^ר'\s+/, 'רבי ')
    .replace(/\s+/g, ' ');
}

let indexPromise: Promise<Map<string, string>> | null = null;

/** The sages that have an Interactions file, by Hebrew name. Loaded once. A name is only in this list when the study
 *  found one man behind it and the sage list has one entry for it, so looking a card up by its name is safe here. */
export function interactionsSlugForName(he: string): Promise<string | null> {
  if (!indexPromise) {
    indexPromise = fetch('/sage-interactions/index.json')
      .then(async (r) => {
        const ct = r.headers.get('content-type') ?? '';
        if (!r.ok || !ct.includes('json')) return new Map<string, string>();
        const idx = (await r.json()) as Record<string, { nameHe?: string }>;
        const m = new Map<string, string>();
        for (const [slug, v] of Object.entries(idx)) {
          if (v.nameHe && !m.has(nameKey(v.nameHe))) m.set(nameKey(v.nameHe), slug);
        }
        return m;
      })
      .catch(() => new Map<string, string>());
  }
  return indexPromise.then((m) => m.get(nameKey(he)) ?? null);
}

export async function fetchSageInteractions(
  slug: string,
  strict = false,
): Promise<SageInteractions | null> {
  try {
    const r = await fetch(`/sage-interactions/${encodeURIComponent(slug)}.json`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Could not load passage records');
    const ct = r.headers.get('content-type') ?? '';
    // The static host falls back to the app shell (HTML) for a missing file: treat that as "no data".
    if (!ct.includes('json')) return null;
    const body = (await r.json()) as SageInteractions;
    if (!Array.isArray(body.partners)) throw new Error('Invalid passage record');
    return body;
  } catch (error) {
    if (strict) throw error;
    return null;
  }
}
