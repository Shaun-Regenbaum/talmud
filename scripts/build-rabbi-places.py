#!/usr/bin/env python3
"""
Scrape Sefaria's PersonTopic entries, extract place mentions from each bio
description, and emit a pre-computed rabbi → places JSON file consumed by
the worker's /api/rabbi-places endpoint.

Approach:
  1. GET /api/topics?type=person — pulls every PersonTopic (~1900 today).
  2. For each topic with an English description, scan the prose for any of
     our known Talmudic city aliases (same list GeographyMap.tsx uses).
  3. Also pull in all spelling variants from `titles[]` so we can reverse-
     lookup from any name Kimi/LLMs emit.
  4. Emit `src/client/rabbiPlaces.json` with:
        { rabbis: { <slug>: { canonical, aliases, places, region, numSources, description, image? } } }

Run:  python3 scripts/build-rabbi-places.py
"""

import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_PATH = REPO / 'src' / 'lib' / 'data' / 'rabbi-places.json'

# City → region lookup. Aliases are case-insensitive substrings we'll try to
# match inside the English bio prose. Order matters only for display.
CITY_ALIASES = {
    # Eretz Yisrael
    'Tyre':         ('israel', ['tyre']),
    'Gush Halav':   ('israel', ['gush halav', 'gush chalav', 'giscala', 'gischala']),
    "Peki'in":      ('israel', ["peki'in", 'pekiin']),
    'Tiberias':     ('israel', ['tiberias', 'teveria']),
    'Arbel':        ('israel', ['arbel']),
    'Sikhnin':      ('israel', ['sikhnin', 'sogane']),
    'Tzipori':      ('israel', ['tzipori', 'sepphoris', 'zippori', 'sippori']),
    'Usha':         ('israel', ['usha']),
    "Beit She'an":  ('israel', ["beit she'an", 'beit shean', 'beit shan', 'beth shan', 'scythopolis']),
    'Caesarea':     ('israel', ['caesarea', 'kisrin', 'kisarya']),
    'Shechem':      ('israel', ['shechem', 'nablus']),
    'Bnei Brak':    ('israel', ['bnei brak', 'bene berak', 'benei berak']),
    'Lod':          ('israel', ['lod', 'lydda']),
    'Yavneh':       ('israel', ['yavneh', 'jamnia', 'jabneh']),
    'Jerusalem':    ('israel', ['jerusalem', 'yerushalayim']),
    'Tekoa':        ('israel', ['tekoa']),
    # Bavel
    'Nisibis':      ('bavel',  ['nisibis', 'netzivin']),
    'Pumbedita':    ('bavel',  ['pumbedita', 'pumbeditha']),
    'Pum Nahara':   ('bavel',  ['pum nahara', 'pum nehara']),
    'Nehardea':     ('bavel',  ['nehardea', 'nehardeah', "neharde'a"]),
    'Hini':         ('bavel',  ['hini']),
    'Sichra':       ('bavel',  ['sichra', 'shikra']),
    'Ctesiphon':    ('bavel',  ['ctesiphon']),
    'Mehoza':       ('bavel',  ['mehoza', 'mahoza', 'machuza']),
    'Sura':         ('bavel',  ['sura']),
    'Mata Mehasya': ('bavel',  ['mata mehasya', 'mata mahasya']),
    'Naresh':       ('bavel',  ['naresh', 'narash']),
    'Kafri':        ('bavel',  ['kafri']),
    'Shekanziv':    ('bavel',  ['shekanziv', 'shikanzib']),
}

# Region-level cues when no specific city matched. Same patterns as
# GeographyMap.classifyLocation so the two agree.
REGION_PATTERNS = {
    'bavel': re.compile(r'\b(bavel|babylon|babylonia|babylonian|mesopotamia|parthia|persia|persian)\b', re.I),
    'israel': re.compile(r'\b(eretz[- ]?yisrael|eretz[- ]?israel|land of israel|judea|judean|galilee|galilean|galil|samaria|samarian|palestine|palestinian|golan|levant|ereẓ yisrael)\b', re.I),
}


def http_get(url: str, retries: int = 3, timeout: int = 30) -> bytes:
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'talmud-site-scraper'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f'failed to GET {url}: {last_err}')


def extract_places(bio: str) -> tuple[list[str], str | None]:
    """Return (cities_found, region_hint). Cities returned preserve the
    order they first appear in the bio."""
    cities: list[str] = []
    seen = set()
    low = bio.lower()
    for city, (_region, aliases) in CITY_ALIASES.items():
        for a in aliases:
            if a.lower() in low and city not in seen:
                cities.append(city)
                seen.add(city)
                break
    # Region hint if no city matched.
    region: str | None = None
    if cities:
        region = CITY_ALIASES[cities[0]][0]
    else:
        for r, rx in REGION_PATTERNS.items():
            if rx.search(bio):
                region = r
                break
    return cities, region


def main() -> int:
    print('Fetching PersonTopic list from Sefaria…')
    raw = http_get('https://www.sefaria.org/api/topics?type=person&limit=3000')
    topics = json.loads(raw.decode('utf-8'))
    print(f'  {len(topics)} person topics')

    entries: dict[str, dict] = {}
    with_places = 0
    region_only = 0

    for i, t in enumerate(topics):
        slug = t.get('slug')
        if not slug:
            continue
        desc = (t.get('description') or {}).get('en') or ''
        cities, region = extract_places(desc)

        # Collect every English title variant (primary + alternates).
        aliases: list[str] = []
        for title in t.get('titles') or []:
            txt = (title.get('text') or '').strip()
            if title.get('lang') == 'en' and txt and txt not in aliases:
                aliases.append(txt)

        # Skip topics with no place signal AND no bio — they're not useful.
        if not cities and not region and not desc:
            continue

        entries[slug] = {
            'canonical': (t.get('primaryTitle') or {}).get('en') or slug,
            'canonicalHe': (t.get('primaryTitle') or {}).get('he'),
            'aliases': aliases,
            'places': cities,
            'region': region,
            'numSources': t.get('numSources'),
            'generation': ((t.get('properties') or {}).get('generation') or {}).get('value')
                          if isinstance((t.get('properties') or {}).get('generation'), dict)
                          else (t.get('properties') or {}).get('generation'),
            'bio': desc[:800] if desc else None,
            'image': ((t.get('image') or {}).get('image_uri')),
            'wiki': (((t.get('properties') or {}).get('enWikiLink') or {}).get('value')
                     if isinstance((t.get('properties') or {}).get('enWikiLink'), dict)
                     else (t.get('properties') or {}).get('enWikiLink')),
        }
        if cities:
            with_places += 1
        elif region:
            region_only += 1

        if (i + 1) % 200 == 0:
            print(f'  …processed {i + 1}/{len(topics)}')

    print(f'Matched specific city: {with_places}')
    print(f'Region-only:           {region_only}')
    print(f'No place signal:       {len(entries) - with_places - region_only}')
    print(f'Total entries written: {len(entries)}')

    # Also build an alias → slug index so the worker can resolve an arbitrary
    # name string (e.g. "Rav Huna") to its canonical slug.
    alias_index: dict[str, str] = {}
    def add_alias(s: str, slug: str) -> None:
        key = s.lower().strip()
        if not key:
            return
        # First-wins: don't clobber an existing canonical mapping.
        alias_index.setdefault(key, slug)

    for slug, e in entries.items():
        add_alias(e['canonical'], slug)
        for a in e['aliases']:
            add_alias(a, slug)
        # Also add the slug itself so matching can go either way.
        add_alias(slug.replace('-', ' '), slug)

    out = {
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'source': 'https://www.sefaria.org/api/topics?type=person',
        'cityRegions': {city: reg for city, (reg, _) in CITY_ALIASES.items()},
        'rabbis': entries,
        'aliasIndex': alias_index,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    size_kb = OUT_PATH.stat().st_size / 1024
    print(f'Wrote {OUT_PATH.relative_to(REPO)} ({size_kb:.1f} KB)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
