// Smoke test for /api/era-llm. Fetches a daf, runs the local heuristic to find
// low-confidence segments, POSTs them to the worker, prints results.
import { classifyDaf } from '../src/lib/era/heuristic.ts';
import { extractTalmudContent } from '../src/lib/sefref/alignment/index.ts';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const TARGETS = [
  ['Berakhot', '2a'],
  ['Bava_Metzia', '59b'],
];

for (const [tractate, page] of TARGETS) {
  console.log(`\n=== ${tractate} ${page} ===`);
  const dafRes = await fetch(`${BASE}/api/daf/${encodeURIComponent(tractate)}/${page}`);
  if (!dafRes.ok) { console.log(`! daf fetch ${dafRes.status}`); continue; }
  const d = await dafRes.json();
  const segs = d.mainSegmentsHe ?? [];
  if (!segs.length) { console.log('! no segments'); continue; }

  const ctx = classifyDaf(segs);
  const lowConf = ctx.segments.filter((s) => s.source === 'register' || s.source === 'stam-default');
  console.log(`heuristic: ${ctx.segments.length} segments, ${lowConf.length} low-confidence`);
  if (lowConf.length === 0) continue;

  const plain = segs.map((s) => extractTalmudContent(s));
  const payload = lowConf.map((s) => ({
    idx: s.segIdx,
    text: plain[s.segIdx] ?? '',
    before: s.segIdx > 0 ? plain[s.segIdx - 1]?.slice(0, 200) : undefined,
    after: s.segIdx + 1 < plain.length ? plain[s.segIdx + 1]?.slice(0, 200) : undefined,
    heuristicGuess: s.era,
  }));

  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/era-llm/${encodeURIComponent(tractate)}/${page}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ segments: payload }),
  });
  const data = await r.json();
  const elapsed = Date.now() - t0;
  if (!r.ok) {
    console.log(`! era-llm ${r.status}: ${data.error}`);
    if (data.raw) console.log('raw:', data.raw.slice(0, 300));
    continue;
  }
  console.log(`era-llm: ${data.picks.length} picks in ${elapsed}ms${data._cached ? ' (cached)' : ''}`);
  for (const p of data.picks) {
    const heur = ctx.segments.find((s) => s.segIdx === p.idx);
    const same = heur && heur.era === p.era;
    const marker = same ? '·' : '↺';
    console.log(`  #${String(p.idx).padStart(2)} ${marker} heur=${(heur?.era ?? '?').padEnd(15)} llm=${p.era.padEnd(15)} ${p.why}`);
  }
}
