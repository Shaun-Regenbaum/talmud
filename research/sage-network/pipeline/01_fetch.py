"""Fetch every witness of every text in the study, with provenance.

Resumable and idempotent: a work is re-fetched only if its file is absent or
incomplete. Each file records the edition, the source URL, the capture time and
the licence Sefaria reports, so the snapshot can be cited and re-checked. The
manifest carries a SHA-256 over the segment array, matching research/pilot-v1.

  python3 pipeline/01_fetch.py --corpus bavli --limit 2     # smoke test
  python3 pipeline/01_fetch.py --corpus all
"""
import argparse, hashlib, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
import corpora

API = 'https://www.sefaria.org/api/v3/texts/'
RAW = os.path.join(os.path.dirname(__file__), '..', 'data', 'raw')
MANIFEST = os.path.join(os.path.dirname(__file__), '..', 'data', 'manifest.json')


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def fetch(ref, version, tries=4):
    q = urllib.parse.urlencode({'version': f'hebrew|{version}', 'return_format': 'text_only'})
    url = f'{API}{urllib.parse.quote(ref)}?{q}'
    for a in range(1, tries + 1):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None                      # past the end of the work
            if a == tries:
                raise
        except Exception:
            if a == tries:
                raise
        time.sleep(1.5 * a)
    return None


def segments_of(doc):
    vs = (doc or {}).get('versions') or []
    if not vs:
        return None, None
    v = vs[0]
    t = v.get('text')
    if isinstance(t, str):
        t = [t]
    if not isinstance(t, list):
        return None, None
    segs = [x for x in t if isinstance(x, str) and x.strip()]
    return (segs or None), v


def sha(segs):
    return hashlib.sha256(
        json.dumps(segs, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


INDEX = 'https://www.sefaria.org/api/v2/index/'
VERSIONS = 'https://www.sefaria.org/api/texts/versions/'

_WIT_CACHE = {}


def hebrew_witnesses(work, cap=3):
    """Every Hebrew/Aramaic edition Sefaria holds for this work.

    Asked per work rather than hard-coded, because witness titles are not
    shared across corpora: "Wikisource Talmud Bavli" covers the Bavli, while
    each midrash has its own. Taking them all is the point -- the same passage
    in two editions is the strongest evidence that two spellings are one name.
    """
    if work in _WIT_CACHE:
        return _WIT_CACHE[work]
    try:
        with urllib.request.urlopen(VERSIONS + urllib.parse.quote(work), timeout=60) as r:
            vs = json.loads(r.read().decode())
    except Exception:
        vs = []
    out, seen = [], set()
    for v in vs:
        if v.get('language') != 'he':
            continue
        t = (v.get('versionTitle') or '').strip()
        if not t or t in seen:
            continue
        # a vocalized copy of an edition we already have adds nothing but nikud
        if 'Vocalized' in t and any('Vocalized' not in o for o in out):
            continue
        seen.add(t); out.append(t)
    _WIT_CACHE[work] = out[:cap]
    return _WIT_CACHE[work]


def structure(work):
    """Ask Sefaria how a work is divided, rather than assuming.

    The Bavli is addressed by daf (2a, 2b, ...). The Yerushalmi is addressed by
    chapter and halakhah, and asking it for "2a" silently returns nothing for a
    named witness. Midrashim differ again. Reading the index means a wrong
    assumption cannot quietly truncate a text.
    """
    try:
        with urllib.request.urlopen(INDEX + urllib.parse.quote(work), timeout=60) as r:
            d = json.loads(r.read().decode())
    except Exception:
        return {'kind': 'daf', 'lengths': []}
    sch = d.get('schema') or {}
    addr = sch.get('addressTypes') or []
    return {'kind': 'daf' if addr and addr[0] == 'Talmud' else 'sections',
            'lengths': sch.get('lengths') or [], 'depth': sch.get('depth') or 1}


def units_for(work, st):
    """Yield (unit label, full ref) for every addressable unit of a work."""
    if st['kind'] == 'daf':
        n = 2
        while n < 200:
            for side in ('a', 'b'):
                yield 'daf', f'{n}{side}', f'{work} {n}{side}'
            n += 1
        return
    top = (st['lengths'] or [0])[0]
    if not top:                      # unknown extent: walk until it runs dry
        top = 200
    second = st['lengths'][1] if len(st['lengths']) > 1 else 0
    per = max(1, round(second / top)) * 3 if second else 30
    for c in range(1, top + 1):
        for h in range(1, per + 1):
            yield f'ch{c}', f'{c}-{h}', f'{work} {c}:{h}'


def save(corpus, work, witness, unit, segs, meta, src_ref):
    d = os.path.join(RAW, corpus, slug(work), slug(witness))
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, f'{slug(unit)}.json')
    rec = {
        'corpus': corpus, 'work': work, 'witness': witness, 'unit': unit,
        'ref': src_ref, 'segments': segs, 'nSegments': len(segs),
        'sha256': sha(segs),
        'license': (meta or {}).get('license'),
        'versionSource': (meta or {}).get('versionSource'),
        'capturedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'sourceUrl': f'https://www.sefaria.org/{urllib.parse.quote(src_ref)}',
    }
    tmp = p + '.part'
    with open(tmp, 'w') as f:
        json.dump(rec, f, ensure_ascii=False)
    os.replace(tmp, p)                            # never a half-written file
    return rec


def already(corpus, work, witness, unit):
    p = os.path.join(RAW, corpus, slug(work), slug(witness), f'{slug(unit)}.json')
    if not os.path.exists(p):
        return None
    try:
        with open(p) as f:
            r = json.load(f)
        return r if r.get('nSegments') else None
    except Exception:
        return None


def run_paged(corpus, works, witnesses, limit):
    """Bavli and Yerushalmi: walk page by page until the work ends."""
    rows = []
    for w in (works[:limit] if limit else works):
        st = structure(w)
        for wit in (hebrew_witnesses(w) or witnesses):
            got = miss = 0
            group = None
            empty_groups = 0
            for grp, unit, ref in units_for(w, st):
                if grp != group:
                    # a new chapter: blanks at the end of the last one say
                    # nothing about this one, so start counting again
                    if group is not None:
                        empty_groups = empty_groups + 1 if miss and not group_got else 0
                        if empty_groups >= 2:
                            break          # two whole empty chapters = past the end
                    group, miss, group_got = grp, 0, 0
                pre = already(corpus, w, wit, unit)
                if pre:
                    rows.append(pre); got += 1; group_got += 1; miss = 0; continue
                doc = fetch(ref, wit)
                segs, meta = segments_of(doc)
                if not segs:
                    miss += 1
                    if miss >= (4 if st['kind'] == 'daf' else 6):
                        if st['kind'] == 'daf':
                            break                 # tractates really do end
                        continue                  # otherwise just skip to next chapter
                    continue
                miss = 0; got += 1; group_got += 1
                rows.append(save(corpus, w, wit, unit, segs, meta, ref))
            print(f'  {corpus:11s} {w[:28]:30s} {wit[:30]:32s} {st["kind"]:9s} {got:4d} units', flush=True)
    return rows


def run_whole(corpus, works, witnesses, limit):
    """Midrash: fetch the work in one request; Sefaria returns nested text."""
    rows = []
    for w in (works[:limit] if limit else works):
        for wit in witnesses:
            pre = already(corpus, w, wit, 'all')
            if pre:
                rows.append(pre); print(f'  {corpus:11s} {w[:28]:30s} cached'); continue
            doc = fetch(w, wit)
            segs, meta = segments_of(doc)
            if not segs:
                print(f'  {corpus:11s} {w[:28]:30s} {wit[:30]:32s} (not available)'); continue
            rows.append(save(corpus, w, wit, 'all', segs, meta, w))
            print(f'  {corpus:11s} {w[:28]:30s} {wit[:30]:32s} {len(segs):5d} segments', flush=True)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--corpus', default='all',
                    choices=['all', 'bavli', 'yerushalmi', 'midrash'])
    ap.add_argument('--limit', type=int, default=0, help='first N works only (smoke test)')
    a = ap.parse_args()
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    rows = []
    if a.corpus in ('all', 'bavli'):
        rows += run_paged('bavli', corpora.BAVLI, corpora.BAVLI_WITNESSES, a.limit)
    if a.corpus in ('all', 'yerushalmi'):
        rows += run_paged('yerushalmi', list(corpora.yerushalmi_titles()),
                          corpora.YERUSHALMI_WITNESSES, a.limit)
    if a.corpus in ('all', 'midrash'):
        rows += run_paged('midrash', corpora.MIDRASH, corpora.MIDRASH_WITNESSES, a.limit)
    man = {
        'version': 1,
        'builtAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'note': 'Hebrew and Aramaic only. No translation is used anywhere in this study.',
        'units': [{k: r[k] for k in
                   ('corpus', 'work', 'witness', 'unit', 'ref', 'nSegments',
                    'sha256', 'license', 'sourceUrl')} for r in rows],
    }
    with open(MANIFEST, 'w') as f:
        json.dump(man, f, ensure_ascii=False, indent=1)
    print(f'\n{len(rows)} units, manifest -> data/manifest.json')


if __name__ == '__main__':
    main()
