/**
 * @fileoverview Amud (Talmud page-side) adjacency and iteration.
 *
 * A masechet (tractate) runs over consecutive amudim, starting at 2a (no 1a/1b
 * exists in the printed Vilna edition). Each daf has two sides: 'a' (amud
 * aleph, recto) and 'b' (amud beth, verso). The last daf may end on 'a' only
 * (e.g. Berakhot ends at 64a).
 *
 * We number amudim to match Sefaria's 1-indexed Talmud address system
 * (Daf N amud a = 2N-1, amud b = 2N), so Berakhot 64a = 127, matching
 * Sefaria's reported `schema.lengths[0] = 127` for that tractate.
 */

const START_AMUD = '2a' as const;

/**
 * End amud per tractate (lowercased tractate key). Values sourced from
 * Sefaria's `/api/v2/index/{Tractate}` `schema.lengths[0]` converted back to
 * daf-side notation. To add a new tractate, run:
 *   curl -s "https://www.sefaria.org/api/v2/index/{Tractate}" | jq '.schema.lengths[0]'
 * then convert: last_amud = numberToAmud(<that number>).
 */
export const TRACTATE_END_AMUD: Record<string, string> = {
  berakhot: '64a',
  shabbat: '157b',
  eruvin: '105a',
  pesachim: '121b',
  shekalim: '22b',
  yoma: '88a',
  sukkah: '56b',
  beitzah: '40b',
  'rosh hashanah': '35a',
  taanit: '31a',
  megillah: '32a',
  'moed katan': '29a',
  chagigah: '27a',
  yevamot: '122b',
  ketubot: '112b',
  nedarim: '91b',
  nazir: '66b',
  sotah: '49b',
  gittin: '90b',
  kiddushin: '82b',
  'bava kamma': '119b',
  'bava metzia': '119a',
  'bava batra': '176b',
  sanhedrin: '113b',
  makkot: '24b',
  shevuot: '49b',
  'avodah zarah': '76b',
  horayot: '14a',
  zevachim: '120b',
  menachot: '110a',
  chullin: '142a',
  bekhorot: '61a',
  arakhin: '34a',
  temurah: '34a',
  keritot: '28b',
  meilah: '22a',
  niddah: '73a',
};

export function amudToNumber(amud: string): number | null {
  const m = amud.match(/^(\d+)([ab])$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 2) return null;
  return n * 2 + (m[2] === 'a' ? -1 : 0);
}

export function numberToAmud(n: number): string | null {
  if (n < 3) return null;
  const daf = Math.ceil(n / 2);
  const side = n % 2 === 1 ? 'a' : 'b';
  return `${daf}${side}`;
}

/**
 * Amud immediately before or after `daf` within the same tractate, or null if
 * outside bounds (before start / past end) or if the tractate bounds are
 * unknown.
 */
export function adjacentAmud(tractate: string, daf: string, delta: -1 | 1): string | null {
  const end = TRACTATE_END_AMUD[tractate.toLowerCase()];
  if (!end) return null;
  const cur = amudToNumber(daf);
  const endNum = amudToNumber(end);
  const startNum = amudToNumber(START_AMUD);
  if (cur == null || endNum == null || startNum == null) return null;
  const next = cur + delta;
  if (next < startNum || next > endNum) return null;
  return numberToAmud(next);
}

/**
 * Iterate every amud of a tractate from 2a to its end, in order.
 * Yields nothing if the tractate bounds are not registered.
 */
export function* iterAmudim(tractate: string): Generator<string> {
  const end = TRACTATE_END_AMUD[tractate.toLowerCase()];
  if (!end) return;
  const endNum = amudToNumber(end);
  const startNum = amudToNumber(START_AMUD);
  if (endNum == null || startNum == null) return;
  for (let n = startNum; n <= endNum; n++) {
    const a = numberToAmud(n);
    if (a) yield a;
  }
}

export function amudCount(tractate: string): number {
  const end = TRACTATE_END_AMUD[tractate.toLowerCase()];
  if (!end) return 0;
  const endNum = amudToNumber(end);
  const startNum = amudToNumber(START_AMUD);
  if (endNum == null || startNum == null) return 0;
  return endNum - startNum + 1;
}
