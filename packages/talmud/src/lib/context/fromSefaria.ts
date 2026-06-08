/**
 * @fileoverview Map the worker's Sefaria context bundles into ContextItems.
 *
 * Pure functions. Commentary piece TEXT and Mishnayot arrive already placed on
 * segments (`via` set); Rishonim, Shulchan Aruch refs, and topics are whole-daf
 * (`segs: []`).
 */

import type {
  TalmudPageData, RishonimBundle, HalachicRefBundle, MishnaBundle, SefariaTopicBundle,
} from '../sefref/sefaria/client.ts';
import type { ContextItem } from '@corpus/core/context/types';
import { sourceLabel, type ContextSource } from './sources.ts';

function item(source: ContextSource, label: string, kind: string, key: string, fields: Partial<ContextItem>): ContextItem {
  return { source, sourceLabel: label, kind, key, segs: [], ...fields };
}

function refUrl(ref: string | undefined): string | undefined {
  return ref ? `https://www.sefaria.org/${encodeURIComponent(ref.replace(/ /g, '_'))}` : undefined;
}

function segOf(key: string | undefined): number | null {
  if (!key) return null;
  const s = parseInt(key.split(':')[0], 10);
  return Number.isFinite(s) ? s - 1 : null; // 1-based -> 0-based
}

/** Rashi / Tosafot piece TEXT, one item per piece, placed on its segment via
 *  the parallel "S:P" pieceKeys. */
export function fromCommentaryPieces(
  which: 'rashi' | 'tosafot',
  data: TalmudPageData['rashi'] | TalmudPageData['tosafot'] | undefined,
): ContextItem[] {
  const pieces = data?.pieces ?? [];
  const keys = data?.pieceKeys ?? [];
  if (pieces.length === 0) return [];
  const source: ContextSource = which === 'rashi' ? 'sefaria-rashi' : 'sefaria-tosafot';
  const label = sourceLabel(source);
  return pieces.map((piece, i) => {
    const seg = segOf(keys[i]);
    return item(source, label, which, `${which}:${keys[i] ?? i}`, {
      body: { he: piece },
      segs: seg != null ? [seg] : [],
      via: seg != null ? 'pieceKeys' : undefined,
    });
  });
}

/** Inclusive 0-indexed segment range, dropping negatives. */
function segArr(start: number, end: number): number[] {
  const out: number[] = [];
  for (let s = Math.max(0, start); s <= end; s++) out.push(s);
  return out;
}

/** Rishonim (Rashba, Ritva, Rosh, …) — one item per comment, anchored to the
 *  daf segment(s) Sefaria links it to (`via: 'sefaria-link'`). */
export function fromRishonim(bundle: RishonimBundle | undefined): ContextItem[] {
  if (!bundle) return [];
  return bundle.map((c, i) => {
    const segs = segArr(c.segStart, c.segEnd);
    return item('sefaria-rishonim', c.label, 'rishon', `rishon:${c.ref || i}`, {
      title: { en: c.label }, body: { he: c.hebrew, en: c.english }, url: refUrl(c.ref),
      segs, via: segs.length ? 'sefaria-link' : undefined,
    });
  });
}

/** Halachic codifications (Mishneh Torah, Shulchan Aruch, …) linked to this daf
 *  — one item per ref, anchored to its segment when Sefaria gives an anchorRef. */
export function fromHalachaRefs(bundle: HalachicRefBundle | undefined): ContextItem[] {
  if (!bundle) return [];
  const out: ContextItem[] = [];
  for (const [book, snips] of Object.entries(bundle)) {
    snips.forEach((s, i) => {
      const segs = s.segStart != null && s.segEnd != null ? segArr(s.segStart, s.segEnd) : [];
      out.push(item('sefaria-halacha', sourceLabel('sefaria-halacha'), 'halachaRef', `halacha:${s.ref || `${book}:${i}`}`, {
        title: { en: s.ref || book }, body: { he: s.hebrew, en: s.english }, url: refUrl(s.ref),
        segs, via: segs.length ? 'sefaria-link' : undefined,
      }));
    });
  }
  return out;
}

/** Mishnayot anchored to the daf — placed on a segment range (0-indexed). */
export function fromMishna(bundle: MishnaBundle | undefined): ContextItem[] {
  if (!bundle) return [];
  return bundle.map((m, i) => {
    const segs: number[] = [];
    for (let s = m.anchorStartSeg; s <= m.anchorEndSeg; s++) segs.push(s);
    return item('sefaria-mishnah', sourceLabel('sefaria-mishnah'), 'mishnah', `mishnah:${m.ref ?? i}`, {
      title: { en: m.ref }, body: { he: m.hebrew, en: m.english }, url: refUrl(m.ref),
      segs, via: 'mishnah',
    });
  });
}

/** Sefaria topic tags + their cross-Shas sources — whole-daf. */
export function fromTopics(bundle: SefariaTopicBundle | undefined): ContextItem[] {
  if (!bundle) return [];
  return bundle.map((t) => {
    const sources = t.sources?.slice(0, 8).map((s) => s.ref).join(', ');
    const en = [t.description, sources && `Sources: ${sources}`].filter(Boolean).join('\n');
    return item('sefaria-topic', sourceLabel('sefaria-topic'), 'topic', `topic:${t.slug}`, {
      title: { en: t.titleEn ?? t.slug, he: t.titleHe },
      body: en ? { en } : undefined,
      url: `https://www.sefaria.org/topics/${encodeURIComponent(t.slug)}`,
    });
  });
}
