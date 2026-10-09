"""Write the rabbi card's "Interactions" data: one small JSON file per sage, for the app to fetch when a card opens.

  python3 pipeline/31_app_interactions.py --identity <folder> [--identity <folder> ...]

A sage gets a file only when the study is sure his name is one man and the app's sage list has exactly one entry for it:
  - two identity readers (26-30 style answers in <folder>/back/<pack>-<reader>/answer.json, with <folder>/<pack>/ids.json or a
    one-name pack) each put at least 85% of the name's placed passages in one group, and no second group of 3+ passages;
  - the sage list (rabbi-places.json) has one entry whose Hebrew name is that name, after folding duplicate entries.
Everyone else keeps the old lineage box until the identity work reaches him.

Each file lists the names most often linked to him in the final pair table (23_pairs_final.py), what the text says between
them (kinds, with direction where a reader recorded it) and the supporting passages per kind. Lone titles are resolved with
data/bare-titles.jsonl the same way 24_name_map.py does. Output: packages/talmud/static/sage-interactions/<slug>.json and
index.json.
"""
import argparse, collections, datetime as dt, glob, importlib.util, json, os, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
DATA = pathlib.Path(os.environ.get('SAGE_NETWORK_DATA') or HERE.parent / 'data')
APP = HERE.parents[2] / 'packages' / 'talmud'
REGISTRY = APP / 'src' / 'lib' / 'data' / 'rabbi-places.json'
DUPLICATES = APP / 'src' / 'lib' / 'data' / 'rabbi-duplicates.json'
OUT = APP / 'static' / 'sage-interactions'
NOT_A_LINK = {'none', 'open', 'same-man', 'one-name'}   # these say nothing between two people
TOP_PARTNERS = 40
MAIN_SHARE, SECOND_GROUP = 0.85, 3

spec = importlib.util.spec_from_file_location('namemap', HERE / '24_name_map.py')
namemap = importlib.util.module_from_spec(spec); spec.loader.exec_module(namemap)


def spelling(name):
    return namemap.spelling(name)


def load_answer(path):
    s = open(path).read()
    try:
        return json.loads(s)
    except json.JSONDecodeError:   # an abbreviation mark (ר"ש) left unescaped inside a string
        return json.loads(re.sub(r'(?<=[א-ת])"(?=[א-ת])', '\\"', s))


def one_man(ans, ids):
    """Per name in this pack: does this reader find one main man behind it?"""
    by_name = collections.defaultdict(list)
    for p in ans.get('people', []):
        per = collections.Counter(ids.get(pid, {}).get('name') for pid in p.get('passages', []))
        for name, n in per.items():
            if name:
                by_name[name].append(n)
    out = {}
    for name, groups in by_name.items():
        groups.sort(reverse=True)
        placed = sum(groups)
        out[name] = placed > 0 and groups[0] / placed >= MAIN_SHARE and sum(g >= SECOND_GROUP for g in groups) == 1
    return out


def sure_names(folders):
    """Names both readers call one man. A pack with no ids.json is a one-name pack whose title is the name."""
    sure = set()
    for folder in folders:
        folder = pathlib.Path(folder)
        packs = sorted({p.parent.name.rsplit('-', 1)[0] for p in folder.glob('back/*/answer.json')})
        for pack in packs:
            ids_path = next((p for p in (folder / pack / 'ids.json', folder / 'packs' / pack / 'ids.json') if p.exists()), None)
            if ids_path is None:
                continue
            ids = json.load(open(ids_path))
            if ids and 'name' not in next(iter(ids.values())):   # the top-200 packs: every passage is the pack's one name
                title = open(ids_path.parent / 'PACK.md').readline().lstrip('# ').strip()
                ids = {k: {'name': spelling(title)} for k in ids}
            verdicts = []
            for reader in ('fable', 'opus'):
                p = folder / 'back' / f'{pack}-{reader}' / 'answer.json'
                if p.exists():
                    verdicts.append(one_man(load_answer(p), ids))
            if len(verdicts) == 2:
                sure |= {n for n in verdicts[0] if verdicts[0][n] and verdicts[1].get(n)}
    # a lone title read as a person ("רב (alone)", "רבי (alone)") stands in the pair table as the bare title itself
    return {n.removesuffix(' (alone)') for n in sure}


def registry_slugs():
    reg = json.load(open(REGISTRY))['rabbis']
    dup = json.load(open(DUPLICATES)).get('duplicates', {})
    fold = lambda s: dup.get(s, s)  # noqa: E731
    by_he = collections.defaultdict(set)
    for slug, v in reg.items():
        he = (v.get('canonicalHe') or '').split(' (')[0].strip()
        if he:
            by_he[spelling(he)].add(fold(slug))
    all_slugs_of = collections.defaultdict(set)   # canonical slug -> itself and every duplicate folded onto it
    for slug in reg:
        all_slugs_of[fold(slug)].add(slug)
    return reg, by_he, all_slugs_of


def collect_links(rows, slug_of, decisions):
    """Combine spelling variants by person, counting each passage once per kind and direction."""
    applied = collections.Counter()
    links = collections.defaultdict(lambda: collections.defaultdict(lambda: {
        'kinds': collections.defaultdict(set), 'out': collections.defaultdict(set),
        'in': collections.defaultdict(set), 'refs': collections.defaultdict(set), 'passages': set()}))
    for r in rows:
        kind = r.get('kind') or 'open'
        if kind in NOT_A_LINK:
            continue
        names = [namemap.resolve_bare(r[k], r['key'], side, decisions, applied)
                 for side, k in enumerate(('a', 'b'))]
        if None in names:
            continue
        a_name, b_name = map(spelling, names)
        if a_name == b_name or (slug_of.get(a_name) and slug_of.get(a_name) == slug_of.get(b_name)):
            continue
        for me, other, my_side in ((a_name, b_name, 'A'), (b_name, a_name, 'B')):
            if me not in slug_of:
                continue
            e = links[slug_of[me]][other]
            ref = r['ref']
            e['passages'].add(ref)
            e['kinds'][kind].add(ref)
            d = r.get('direction')
            if d in ('AB', 'BA'):
                e['out' if d[0] == my_side else 'in'][kind].add(ref)
            e['refs'][kind].add(ref)
    return links


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--identity', action='append', help='a folder of identity packs and readers\' answers')
    ap.add_argument('--refresh-slug', action='append', help='rebuild only this retained person using names already in the shipped index')
    a = ap.parse_args()
    if bool(a.identity) == bool(a.refresh_slug):
        ap.error('choose --identity or --refresh-slug')
    existing = json.loads((OUT / 'index.json').read_text()) if a.refresh_slug else {}
    sure = {spelling(n) for v in existing.values() for n in v.get('nameHes', [v['nameHe']])} if a.refresh_slug else sure_names(a.identity)
    reg, by_he, all_slugs_of = registry_slugs()
    if a.refresh_slug:
        # Keep the already reviewed name-to-person assignments, including a short name
        # absent from canonicalHe. Only reviewed duplicate mappings fold those assignments.
        dup = json.load(open(DUPLICATES))['duplicates']
        slug_of = {}
        for slug, entry in existing.items():
            target = dup.get(slug, slug)
            for name in map(spelling, entry.get('nameHes', [entry['nameHe']])):
                if name in slug_of and slug_of[name] != target:
                    raise ValueError('Conflicting shipped identity: ' + name)
                slug_of[name] = target
        if any(slug not in set(slug_of.values()) for slug in a.refresh_slug):
            raise ValueError('Requested person has no shipped name reading')
    else:
        slug_of = {name: next(iter(by_he[name])) for name in sure if len(by_he.get(name, ())) == 1}
    decisions = namemap.bare_title_decisions()
    with (DATA / 'pairs-final.jsonl').open() as source:
        links = collect_links((json.loads(line) for line in source if line.strip()), slug_of, decisions)
    OUT.mkdir(parents=True, exist_ok=True)
    if not a.refresh_slug:
        for old in OUT.glob('*.json'):
            old.unlink()
    index = existing.copy()
    stamp = dt.date.today().isoformat()
    for slug in sorted(set(a.refresh_slug or slug_of.values())):
        name = reg[slug]['canonicalHe']
        partners = []
        for other, e in links[slug].items():
            total = len(e['passages'])
            other_slug = slug_of.get(other)
            # English label: from the sage list when this Hebrew name has exactly one entry there (a label only, not a claim
            # about who he is); a slug only when the study is also sure the name is one man, so the card can link to him
            only = next(iter(by_he[other])) if len(by_he.get(other, ())) == 1 else None
            label = {'name': reg[only]['canonical']} if only in reg else {}
            partners.append({'nameHe': other, **label, **({'slug': other_slug} if other_slug in reg else {}),
                             'total': total, **{field: {k: len(v) for k, v in e[field].items()} for field in ('kinds', 'out', 'in')},
                             'refs': {k: sorted(v) for k, v in e['refs'].items()}})
        partners.sort(key=lambda p: (-p['total'], p['nameHe']))
        body = {'slug': slug, 'nameHe': name, 'name': reg[slug]['canonical'], 'generated': stamp,
                'about': 'Every passage where this name stands near another name, and what the text says between them. '
                         'Counts are passages. A partner is a name as the text writes it; one name can still stand for more than one man.',
                'partners': partners if a.refresh_slug else partners[:TOP_PARTNERS], 'partnersInAll': len(partners)}
        for s in all_slugs_of[slug]:   # the app may hold either the canonical slug or a duplicate folded onto it
            (OUT / f'{s}.json').write_text(json.dumps(body, ensure_ascii=False, separators=(',', ':')))
            index[s] = {'nameHe': existing.get(s, {}).get('nameHe', name),
                        'nameHes': sorted(n for n, target in slug_of.items() if target == slug),
                        'partners': len(partners)}
    (OUT / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=0, sort_keys=True))
    print(f'names both readers call one man: {len(sure)}; with one sage-list entry: {len(slug_of)}; files: {len(index)}')


if __name__ == '__main__':
    main()
