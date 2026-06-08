#!/usr/bin/env python3
"""Patch rabbi-places.json with bare-name alias overrides.

Many tannaitic and amoraic names refer to MULTIPLE distinct sages
(Rabban Gamliel I/II/III, Rabbi Yehuda bar Ilai vs HaNasi, etc.).
Sefaria's first-wins auto-aliasing in build-rabbi-places.py routes the
bare form to whichever slug processed first — often the historically
prominent but Talmudically rare version (e.g. bare "Rabban Gamliel"
maps to Gamliel I haZaken, when the bare form in Bavli almost always
means Gamliel II of Yavneh).

This script reads the existing rabbi-places.json (preserving the full
rabbi list) and overrides ONLY the bare-name aliasIndex entries to the
more commonly intended sage per standard Talmudic-discourse convention.

Run after build-rabbi-places.py, or directly when you want to refresh
the override pins without re-fetching from Sefaria.
"""

from pathlib import Path
import json
import sys

REPO = Path(__file__).resolve().parent.parent
DATA_PATH = REPO / 'src' / 'lib' / 'data' / 'rabbi-places.json'

BARE_NAME_OVERRIDES: dict[str, str] = {
    'rabban gamliel':           'rabban-gamliel',                  # → Gamliel II of Yavneh (not I haZaken)
    'rabban gamaliel':          'rabban-gamliel',                  # Sefaria spelling variant
    'rabbi yehuda':             'rabbi-yehudah-b-ilai',            # → bar Ilai (not HaNasi)
    'rabbi yehudah':            'rabbi-yehudah-b-ilai',
    'rabbi judah':              'rabbi-yehudah-b-ilai',
    'rabbi eliezer':            'rabbi-eliezer-b-hyrcanus',        # → ben Hyrcanus (not ben Yaakov)
    'rabbi meir':               'rabbi-meir',
    'rabbi shimon':             'shimon-bar-yochai',               # → bar Yochai
    'rabbi simeon':             'shimon-bar-yochai',
    'rabbi yose':               'rabbi-yose-b-chalafta',           # → ben Chalafta
    'rabbi yossi':              'rabbi-yose-b-chalafta',
    'rabban shimon b. gamliel': 'rabban-shimon-b-gamliel-(ii)',    # → SbG II (not the Elder)
    'rabban shimon ben gamliel':'rabban-shimon-b-gamliel-(ii)',
    'rabban simeon b. gamliel': 'rabban-shimon-b-gamliel-(ii)',
    'rav yehuda':               'rav-yehudah-b-yechezkel',         # → bar Yechezkel
    'rav yehudah':              'rav-yehudah-b-yechezkel',
    'rav huna':                 'rav-huna',
    'rav nachman':              'rav-nachman-b-yaakov',            # → bar Yaakov
    'rav nahman':               'rav-nachman-b-yaakov',
}


def main() -> int:
    data = json.loads(DATA_PATH.read_text())
    rabbis = data['rabbis']
    aliases = data['aliasIndex']

    changed = 0
    missing: list[str] = []
    for bare_key, target_slug in BARE_NAME_OVERRIDES.items():
        if target_slug not in rabbis:
            missing.append(f'  {bare_key!r} → {target_slug!r} (slug missing)')
            continue
        prev = aliases.get(bare_key)
        if prev == target_slug:
            continue
        aliases[bare_key] = target_slug
        changed += 1
        print(f'  {bare_key!r}: {prev or "(unset)"} → {target_slug!r}')

    if missing:
        print('Skipped overrides (target slug missing from dataset):')
        for m in missing:
            print(m)

    if changed == 0:
        print('No changes needed.')
        return 0

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    print(f'Patched {changed} aliases in {DATA_PATH.relative_to(REPO)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
