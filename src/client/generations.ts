/**
 * Standard taxonomy of Talmudic (and post-Talmudic) sages by era and
 * generation. Used by the /api/generations endpoint (server-side schema) and
 * the client-side underline injection + legend. Keep this file plain TS (no
 * DOM), safe to import in both the worker and the client.
 *
 * Color model — a TWO-TIER chronological spectrum:
 *   - Everyone BEFORE the Geonim (Zugim, Tannaim, Amoraim, Savoraim) renders
 *     on a RED spectrum.
 *   - The Geonim and everyone after them (Geonim, Rishonim, Achronim) render
 *     on a BLUE spectrum.
 * Within each tier the shade runs dark (earlier) -> light (later). 'unknown'
 * is a neutral gray. Colors are COMPUTED from each generation's tier + rank
 * (see buildColor below) rather than hand-maintained, so the spectrum can't
 * drift out of order.
 */

export type GenerationId =
  | 'zugim'
  | 'tanna-1' | 'tanna-2' | 'tanna-3' | 'tanna-4' | 'tanna-5' | 'tanna-6'
  | 'amora-ey-1' | 'amora-ey-2' | 'amora-ey-3' | 'amora-ey-4' | 'amora-ey-5'
  | 'amora-bavel-1' | 'amora-bavel-2' | 'amora-bavel-3'
  | 'amora-bavel-4' | 'amora-bavel-5' | 'amora-bavel-6'
  | 'amora-bavel-7' | 'amora-bavel-8'
  | 'savora'
  | 'geonim' | 'rishonim' | 'achronim'
  | 'unknown';

export type GenerationGroup =
  | 'zugim' | 'tanna' | 'amora-ey' | 'amora-bavel' | 'savora'
  | 'geonim' | 'rishonim' | 'achronim'
  | 'unknown';

/** Which spectrum a generation sits on. 'early' = pre-Geonim (red),
 *  'late' = Geonim and after (blue), 'none' = neutral (unknown). */
export type GenerationTier = 'early' | 'late' | 'none';

export interface GenerationInfo {
  id: GenerationId;
  group: GenerationGroup;
  label: string;        // Short display label
  era: string;          // Rough date range
  tier: GenerationTier; // Which color spectrum this generation sits on
  color: string;        // Computed hex color for underline + legend swatch
}

// ---------------------------------------------------------------------------
// Spectrum endpoints. Each tier interpolates dark (earliest) -> light (latest).
// ---------------------------------------------------------------------------
const EARLY_DARK = '#7f1d1d';  // red-900   — earliest pre-Geonim (Zugim)
const EARLY_LIGHT = '#fca5a5'; // red-300   — latest pre-Geonim (Savoraim)
const LATE_DARK = '#1e3a8a';   // blue-900  — earliest post-Talmudic (Geonim)
const LATE_LIGHT = '#93c5fd';  // blue-300  — latest (Achronim)
const NEUTRAL = '#d1d5db';     // gray-300  — unknown

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Linear sRGB interpolation between two hex colors. t in [0, 1]. */
function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

// Seed table: chronological `rank` within each tier drives the shade. EY and
// Bavel amoraim of the same generation share a rank (we don't distinguish them
// by hue). Ranks need not be contiguous — only their min/max per tier matter.
interface GenSeed {
  id: GenerationId;
  group: GenerationGroup;
  label: string;
  era: string;
  tier: GenerationTier;
  rank: number;
}

const SEEDS: GenSeed[] = [
  { id: 'zugim',         group: 'zugim',       label: 'Zugim',           era: 'c. 170 BCE – 10 CE', tier: 'early', rank: 0 },

  { id: 'tanna-1',       group: 'tanna',       label: 'Tanna (1)',       era: 'c. 10 – 80 CE',      tier: 'early', rank: 1 },
  { id: 'tanna-2',       group: 'tanna',       label: 'Tanna (2)',       era: 'c. 80 – 120 CE',     tier: 'early', rank: 2 },
  { id: 'tanna-3',       group: 'tanna',       label: 'Tanna (3)',       era: 'c. 120 – 140 CE',    tier: 'early', rank: 3 },
  { id: 'tanna-4',       group: 'tanna',       label: 'Tanna (4)',       era: 'c. 140 – 165 CE',    tier: 'early', rank: 4 },
  { id: 'tanna-5',       group: 'tanna',       label: 'Tanna (5)',       era: 'c. 165 – 200 CE',    tier: 'early', rank: 5 },
  { id: 'tanna-6',       group: 'tanna',       label: 'Tanna (6)',       era: 'c. 200 – 220 CE',    tier: 'early', rank: 6 },

  // Amoraim — EY and Bavel of the same generation share a chronological rank.
  { id: 'amora-ey-1',    group: 'amora-ey',    label: 'Amora E.Y. (1)',  era: 'c. 220 – 250 CE',    tier: 'early', rank: 7 },
  { id: 'amora-ey-2',    group: 'amora-ey',    label: 'Amora E.Y. (2)',  era: 'c. 250 – 290 CE',    tier: 'early', rank: 8 },
  { id: 'amora-ey-3',    group: 'amora-ey',    label: 'Amora E.Y. (3)',  era: 'c. 290 – 320 CE',    tier: 'early', rank: 9 },
  { id: 'amora-ey-4',    group: 'amora-ey',    label: 'Amora E.Y. (4)',  era: 'c. 320 – 360 CE',    tier: 'early', rank: 10 },
  { id: 'amora-ey-5',    group: 'amora-ey',    label: 'Amora E.Y. (5)',  era: 'c. 360 – 400 CE',    tier: 'early', rank: 11 },

  { id: 'amora-bavel-1', group: 'amora-bavel', label: 'Amora Bavel (1)', era: 'c. 220 – 250 CE',    tier: 'early', rank: 7 },
  { id: 'amora-bavel-2', group: 'amora-bavel', label: 'Amora Bavel (2)', era: 'c. 250 – 290 CE',    tier: 'early', rank: 8 },
  { id: 'amora-bavel-3', group: 'amora-bavel', label: 'Amora Bavel (3)', era: 'c. 290 – 320 CE',    tier: 'early', rank: 9 },
  { id: 'amora-bavel-4', group: 'amora-bavel', label: 'Amora Bavel (4)', era: 'c. 320 – 350 CE',    tier: 'early', rank: 10 },
  { id: 'amora-bavel-5', group: 'amora-bavel', label: 'Amora Bavel (5)', era: 'c. 350 – 375 CE',    tier: 'early', rank: 11 },
  { id: 'amora-bavel-6', group: 'amora-bavel', label: 'Amora Bavel (6)', era: 'c. 375 – 427 CE',    tier: 'early', rank: 12 },
  { id: 'amora-bavel-7', group: 'amora-bavel', label: 'Amora Bavel (7)', era: 'c. 427 – 460 CE',    tier: 'early', rank: 13 },
  { id: 'amora-bavel-8', group: 'amora-bavel', label: 'Amora Bavel (8)', era: 'c. 460 – 500 CE',    tier: 'early', rank: 14 },

  { id: 'savora',        group: 'savora',      label: 'Savora',          era: 'c. 500 – 600 CE',    tier: 'early', rank: 15 },

  // Post-Talmudic — the BLUE tier. Rarely appear in the Bavli text itself;
  // surface mainly when a quoted commentary (Rashi/Tosafot) names a later
  // authority, and — looking ahead — on halacha-mark codifier names.
  { id: 'geonim',        group: 'geonim',      label: 'Geonim',          era: 'c. 589 – 1038 CE',   tier: 'late', rank: 0 },
  { id: 'rishonim',      group: 'rishonim',    label: 'Rishonim',        era: 'c. 1038 – 1500 CE',  tier: 'late', rank: 1 },
  { id: 'achronim',      group: 'achronim',    label: 'Achronim',        era: 'c. 1500 CE –',       tier: 'late', rank: 2 },

  { id: 'unknown',       group: 'unknown',     label: 'Unknown',         era: '',                   tier: 'none', rank: 0 },
];

function tierRange(tier: GenerationTier): [number, number] {
  const ranks = SEEDS.filter((s) => s.tier === tier).map((s) => s.rank);
  return [Math.min(...ranks), Math.max(...ranks)];
}

const EARLY_RANGE = tierRange('early');
const LATE_RANGE = tierRange('late');

function buildColor(tier: GenerationTier, rank: number): string {
  if (tier === 'none') return NEUTRAL;
  const [min, max] = tier === 'early' ? EARLY_RANGE : LATE_RANGE;
  const [dark, light] = tier === 'early' ? [EARLY_DARK, EARLY_LIGHT] : [LATE_DARK, LATE_LIGHT];
  const t = max === min ? 0 : (rank - min) / (max - min);
  return lerpHex(dark, light, t);
}

export const GENERATIONS: GenerationInfo[] = SEEDS.map((s) => ({
  id: s.id,
  group: s.group,
  label: s.label,
  era: s.era,
  tier: s.tier,
  color: buildColor(s.tier, s.rank),
}));

export const GENERATION_BY_ID: Record<GenerationId, GenerationInfo> =
  Object.fromEntries(GENERATIONS.map((g) => [g.id, g])) as Record<GenerationId, GenerationInfo>;

export const GENERATION_IDS: GenerationId[] = GENERATIONS.map((g) => g.id);

/** Hex color for a generation id (falls back to neutral gray). Convenience
 *  wrapper over GENERATION_BY_ID for callers that only need the swatch. */
export function colorForGeneration(id: GenerationId | string | null | undefined): string {
  if (!id) return NEUTRAL;
  return GENERATION_BY_ID[id as GenerationId]?.color ?? NEUTRAL;
}

/** Pick a legible foreground (dark ink vs white) for text drawn on top of a
 *  generation swatch. Uses relative luminance so it tracks the computed
 *  spectrum automatically (no hand-maintained "pale id" list to drift). */
export function legibleTextColor(bgHex: string): string {
  const [r, g, b] = hexToRgb(bgHex);
  // Perceptual luminance (sRGB-weighted, 0..1).
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? '#1f2937' : '#fff';
}

/** Hebrew display label for a generation, derived from its group + index so we
 *  don't maintain parallel strings. Used by the rabbi lineage / tree views
 *  under Hebrew (dir=rtl) where the English `label` would read out of place. */
export function generationLabelHe(info: GenerationInfo): string {
  const m = info.id.match(/-(\d+)$/);
  const n = m ? ` (${m[1]})` : '';
  switch (info.group) {
    case 'zugim': return 'זוגות';
    case 'tanna': return `תנא${n}`;
    case 'amora-ey': return `אמורא א״י${n}`;
    case 'amora-bavel': return `אמורא בבל${n}`;
    case 'savora': return 'סבוראים';
    case 'geonim': return 'גאונים';
    case 'rishonim': return 'ראשונים';
    case 'achronim': return 'אחרונים';
    default: return 'לא ידוע';
  }
}

/**
 * Compact taxonomy prompt text for the AI model — lists generation IDs with
 * their era and representative sages so the model can assign an ID to each
 * rabbi it identifies in the daf. Kept concise to fit in system prompts.
 */
export const GENERATIONS_PROMPT_REFERENCE = `
Generation IDs (use exact strings):
- zugim: c. 170 BCE – 10 CE. Pairs like Hillel & Shammai.
- tanna-1: c. 10–80 CE. Rabban Yochanan ben Zakkai, Rabban Gamliel the Elder.
- tanna-2: c. 80–120 CE. Rabban Gamliel II (of Yavneh), Rabbi Eliezer, Rabbi Yehoshua, Rabbi Akiva.
- tanna-3: c. 120–140 CE. Rabbi Akiva's major students early career. Transitional.
- tanna-4: c. 140–165 CE. Rabbi Meir, Rabbi Yehuda, Rabbi Yose, Rabbi Shimon (bar Yochai), Rabbi Elazar (ben Shammua).
- tanna-5: c. 165–200 CE. Rabbi Yehuda HaNasi (Rebbi), Rabbi Nathan, Rabbi Shimon ben Gamliel.
- tanna-6: c. 200–220 CE. Transitional to Amoraim. Rabbi Chiya, Bar Kappara, Levi, Rabbi Oshaya.
- amora-ey-1: c. 220–250 CE. Rabbi Yochanan (bar Nafcha), Reish Lakish, Rabbi Hoshaya.
- amora-ey-2: c. 250–290 CE. Rabbi Elazar ben Pedat, Rabbi Ammi, Rabbi Assi, Rabbi Abbahu.
- amora-ey-3: c. 290–320 CE. Rabbi Yonah, Rabbi Yose (II), Rabbi Yirmiyah.
- amora-ey-4: c. 320–360 CE. Rabbi Yonah, Rabbi Yose bar Zavida.
- amora-ey-5: c. 360–400 CE. Final Eretz Yisrael generation before Yerushalmi redacted.
- amora-bavel-1: c. 220–250 CE. Rav (Abba Aricha), Shmuel, Karna, Mar Ukva.
- amora-bavel-2: c. 250–290 CE. Rav Huna, Rav Yehuda (bar Yechezkel), Rav Chisda, Rav Nachman, Rav Sheshet, Rabbah bar Bar Chana.
- amora-bavel-3: c. 290–320 CE. Rabbah (bar Nachmani), Rav Yosef, Rav Zeira (after aliyah = ey).
- amora-bavel-4: c. 320–350 CE. Abaye, Rava.
- amora-bavel-5: c. 350–375 CE. Rav Papa, Rav Huna brei d'Rav Yehoshua, Rav Nachman bar Yitzchak.
- amora-bavel-6: c. 375–427 CE. Rav Ashi, Ravina I.
- amora-bavel-7: c. 427–460 CE. Mar bar Rav Ashi (Tavyomi), Rav Acha.
- amora-bavel-8: c. 460–500 CE. Ravina II (final redactor).
- savora: c. 500–600 CE. Post-Talmudic editors.
- geonim: c. 589–1038 CE. Heads of the Babylonian academies (e.g. Rav Sherira Gaon, Rav Hai Gaon, Rav Saadia Gaon). RARE in the Bavli text itself — use ONLY if such a figure is explicitly named.
- rishonim: c. 1038–1500 CE. Medieval commentators (Rashi, Tosafot, Rambam, Ramban, Rif). Use ONLY when the source text NAMES one (e.g. a quoted commentary), never for an Amora.
- achronim: c. 1500 CE onward. Later authorities (e.g. the Shulchan Aruch, Maharsha). Use ONLY when explicitly named.
- unknown: use ONLY if you cannot identify the rabbi or the name matches no known sage.
`.trim();
