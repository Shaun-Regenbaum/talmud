"""Fetch every Hebrew edition of every work in the study, with provenance.

  python3 pipeline/01_fetch.py --list                 # what would be fetched
  python3 pipeline/01_fetch.py --corpus mishnah --limit 2
  python3 pipeline/01_fetch.py                        # everything

Resumable: a unit is fetched only if its file is missing or empty, and files
are written through a temporary name, so an interrupted run never leaves a
half-written record. The manifest is rebuilt from what is on disk, not from
what this run happened to fetch.

Set SAGE_NETWORK_DATA to keep the snapshot outside a git worktree. An earlier
snapshot lived inside one and was deleted with it.
"""
import argparse, concurrent.futures as cf, hashlib, json, os, re, sys, threading, time
import urllib.error, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
import corpora
from textio import DATA, RAW

BASE = 'https://www.sefaria.org/api/'
UA = 'sage-network-study/0.1 (research; +https://github.com/Shaun-Regenbaum/talmud)'
_lock = threading.Lock()


def get(path, tries=5):
    url = BASE + path
    for a in range(1, tries + 1):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):
                return None
            if a == tries:
                raise
            time.sleep(2.0 * a)                  # 429 / 5xx: back off and retry
        except Exception:
            if a == tries:
                raise
            time.sleep(2.0 * a)
    return None


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def works_in(category_path):
    """Titles under a Sefaria category, skipping commentary sub-categories."""
    toc = get('index')
    node = {'contents': toc}
    for name in category_path:
        node = next((c for c in node.get('contents', []) if c.get('category') == name), None)
        if node is None:
            return []
    out = []

    # The minor tractates sit inside the Bavli's category but are their own
    # corpus here, so the Bavli walk steps over them.
    skip = set(corpora.SKIP_CATEGORIES)
    if category_path[-1] != 'Minor Tractates':
        skip.add('Minor Tractates')

    def walk(n):
        for c in n.get('contents', []):
            if 'contents' in c:
                if c.get('category') not in skip:
                    walk(c)
            elif c.get('title') and corpora.wanted(c['title']):
                out.append(c['title'])
    walk(node)
    return out


def hebrew_editions(work):
    """Every distinct Hebrew edition. A vocalised copy of an edition we already
    hold is the same text with vowel marks, which normalisation strips, so it
    would count one witness twice."""
    vs = get('texts/versions/' + urllib.parse.quote(work)) or []
    titles = [(v.get('versionTitle') or '').strip() for v in vs if v.get('language') == 'he']
    titles = [t for t in dict.fromkeys(titles) if t]
    key = lambda t: re.sub(r'[^a-z0-9]', '', t.lower().replace('vocalized', ''))
    plain = {key(t) for t in titles if 'vocalized' not in t.lower()}
    return [t for t in titles if not ('vocalized' in t.lower() and key(t) in plain)]


def chapter_refs(work):
    """(unit label, ref) for every top-level section, from Sefaria's own shape.

    The Bavli is addressed by page side, the Yerushalmi by chapter and halakhah,
    a midrash by chapter, and some works are trees of named parts. Asking the
    Yerushalmi for a page returns nothing, silently, so the shape is read
    rather than assumed.
    """
    shape = get('shape/' + urllib.parse.quote(work))
    if not shape:
        return []
    nodes = shape if isinstance(shape, list) else [shape]
    out = []
    for nd in nodes:
        title = nd.get('title') or work
        ch = nd.get('chapters')
        if not isinstance(ch, list):
            continue
        if ch and isinstance(ch[0], dict):           # a tree of named parts
            for sub in ch:
                st = sub.get('title')
                for i, c in enumerate(sub.get('chapters') or []):
                    if c:
                        out.append((f'{slug(st)}-{i + 1}', f'{st} {i + 1}'))
            continue
        is_daf = nd.get('book') is not None and any(
            k in (nd.get('section') or '') for k in ()) or _is_talmud_daf(nd)
        for i, c in enumerate(ch):
            if not c:
                continue                              # 1a, 1b and other empty slots
            if is_daf:
                daf = f'{i // 2 + 1}{"ab"[i % 2]}'
                out.append((daf, f'{title} {daf}'))
            else:
                out.append((str(i + 1), f'{title} {i + 1}'))
    return out


def _is_talmud_daf(nd):
    # Bavli shapes list one entry per page side, beginning with two empty
    # slots for 1a and 1b, and the title has no "Jerusalem Talmud" prefix.
    ch = nd.get('chapters') or []
    return (len(ch) > 3 and ch[0] == 0 and ch[1] == 0
            and not str(nd.get('title', '')).startswith('Jerusalem Talmud'))


def flatten(text, prefix=''):
    """Nested Sefaria text -> (addresses, segments), keeping each address."""
    addrs, segs = [], []
    if isinstance(text, str):
        if text.strip():
            addrs.append(prefix or '1'); segs.append(text)
    elif isinstance(text, list):
        for i, x in enumerate(text):
            a, s = flatten(x, f'{prefix}:{i + 1}' if prefix else str(i + 1))
            addrs += a; segs += s
    return addrs, segs


def unit_path(corpus, work, edition, unit):
    return os.path.join(RAW, corpus, slug(work), slug(edition), f'{slug(unit)}.json')


def have(path):
    try:
        with open(path) as f:
            return bool(json.load(f).get('nSegments'))
    except Exception:
        return False


def fetch_work(corpus, title):
    got = skipped = 0
    eds = hebrew_editions(title)
    refs = chapter_refs(title)
    # "Tosefta Berakhot (Lieberman)" is a second witness of "Tosefta Berakhot"
    work, tag = title, ''
    if title.endswith(corpora.WITNESS_SUFFIX):
        work, tag = title[:-len(corpora.WITNESS_SUFFIX)], 'Lieberman Edition / '
    for ed0 in eds:
        ed = tag + ed0
        for unit, ref in refs:
            p = unit_path(corpus, work, ed, unit)
            if have(p):
                skipped += 1
                continue
            q = urllib.parse.urlencode({'version': f'hebrew|{ed0}', 'return_format': 'text_only'})
            doc = get(f'v3/texts/{urllib.parse.quote(ref)}?{q}')
            vs = (doc or {}).get('versions') or []
            if not vs:
                continue
            addrs, segs = flatten(vs[0].get('text'))
            if not segs:
                continue
            rec = {
                'corpus': corpus, 'work': work, 'witness': ed, 'unit': unit, 'ref': ref,
                'segments': segs, 'addresses': addrs, 'nSegments': len(segs),
                'sha256': hashlib.sha256(json.dumps(segs, ensure_ascii=False,
                                                    separators=(',', ':')).encode()).hexdigest(),
                'late': work in corpora.LATE,
                'license': vs[0].get('license'), 'versionSource': vs[0].get('versionSource'),
                'capturedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'sourceUrl': 'https://www.sefaria.org/' + urllib.parse.quote(ref),
            }
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p + '.part', 'w') as f:
                json.dump(rec, f, ensure_ascii=False)
            os.replace(p + '.part', p)
            got += 1
    with _lock:
        print(f'  {corpus:16s} {title[:34]:36s} {len(eds)} editions  {len(refs):4d} units  '
              f'+{got} new, {skipped} already here', flush=True)
    return got


def write_manifest():
    """From what is on disk, so it describes the snapshot and not the last run."""
    import glob
    rows = []
    for p in sorted(glob.glob(os.path.join(RAW, '*', '*', '*', '*.json'))):
        try:
            with open(p) as f:
                r = json.load(f)
        except Exception:
            continue
        rows.append({k: r.get(k) for k in ('corpus', 'work', 'witness', 'unit', 'ref',
                                           'nSegments', 'sha256', 'license', 'sourceUrl')})
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, 'manifest.json'), 'w') as f:
        json.dump({'version': 2, 'builtAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                   'note': 'Hebrew and Aramaic only. No translation is used anywhere in this study.',
                   'units': rows}, f, ensure_ascii=False, indent=1)
    return len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--corpus', default=None)
    ap.add_argument('--limit', type=int, default=0, help='first N works per corpus (smoke test)')
    ap.add_argument('--list', action='store_true', help='print the plan and fetch nothing')
    ap.add_argument('--workers', type=int, default=6)
    a = ap.parse_args()
    jobs = []
    for label, path, _, _why in corpora.CORPORA:
        if a.corpus and a.corpus != label:
            continue
        ws = works_in(path)
        if a.limit:
            ws = ws[:a.limit]
        print(f'{label}: {len(ws)} works')
        jobs += [(label, w) for w in ws]
    if a.list:
        for label, w in jobs:
            print('  ', label, '|', w)
        return
    with cf.ThreadPoolExecutor(max_workers=a.workers) as ex:
        list(ex.map(lambda j: fetch_work(*j), jobs))
    print(f'\nmanifest: {write_manifest():,} units on disk')


if __name__ == '__main__':
    main()
