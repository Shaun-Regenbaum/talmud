#!/usr/bin/env node
/**
 * Build the word concordance the reader uses to underline rare words.
 *
 * Input (downloaded, not committed):
 *   - Open Scriptures Hebrew Bible (OSHB), one OSIS XML file per book. It tags
 *     every word with its dictionary form (a Strong's number) and its grammar.
 *   - Open Scriptures Hebrew Lexicon, HebrewStrong.xml: the Hebrew spelling and
 *     a short English meaning for each Strong's number.
 *
 * Output: static/words/index.json (each rare dictionary word with its places)
 * and static/words/<Book>.json, one file per book, in the Sefaria book
 * names the app uses. Each file holds only words whose dictionary form appears
 * RARE_MAX times or fewer in the whole Tanach, and no proper names.
 *
 *   node scripts/build-words.mjs <oshb-dir> <HebrewStrong.xml>
 *
 * Counts are computed over all 39 books, so a word's count is the same in every
 * file. Nothing here calls an AI.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RARE_MAX = 10;

export const OSIS_TO_BOOK = {
  Gen: 'Genesis',
  Exod: 'Exodus',
  Lev: 'Leviticus',
  Num: 'Numbers',
  Deut: 'Deuteronomy',
  Josh: 'Joshua',
  Judg: 'Judges',
  '1Sam': 'I Samuel',
  '2Sam': 'II Samuel',
  '1Kgs': 'I Kings',
  '2Kgs': 'II Kings',
  Isa: 'Isaiah',
  Jer: 'Jeremiah',
  Ezek: 'Ezekiel',
  Hos: 'Hosea',
  Joel: 'Joel',
  Amos: 'Amos',
  Obad: 'Obadiah',
  Jonah: 'Jonah',
  Mic: 'Micah',
  Nah: 'Nahum',
  Hab: 'Habakkuk',
  Zeph: 'Zephaniah',
  Hag: 'Haggai',
  Zech: 'Zechariah',
  Mal: 'Malachi',
  Ps: 'Psalms',
  Prov: 'Proverbs',
  Job: 'Job',
  Song: 'Song of Songs',
  Ruth: 'Ruth',
  Lam: 'Lamentations',
  Eccl: 'Ecclesiastes',
  Esth: 'Esther',
  Dan: 'Daniel',
  Ezra: 'Ezra',
  Neh: 'Nehemiah',
  '1Chr': 'I Chronicles',
  '2Chr': 'II Chronicles',
};

/** Letters only: drop vowels, cantillation, maqaf, and the OSHB "/" prefix splits. */
export function consonants(s) {
  return s.replace(/[֑-ׇ־/]/g, '').replace(/[^א-ת]/g, '');
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** The main dictionary form of a word: the last "/" segment, e.g. "b/7225" -> "7225", "1254 a" -> "1254 a". */
function lemmaOf(lemmaAttr) {
  const segs = lemmaAttr.split('/');
  return segs[segs.length - 1].trim();
}

/** Strong's id ("H1254") for a lemma key ("1254 a"). */
function strongId(key) {
  const m = key.match(/^(\d+)/);
  return m ? `H${m[1]}` : null;
}

/** True when any segment of the morph code is a proper noun (Np). */
function isProperName(morph) {
  return morph
    .replace(/^[HA]/, '')
    .split('/')
    .some((seg) => /^Np/.test(seg));
}

function parseLexicon(xml) {
  const out = new Map();
  for (const m of xml.matchAll(/<entry id="(H\d+)">([\s\S]*?)<\/entry>/g)) {
    const [, id, body] = m;
    const heb = body.match(/<w [^>]*>([^<]+)<\/w>/);
    const def = body.match(/<def>([^<]+)<\/def>/);
    const usage = body.match(/<usage>([^<]+)<\/usage>/);
    out.set(id, {
      h: heb ? decode(heb[1]) : '',
      g: decode((def ? def[1] : usage ? usage[1] : '').trim()),
    });
  }
  return out;
}

function parseBook(xml) {
  const verses = [];
  for (const vm of xml.matchAll(/<verse osisID="([^"]+)">([\s\S]*?)<\/verse>/g)) {
    const [, id, body] = vm;
    const [, ch, v] = id.split('.');
    const words = [];
    for (const wm of body.matchAll(/<w ([^>]*)>([^<]*)<\/w>/g)) {
      const attrs = wm[1];
      const lemma = attrs.match(/lemma="([^"]*)"/)?.[1] ?? '';
      const morph = attrs.match(/morph="([^"]*)"/)?.[1] ?? '';
      words.push({ lemma, morph, text: decode(wm[2]) });
    }
    verses.push({ ch: Number(ch), v: Number(v), words });
  }
  return verses;
}

function main() {
  const [oshbDir, lexPath] = process.argv.slice(2);
  if (!oshbDir || !lexPath) {
    console.error('usage: build-words.mjs <oshb-dir> <HebrewStrong.xml>');
    process.exit(1);
  }
  const lexicon = parseLexicon(readFileSync(lexPath, 'utf8'));
  const books = {};
  const counts = new Map(); // lemma key -> total uses in the Tanach
  const formCounts = new Map(); // `${lemma}|${consonants}` -> uses in this exact spelling

  for (const [osis, name] of Object.entries(OSIS_TO_BOOK)) {
    const verses = parseBook(readFileSync(join(oshbDir, `${osis}.xml`), 'utf8'));
    books[name] = verses;
    for (const verse of verses) {
      for (const w of verse.words) {
        const key = lemmaOf(w.lemma);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        const fk = `${key}|${consonants(w.text)}`;
        formCounts.set(fk, (formCounts.get(fk) ?? 0) + 1);
      }
    }
  }

  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'words');
  mkdirSync(outDir, { recursive: true });
  let flagged = 0;
  let total = 0;
  let noGloss = 0;
  // Every rare dictionary word, with each place it appears. Loaded once, on the
  // first tap, so the per-book files stay small.
  const index = {};
  for (const [name, verses] of Object.entries(books)) {
    const words = {};
    for (const verse of verses) {
      const seen = new Map();
      const list = [];
      for (const w of verse.words) {
        total++;
        const key = lemmaOf(w.lemma);
        const cons = consonants(w.text);
        // k = which occurrence of this letter-string in the verse (1st, 2nd...).
        const k = (seen.get(cons) ?? 0) + 1;
        seen.set(cons, k);
        const c = counts.get(key) ?? 0;
        if (c > RARE_MAX || isProperName(w.morph) || !strongId(key)) continue;
        const entry = lexicon.get(strongId(key));
        if (!entry?.g) noGloss++;
        index[key] ??= { h: entry?.h ?? '', g: entry?.g ?? '', c, o: [] };
        index[key].o.push(`${name} ${verse.ch}:${verse.v}`);
        // [letters, which occurrence in the verse, lemma, uses in this spelling]
        list.push([cons, k, key, formCounts.get(`${key}|${cons}`) ?? 1]);
        flagged++;
      }
      if (list.length) words[`${verse.ch}:${verse.v}`] = list;
    }
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify({ book: name, words }));
  }
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(index));
  console.log(
    `words ${total}, flagged ${flagged} (<= ${RARE_MAX} uses, no names), without gloss ${noGloss}`,
  );
}

main();
