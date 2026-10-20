import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeDetectorText, screenSource, sourceWords } from './guards.mjs';

const capture = JSON.parse(readFileSync(new URL('./actual-detector-cases.json', import.meta.url)));
const run = (c) => screenSource(c.source, c.hits, normalizeDetectorText, capture.provenance);
test('Actual detector normalization and source spans agree, including pointed text', () => {
  assert(capture.cases.some((c) => c.pointed));
  for (const c of capture.cases) {
    assert.equal(normalizeDetectorText(c.source.text), c.normalized);
    const output = run(c);
    assert.equal(output.length, c.hits.length);
    for (const row of output) {
      assert.equal(row.acceptedIdentity, false);
      assert.equal(row.acceptedEra, false);
      assert(row.alternatives.some((a) => a.kind === 'outside_registry_or_nonperson'));
      if (row.anchor)
        assert.equal(
          Array.from(c.source.text).slice(row.anchor.start, row.anchor.end).join(''),
          row.anchor.quote,
        );
      else assert(row.reviewReasons.includes('normalization_not_reversible'));
    }
  }
});
test('Bible citation, ordinary verse word and school survive as held evidence', () => {
  const rows = capture.cases.flatMap(run);
  for (const reason of [
    'possible_biblical_book_citation',
    'ordinary_word_in_verse_formula',
    'school_or_house_name',
  ]) {
    const row = rows.find((r) => r.reviewReasons.includes(reason));
    assert(row, reason);
    assert.equal(row.status, 'held');
    assert(row.anchor?.quote);
    assert(row.candidates.length);
  }
});
test('Namesake candidates and outside-registry alternative survive together', () => {
  const row = run(capture.cases.find((c) => c.source.ref === 'Arakhin 2b:9'))[0];
  assert.equal(row.candidates.length, 3);
  assert.equal(row.alternatives.length, 1);
  assert.equal(row.historicalIdentityResolved, false);
});
test('A detector range cutting a real punctuation-expanded token stays unplaced', () => {
  let exercised = false;
  for (const c of capture.cases) {
    const words = sourceWords(c.source.text, normalizeDetectorText);
    const i = words?.findIndex((w, n) => n > 0 && words[n - 1].start === w.start) ?? -1;
    if (i < 0) continue;
    // Deliberate detector-metadata fault on unchanged captured source text.
    const hit = { ...c.hits[0], wordIdx: i, len: 1, surface: words[i].word };
    const row = screenSource(c.source, [hit], normalizeDetectorText, capture.provenance)[0];
    assert.equal(row.anchor, null);
    assert(row.reviewReasons.includes('normalization_not_reversible'));
    exercised = true;
    break;
  }
  assert(exercised);
});
test('Corrupt source, detector span and missing provenance are rejected', () => {
  const c = capture.cases[0];
  assert.throws(
    () =>
      screenSource(
        { ...c.source, text: `${c.source.text} ` },
        c.hits,
        normalizeDetectorText,
        capture.provenance,
      ),
    /Source hash/,
  );
  assert.throws(
    () =>
      screenSource(
        c.source,
        [{ ...c.hits[0], wordIdx: 100000 }],
        normalizeDetectorText,
        capture.provenance,
      ),
    /word range/,
  );
  assert.throws(
    () =>
      screenSource(
        c.source,
        [{ ...c.hits[0], surface: '' }],
        normalizeDetectorText,
        capture.provenance,
      ),
    /surface/,
  );
  assert.throws(
    () => screenSource(c.source, c.hits, normalizeDetectorText, {}),
    /Missing detectorSha256/,
  );
});
