// Audit script: print each segment's Hebrew text alongside heuristic + LLM era
// picks so a human can judge whether the LLM call was right.
import { classifyDaf } from '../src/lib/era/heuristic.ts';
import { extractTalmudContent } from '../src/lib/sefref/alignment/index.ts';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const TARGETS = [
  ['Berakhot', '2a'],
  ['Bava_Metzia', '59b'],
  ['Shabbat', '31a'],
];

function squeeze(s, max) {
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

for (const [tractate, page] of TARGETS) {
  console.log(`\n══════ ${tractate} ${page} ══════`);
  const dafRes = await fetch(`${BASE}/api/daf/${encodeURIComponent(tractate)}/${page}`);
  if (!dafRes.ok) { console.log(`! daf fetch ${dafRes.status}`); continue; }
  const d = await dafRes.json();
  const segs = d.mainSegmentsHe ?? [];
  if (!segs.length) { console.log('! no segments'); continue; }

  const ctx = classifyDaf(segs);
  const lowConf = ctx.segments.filter((s) => s.source === 'register' || s.source === 'stam-default');
  const plain = segs.map((s) => extractTalmudContent(s));
  const enPlain = (d.mainSegmentsEn ?? []).map((s) => extractTalmudContent(s));

  // Call LLM on low-confidence segments (cached on second visit).
  let llmByIdx = new Map();
  if (lowConf.length > 0) {
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
    if (r.ok) {
      console.log(`(LLM: ${data.picks.length} picks in ${Date.now() - t0}ms${data._cached ? ' cached' : ''})`);
      for (const p of data.picks) llmByIdx.set(p.idx, p);
    } else {
      console.log(`! era-llm ${r.status}: ${data.error}`);
    }
  }

  // Print every segment with: index, heuristic pick, LLM pick (if any), text.
  for (const s of ctx.segments) {
    const llm = llmByIdx.get(s.segIdx);
    const finalEra = llm?.era ?? s.era;
    const finalSrc = llm ? 'LLM' : s.source;
    const flag = llm && llm.era !== s.era ? '↺' : ' ';
    console.log(`\n#${String(s.segIdx).padStart(2)}  ${flag} ${finalEra.padEnd(15)} via ${String(finalSrc).padEnd(13)}`);
    console.log(`     heur why: ${s.why}`);
    if (llm) console.log(`     llm why : ${llm.why}`);
    console.log(`     HE: ${squeeze(plain[s.segIdx] || '', 240)}`);
    if (enPlain[s.segIdx]) console.log(`     EN: ${squeeze(enPlain[s.segIdx], 200)}`);
  }
}
