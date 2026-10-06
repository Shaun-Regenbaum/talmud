"""Publish saved passage readings without resolving names into historical people.

Usage: python3 scripts/story-readings/build.py --input /path/to/saved-batch
Input holds manifest.json, inputs/, back/ and earlier/. Original files stay intact.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'packages/talmud/static/story-readings'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def sections(text):
    found = {}
    for m in re.finditer(r'^## (p\d+) · ([^\n]+) \(([^()\n]+)\)\n(.*?)(?=^## |\Z)', text, re.M | re.S):
        pid, ref, corpus, body = m.groups()
        bits = re.split(r'\*\*(Before|PASSAGE|After):\*\* ?', body)
        source = {bits[i]: bits[i+1].strip() for i in range(1, len(bits), 2)}
        if not source.get('PASSAGE'):
            raise ValueError(f'Missing passage: {pid}')
        found[pid] = (ref, corpus, source)
    return found


def validate(row, source):
    issues = []
    if not isinstance(row, dict) or not all(isinstance(row.get(k), list) for k in ('people', 'speech', 'relations', 'unclear')):
        return ['Missing reading fields']
    ids = [p.get('id') for p in row['people']]
    if len(set(ids)) != len(ids) or any(not isinstance(i, str) or not i for i in ids):
        issues.append('Invalid person identifiers')
    for field in ('people', 'speech', 'relations'):
        for i, item in enumerate(row[field]):
            quote = item.get('quote')
            if not isinstance(quote, str) or not quote.strip() or not any(quote in part for part in source.values()):
                issues.append(f'{field}[{i}]: quote not found in source')
            roles = ('speaker', 'addressee') if field == 'speech' else ('a', 'b') if field == 'relations' else ()
            for role in roles:
                if item.get(role) not in ids + (['none', 'unclear'] if field == 'speech' else []):
                    issues.append(f'{field}[{i}]: invalid {role}')
            bases = ('speaker_basis', 'addressee_basis') if field == 'speech' else ('basis',) if field == 'relations' else ()
            if any(item.get(b) not in ('text', 'unambiguous_pronoun', 'context', 'outside') for b in bases):
                issues.append(f'{field}[{i}]: invalid basis')
    return issues


def build(root, out=OUT):
    manifest = read(root / 'manifest.json')
    index, provenance, seen = [], [], set()
    counts = collections.Counter()
    corpora = collections.Counter()
    out.mkdir(parents=True, exist_ok=True)
    for job in manifest['jobs']:
        ident = job['id']
        if not re.fullmatch(r'b\d{3}', ident):
            raise ValueError('Invalid pack identifier')
        source_dir = root / ('earlier' if job['previously_read'] else 'inputs') / ident
        answer_dir = source_dir if job['previously_read'] else root / 'back' / ident
        pack = source_dir / 'PACK.md'
        answer_path = answer_dir / 'answer.json'
        if digest(pack) != job['pack_sha256']:
            raise ValueError(f'{ident}: pack changed')
        if not job['previously_read']:
            receipt = read(answer_dir / 'receipt.json')
            if receipt['answer_sha256'] != digest(answer_path) or receipt['pack_sha256'] != digest(pack):
                raise ValueError(f'{ident}: receipt mismatch')
        source = sections(pack.read_text())
        answer = read(answer_path)
        if set(source) != set(answer):
            raise ValueError(f'{ident}: passage identifiers do not match')
        passages = []
        for pid, (ref, corpus, parts) in source.items():
            key = f'{ident}-{pid}'
            if ref in seen:
                raise ValueError(f'Duplicate source reference: {ref}')
            seen.add(ref)
            row = answer[pid]
            issues = validate(row, parts)
            if issues and not job['previously_read']:
                raise ValueError(f'{key}: {issues}')
            names = list(dict.fromkeys(p['label'] for p in row['people'])) if not issues else []
            entry = {'id': key, 'ref': ref, 'corpus': corpus, 'names': names,
                     'mentions': list(dict.fromkeys(p['quote'] for p in row['people'])) if not issues else [],
                     'counts': {k: len(row[k]) if not issues else 0 for k in ('people', 'speech', 'relations')}}
            index.append(entry)
            passage = {**entry, 'source': {'passage': parts['PASSAGE'], 'before': parts.get('Before',''), 'after': parts.get('After','')},
                       'reading': None if issues else row, 'withheld': bool(issues)}
            if not issues:
                for field in ('people', 'speech', 'relations'):
                    for item in row[field]:
                        item['quoteLocation'] = 'passage' if item['quote'] in parts['PASSAGE'] else 'context'
                    counts[field] += len(row[field])
            else:
                counts['withheldReadings'] += 1
            passages.append(passage)
            corpora[corpus] += 1
        (out / f'{ident}.json').write_text(json.dumps({'pack': ident, 'passages': passages}, ensure_ascii=False, separators=(',', ':'))+'\n')
        provenance.append({'pack': ident, 'sourceSha256': digest(pack), 'answerSha256': digest(answer_path)})
    summary = {'packs': len(manifest['jobs']), 'passages': len(index), 'corpora': dict(corpora), **counts}
    (out / 'index.json').write_text(json.dumps({'summary': summary, 'passages': index}, ensure_ascii=False, separators=(',', ':'))+'\n')
    (out / 'provenance.json').write_text(json.dumps({'manifestSha256': digest(root/'manifest.json'), 'packs': provenance}, separators=(',', ':'))+'\n')
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--input', type=Path, required=True)
    build(p.parse_args().input)
