// Quick smoke test of the era heuristic against real dafs.
// Run with: bun /Users/shaunie/Documents/Code/talmud/Sandbox/era-smoke.mjs
import { classifyDaf } from '../src/lib/era/heuristic.ts';

const TARGETS = [
  ['Berakhot', '2a'],
  ['Bava_Metzia', '59b'],
  ['Sanhedrin', '7a'],
];

const BASE = process.env.BASE ?? 'http://localhost:5174';

for (const [tractate, page] of TARGETS) {
  const url = `${BASE}/api/daf/${encodeURIComponent(tractate)}/${page}`;
  const res = await fetch(url);
  if (!res.ok) { console.log(`! ${tractate} ${page}: HTTP ${res.status}`); continue; }
  const d = await res.json();
  const segs = d.mainSegmentsHe ?? [];
  if (!segs.length) { console.log(`! ${tractate} ${page}: no segments (source=${d._source})`); continue; }
  const ctx = classifyDaf(segs);

  console.log(`\n=== ${tractate} ${page} (${segs.length} segments, source=${d._source}) ===`);
  const tally = new Map();
  const sources = { speaker: 0, marker: 0, register: 0, 'stam-default': 0, llm: 0 };
  for (const s of ctx.segments) {
    tally.set(s.era, (tally.get(s.era) ?? 0) + 1);
    sources[s.source]++;
  }
  console.log('eras:', [...tally.entries()].map(([k, v]) => `${k}×${v}`).join(' '));
  console.log('signals:', Object.entries(sources).filter(([, v]) => v > 0).map(([k, v]) => `${k}×${v}`).join(' '));
  for (const s of ctx.segments) {
    const trim = s.why.length > 70 ? s.why.slice(0, 67) + '...' : s.why;
    console.log(`  #${String(s.segIdx).padStart(2)}  ${s.era.padEnd(15)}  ${s.source.padEnd(12)}  ${trim}`);
  }
}
