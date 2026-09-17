/**
 * @fileoverview A counted profile per sage: how much of the Bavli text that
 * names him is law, story, or verse reading.
 *
 * Built from the same Shas-wide pass as the sage index (every segment scored
 * halakha / aggada / midrash / other; every mention resolved to a registry
 * person) and shipped as src/lib/data/rabbi-profile.json. `rabbi.classification`
 * used to ask an LLM for an impression ("halachist"); this answers the same
 * question from counts, with the numbers in the justification.
 *
 * The rule compares a sage's shares to the Bavli baseline (about 74% law, 8%
 * story, 16% verse reading): a sage whose story or verse-reading share is at
 * least LIFT_MIN times the baseline, and above an absolute floor, is an
 * aggadist or exegetist; everyone else is a halachist, the corpus default.
 * Checked against the LLM prompt's own examples: Rabbi Yishmael comes out
 * exegetist, Rabbi Yehoshua ben Levi aggadist, Abaye / Rava / Rav Ashi
 * halachist. Sages with fewer than MIN_SEGMENTS scored mentions get no verdict
 * here and fall through to the model.
 *
 * Caveat carried into the justification: a sage "appears in" a segment even
 * when someone else is telling a story about him, so this measures the kind of
 * passages he is named in, not what he himself said.
 */

import profileData from '../lib/data/rabbi-profile.json';
import { canonicalSlug } from './rabbi-graph';

export type RabbiCategory = 'aggadist' | 'halachist' | 'exegetist';

export interface SageProfile {
  mentions: number;
  unique: number;
  model: number;
  amudim: number;
  tractates: number;
  halakha: number | null;
  aggada: number | null;
  midrash: number | null;
  other: number | null;
  segments: number;
}

interface ProfileDoc {
  version: number;
  generatedAt: string;
  source: string;
  segmentsScored?: number;
  baseline?: { halakha: number; aggada: number; midrash: number; other: number };
  sages: Record<string, SageProfile>;
}

const DOC = profileData as unknown as ProfileDoc;
/** Bavli-wide mean genre probabilities, from the build; the measured values
 *  from the 2026-09-17 pass are the fallback. */
export const BASELINE = DOC.baseline ?? {
  halakha: 0.744,
  aggada: 0.081,
  midrash: 0.157,
  other: 0.018,
};

export const MIN_SEGMENTS = 30;
export const LIFT_MIN = 1.5;
/** Absolute floors so a tiny share cannot win on lift alone. */
export const FLOOR = { aggada: 0.12, midrash: 0.22 };

export function sageProfile(slug: string): SageProfile | null {
  return DOC.sages[canonicalSlug(slug)] ?? null;
}

export interface ProfileVerdict {
  category: RabbiCategory;
  lifts: { halakha: number; aggada: number; midrash: number };
  shares: { halakha: number; aggada: number; midrash: number };
  segments: number;
  mentions: number;
}

/** The counted verdict, or null when the sage has too few scored mentions. */
export function classifyFromProfile(slug: string): ProfileVerdict | null {
  const p = sageProfile(slug);
  if (!p || p.segments < MIN_SEGMENTS) return null;
  if (p.halakha == null || p.aggada == null || p.midrash == null) return null;
  const shares = { halakha: p.halakha, aggada: p.aggada, midrash: p.midrash };
  const lifts = {
    halakha: r2(p.halakha / BASELINE.halakha),
    aggada: r2(p.aggada / BASELINE.aggada),
    midrash: r2(p.midrash / BASELINE.midrash),
  };
  let category: RabbiCategory = 'halachist';
  const agg = lifts.aggada >= LIFT_MIN && shares.aggada >= FLOOR.aggada;
  const mid = lifts.midrash >= LIFT_MIN && shares.midrash >= FLOOR.midrash;
  if (agg && mid) category = lifts.aggada >= lifts.midrash ? 'aggadist' : 'exegetist';
  else if (agg) category = 'aggadist';
  else if (mid) category = 'exegetist';
  return { category, lifts, shares, segments: p.segments, mentions: p.mentions };
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** The producer's output shape ({category, justification}), in the reader's
 *  language, with the numbers a reader can check. */
export function classificationFromProfile(
  slug: string,
  lang: 'en' | 'he' = 'en',
): { category: RabbiCategory; justification: string } | null {
  const v = classifyFromProfile(slug);
  if (!v) return null;
  const { shares } = v;
  const b = BASELINE;
  const justification =
    lang === 'he'
      ? `מתוך ${v.mentions.toLocaleString('en-US')} אזכורים בבבלי, ${pct(shares.halakha)} מהקטעים שבהם הוא נזכר הם הלכה, ${pct(shares.midrash)} דרשת פסוקים ו-${pct(shares.aggada)} אגדה (ממוצע הבבלי: ${pct(b.halakha)} / ${pct(b.midrash)} / ${pct(b.aggada)}); נמדד על הקטעים שבהם הוא נזכר, לא על דבריו שלו.`
      : `Across ${v.mentions.toLocaleString('en-US')} mentions in the Bavli, ${pct(shares.halakha)} of the passages naming him are law, ${pct(shares.midrash)} verse reading and ${pct(shares.aggada)} story (Bavli average ${pct(b.halakha)} / ${pct(b.midrash)} / ${pct(b.aggada)}); measured on the passages he appears in, not on his own statements.`;
  return { category: v.category, justification };
}
