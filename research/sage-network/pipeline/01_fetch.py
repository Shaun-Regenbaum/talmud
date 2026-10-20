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


class AmbiguousShape(ValueError):
    """The shape could be Talmud pages but the index does not say so, and nothing is guessed."""


class ResponseMismatch(ValueError):
    """Sefaria answered a different reference or edition than the one asked for."""


def index_address_types(index, work):
    """{full node title: addressTypes} for every text node of a Sefaria index record.

    A default node keeps the work's title; a named node adds its English title
    after a comma, as Sefaria writes it ("Mekhilta DeRabbi Shimon Ben Yochai,
    Additions").
    """
    out = {}

    def walk(node, title):
        if node.get('nodes'):
            for sub in node['nodes']:
                if sub.get('default') or sub.get('key') == 'default':
                    walk(sub, title)
                else:
                    name = next((t['text'] for t in sub.get('titles') or []
                                 if t.get('lang') == 'en' and t.get('primary')), sub.get('key'))
                    walk(sub, f'{title}, {name}')
        elif node.get('addressTypes'):
            out[title] = list(node['addressTypes'])
    walk((index or {}).get('schema') or {}, work)
    return out


def chapter_refs(work, fetch=None):
    """(unit label, ref) for every top-level section, from Sefaria's own shape.

    The Bavli is addressed by page side, the Yerushalmi by chapter and halakhah,
    a midrash by chapter, and some works are trees of named parts. Asking the
    Yerushalmi for a page returns nothing, silently, so the shape is read
    rather than assumed. Whether a node is Talmud pages comes from the index's
    address types. A named part that the work's shape leaves out (Mekhilta
    DeRabbi Shimon's Additions) is found in the index and read by its own title.
    """
    fetch = fetch or get
    types = index_address_types(fetch('v2/raw/index/' + urllib.parse.quote(work)), work)
    shape = fetch('shape/' + urllib.parse.quote(work))
    if not shape:
        return []
    out, seen = [], set()
    for nd in (shape if isinstance(shape, list) else [shape]):
        _walk_shape(nd, nd.get('title') or work, out, types, seen)
    for title in sorted(set(types) - seen):
        part = fetch('shape/' + urllib.parse.quote(title))
        for nd in (part if isinstance(part, list) else [part] if part else []):
            _walk_shape(dict(nd, _named=True), title, out, types, seen)
    return out


def _walk_shape(nd, title, out, types=None, seen=None):
    """Collect (unit, ref) from one shape node, at any depth.

    `chapters` comes in three forms. A list of numbers: the node's sections. A
    list of nodes: a tree of named parts, each walked in turn. A single number:
    a named part that is one block of text, fetched whole by its own title.
    Sifra is 278 such blocks, and treating that number as a list is what
    stopped the first full run.
    """
    if seen is not None:
        seen.add(title)
    ch = nd.get('chapters')
    if isinstance(ch, int):
        if ch:
            out.append((slug(title), title))
        return
    if not isinstance(ch, list):
        return
    if ch and isinstance(ch[0], dict):
        for sub in ch:
            sub = dict(sub, _named=True)
            _walk_shape(sub, sub.get('title') or title, out, types, seen)
        return
    is_daf = _is_talmud_daf(nd, (types or {}).get(title))
    for i, c in enumerate(ch):
        if not c:
            continue                              # 1a, 1b and other empty slots
        if is_daf:
            daf = f'{i // 2 + 1}{"ab"[i % 2]}'
            out.append((daf, f'{title} {daf}'))
        else:
            out.append((f'{slug(title)}-{i + 1}' if nd.get('_named') else str(i + 1), f'{title} {i + 1}'))


def _is_talmud_daf(nd, address_types=None):
    """Talmud page sides, as the index's first address type says.

    An earlier rule guessed pages from two empty slots at the start of the
    shape. Sifrei Zuta and Mekhilta DeRabbi Shimon also start with empty slots
    (their text begins at Numbers 5 and Exodus 3), so they were fetched as
    pages, and Sefaria answered each "page" with the whole book. Without an
    address type, a shape that could be pages is refused rather than guessed.
    """
    if address_types:
        return address_types[0] == 'Talmud'
    ch = nd.get('chapters') or []
    if len(ch) > 1 and ch[0] == 0 and ch[1] == 0:
        raise AmbiguousShape(f'{nd.get("title")}: the shape starts with empty slots and the index gives no address type')
    return False


def response_problem(doc, ref, edition):
    """Why a text response cannot be saved as `ref` in `edition`, or None.

    Sefaria answers a reference it cannot place with a wider one: "Sifrei Zuta
    3a" came back as "Sifrei Zuta", the whole book. Only the reference and the
    edition that were asked for are kept.
    """
    if not doc:
        return 'no response'
    got = (doc.get('ref') or '').strip()
    if got != ref.strip():
        return f'asked for {ref!r}, Sefaria answered {got!r}'
    vs = doc.get('versions') or []
    if vs and (vs[0].get('versionTitle') or '').strip() != edition.strip():
        return f'asked for edition {edition!r}, Sefaria answered {vs[0].get("versionTitle")!r}'
    return None


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
            problem = response_problem(doc, ref, ed0)
            if problem:
                raise ResponseMismatch(f'{work} | {ed} | {unit}: {problem}')
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
    ap.add_argument('--work', action='append', default=[], help='fetch only this work (repeatable)')
    ap.add_argument('--list', action='store_true', help='print the plan and fetch nothing')
    ap.add_argument('--check', action='store_true',
                    help='read every work\'s shape and editions, fetch no text, and report '
                         'any work that would yield nothing')
    ap.add_argument('--workers', type=int, default=6)
    a = ap.parse_args()
    jobs = []
    for label, path, _, _why in corpora.CORPORA:
        if a.corpus and a.corpus != label:
            continue
        ws = works_in(path)
        if a.work:
            ws = [w for w in ws if w in a.work]
        if a.limit:
            ws = ws[:a.limit]
        print(f'{label}: {len(ws)} works')
        jobs += [(label, w) for w in ws]
    if a.list:
        for label, w in jobs:
            print('  ', label, '|', w)
        return
    if a.check:
        # Cheap, and it would have caught the shape that ended the first full
        # run: every work is parsed before an hour is spent on any of them.
        def probe(job):
            try:
                return job, len(chapter_refs(job[1])), len(hebrew_editions(job[1])), None
            except Exception as e:                # noqa: BLE001
                return job, 0, 0, f'{type(e).__name__}: {e}'
        with cf.ThreadPoolExecutor(max_workers=a.workers) as ex:
            rows = list(ex.map(probe, jobs))
        bad = [r for r in rows if r[3] or not r[1] or not r[2]]
        units = sum(r[1] * r[2] for r in rows)
        print(f'{len(rows)} works, about {units:,} requests to fetch them all')
        for (label, w), n, e, err in bad:
            print(f'  PROBLEM {label} | {w}: units={n} editions={e} {err or ""}')
        print('every work has units and an edition' if not bad else f'{len(bad)} work(s) need a look')
        return
    failures = []

    def guarded(job):
        # One work with an unexpected shape once ended a whole run and took the
        # remaining works with it. A failure is recorded and the run goes on.
        try:
            return fetch_work(*job)
        except Exception as e:                    # noqa: BLE001
            with _lock:
                failures.append({'corpus': job[0], 'work': job[1], 'error': f'{type(e).__name__}: {e}'})
                print(f'  FAILED {job[0]} | {job[1]}: {type(e).__name__}: {e}', flush=True)
            return 0

    with cf.ThreadPoolExecutor(max_workers=a.workers) as ex:
        list(ex.map(guarded, jobs))
    print(f'\nmanifest: {write_manifest():,} units on disk')
    with open(os.path.join(DATA, 'fetch-failures.json'), 'w') as f:
        json.dump(failures, f, ensure_ascii=False, indent=1)
    if failures:
        print(f'{len(failures)} work(s) FAILED and are listed in fetch-failures.json:')
        for x in failures:
            print('  ', x['corpus'], '|', x['work'], '|', x['error'])
        sys.exit(1)


if __name__ == '__main__':
    main()
