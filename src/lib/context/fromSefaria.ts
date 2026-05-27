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
import type { ContextItem, ContextSource } from './types.ts';

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
  const label = which === 'rashi' ? 'Rashi' : 'Tosafot';
  return pieces.map((piece, i) => {
    const seg = segOf(keys[i]);
    return item(source, label, which, `${which}:${keys[i] ?? i}`, {
      body: { he: piece },
      segs: seg != null ? [seg] : [],
      via: seg != null ? 'pieceKeys' : undefined,
    });
  });
}

/** Rishonim (Rashba, Ritva, Ramban, …) — whole-daf snippets. */
export function fromRishonim(bundle: RishonimBundle | undefined): ContextItem[] {
  if (!bundle) return [];
  return Object.entries(bundle).map(([label, snip]) =>
    item('sefaria-rishonim', label, 'rishon', `rishon:${label}`, {
      title: { en: label }, body: { he: snip.hebrew, en: snip.english }, url: refUrl(snip.ref),
    }),
  );
}

/** Shulchan Aruch / halachic refs linked to this daf — whole-daf. */
export function fromHalachaRefs(bundle: HalachicRefBundle | undefined): ContextItem[] {
  if (!bundle) return [];
  const out: ContextItem[] = [];
  for (const [ref, snips] of Object.entries(bundle)) {
    const first = snips[0];
    if (!first) continue;
    out.push(item('sefaria-halacha', 'Halacha', 'shulchanAruch', `halacha:${ref}`, {
      title: { en: ref }, body: { he: first.hebrew, en: first.english }, url: refUrl(first.ref ?? ref),
    }));
  }
  return out;
}

/** Mishnayot anchored to the daf — placed on a segment range (0-indexed). */
export function fromMishna(bundle: MishnaBundle | undefined): ContextItem[] {
  if (!bundle) return [];
  return bundle.map((m, i) => {
    const segs: number[] = [];
    for (let s = m.anchorStartSeg; s <= m.anchorEndSeg; s++) segs.push(s);
    return item('sefaria-mishnah', 'Mishnah', 'mishnah', `mishnah:${m.ref ?? i}`, {
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
    return item('sefaria-topic', 'Topic', 'topic', `topic:${t.slug}`, {
      title: { en: t.titleEn ?? t.slug, he: t.titleHe },
      body: en ? { en } : undefined,
      url: `https://www.sefaria.org/topics/${encodeURIComponent(t.slug)}`,
    });
  });
}
