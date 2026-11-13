#!/usr/bin/env node
/**
 * Turn checked word notes into the files the reader loads.
 *
 *   node scripts/build-word-notes.mjs <work-dir>
 *
 * <work-dir> holds out/<Book>_<ch>.verified.json (notes whose quotes were found on
 * Sefaria) and audit/<Book>_<ch>.json (a second reader's verdict on each note,
 * in the same order). A note ships only if the second reader said the quote is
 * about the word, supports the note, and the note is worth showing (strength 2+).
 * Output: static/words/notes/<Book>.json, merged by chapter with what is already there.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const work = process.argv[2];
if (!work) {
  console.error('usage: build-word-notes.mjs <work-dir>');
  process.exit(1);
}
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'words', 'notes');
mkdirSync(outDir, { recursive: true });
const MIN_STRENGTH = Number(process.env.MIN_STRENGTH ?? 2);

let shipped = 0;
let dropped = 0;
for (const f of readdirSync(join(work, 'out')).filter((x) => x.endsWith('.verified.json'))) {
  const base = f.replace('.verified.json', '');
  const auditFile = join(work, 'audit', `${base}.json`);
  if (!existsSync(auditFile)) continue; // never ship a chapter nobody audited
  const { book, chapter, notes } = JSON.parse(readFileSync(join(work, 'out', f), 'utf8'));
  const { verdicts } = JSON.parse(readFileSync(auditFile, 'utf8'));
  const target = join(outDir, `${book}.json`);
  const doc = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : { book, notes: {} };
  for (const key of Object.keys(doc.notes))
    if (key.startsWith(`${chapter}:`)) delete doc.notes[key];
  notes.forEach((n, i) => {
    const v = verdicts[i];
    const ok =
      v &&
      v.verse === n.verse &&
      v.letters === n.letters &&
      v.about_word === 'yes' &&
      v.supports === 'yes' &&
      v.strength >= MIN_STRENGTH;
    if (!ok) {
      dropped++;
      return;
    }
    shipped++;
    const { verse, letters, k, kind, headline, body, sources } = n;
    const key = `${chapter}:${verse}`;
    doc.notes[key] ??= [];
    doc.notes[key].push({
      letters,
      k: k ?? 1,
      kind,
      headline,
      body,
      sources,
    });
  });
  writeFileSync(target, JSON.stringify(doc));
}
console.log(`shipped ${shipped}, dropped ${dropped}`);
