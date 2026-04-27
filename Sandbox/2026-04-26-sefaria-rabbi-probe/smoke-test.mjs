#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const URL = process.env.URL ?? 'http://localhost:8787';
const SLUGS = process.argv.slice(2);
const TARGETS = SLUGS.length ? SLUGS : ['rabbi-akiva', 'rav-rechumi-iii'];

async function probe(slug) {
  const t0 = Date.now();
  const url = `${URL}/api/admin/rabbi-enrich-unified/${encodeURIComponent(slug)}`;
  console.log(`\n[${slug}] POST ${url}`);
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { _rawText: text.slice(0, 1000) }; }
  const elapsed = Date.now() - t0;
  return { slug, status: res.status, elapsed, body };
}

const results = [];
for (const slug of TARGETS) {
  const r = await probe(slug);
  results.push(r);

  console.log(`  HTTP ${r.status}  client-elapsed=${r.elapsed}ms  server=${r.body?._ms ?? '?'}ms`);
  if (r.status !== 200) {
    console.log('  ERROR:', r.body?.error ?? '(unknown)');
    if (r.body?.raw) console.log('  RAW:', r.body.raw.slice(0, 400));
    continue;
  }
  const rec = r.body.record;
  console.log(`  promptChars=${r.body._promptChars}  tokens=${JSON.stringify(r.body._usage ?? {})}`);
  console.log(`  canonical:    ${rec.canonical?.en}  /  ${rec.canonical?.he}`);
  console.log(`  generation:   ${rec.generation}    region: ${rec.region}    academy: ${rec.academy}`);
  console.log(`  birth/death:  ${rec.birthYear ?? '?'} → ${rec.deathYear ?? '?'}`);
  console.log(`  prominence:   ${rec.prominence}`);
  console.log(`  orientation:  ${rec.orientation}`);
  console.log(`  characteristics: ${(rec.characteristics ?? []).join(', ')}`);
  console.log(`  primaryTeacher: ${rec.primaryTeacher}`);
  console.log(`  primaryStudent: ${rec.primaryStudent}`);
  console.log(`  teachers (${rec.teachers?.length ?? 0}): ${(rec.teachers ?? []).map((e) => `${e.name}(${e.source}/${e.weight ?? '-'})`).join(', ')}`);
  console.log(`  students (${rec.students?.length ?? 0}): ${(rec.students ?? []).map((e) => `${e.name}(${e.source}/${e.weight ?? '-'})`).join(', ')}`);
  console.log(`  family   (${rec.family?.length ?? 0}): ${(rec.family ?? []).map((e) => `${e.name}[${e.relation}]`).join(', ')}`);
  console.log(`  opposed  (${rec.opposed?.length ?? 0}): ${(rec.opposed ?? []).map((e) => e.name).join(', ')}`);
  console.log(`  influences (${rec.influences?.length ?? 0}): ${(rec.influences ?? []).map((e) => e.name).join(', ')}`);
  console.log(`  events   (${rec.events?.length ?? 0}): ${(rec.events ?? []).join(', ')}`);
  console.log(`  bio.en (${rec.bio?.en?.length ?? 0}c): ${rec.bio?.en?.slice(0, 200)}…`);
}

await writeFile(join(here, 'smoke-test-result.json'), JSON.stringify(results, null, 2));
console.log(`\nfull JSON written to smoke-test-result.json`);
