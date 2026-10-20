"""Move passages captured under page labels that do not exist to their verified references.

Some midrash works were captured as if they were Talmud tractates: each chapter got a page label
such as "Sifrei Zuta 3a", which Sefaria reads as the whole book. A reference correction carries a
frozen map from each captured reference to the verified one. The importer rebuilds every corrected
record from the parent and the map with build(), and refuses any difference.

A corrected record changes only its reference index, values that are exactly the old reference,
links to the passage's own page-label URL, and one added referenceCorrection block. Text, people,
identities, written reasons, hash links and a reading's saved case never change.
"""
import copy
import hashlib
import json
import re
from urllib.parse import quote

SCHEMA = 'reference-correction/v1'
SEFARIA = 'https://www.sefaria.org/'
CAPTURE_REF = re.compile(r'(.+) (\d+[ab]):(\d+(?::\d+)*)')
ENTRY_KEYS = {'passageId', 'captureRef', 'canonicalRef', 'copyRole', 'primaryPassageId', 'sourceTextSha256', 'legacy', 'current', 'contextDifferences'}
LEGACY_KEYS = {'rawFile', 'rawFileSha256', 'rawTextSha256'}
CURRENT_KEYS = {'rawFile', 'rawFileSha256', 'rawTextSha256', 'chapterRef', 'sourceUrl'}
DIFFERENCE_KEYS = {'field', 'at', 'captured', 'current', 'segmentRef', 'segmentAt', 'segmentLegacyRawTextSha256', 'segmentCurrentRawTextSha256'}
HEX = re.compile(r'[0-9a-f]{64}')


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def parse(entry):
    match = CAPTURE_REF.fullmatch(str(entry.get('captureRef')))
    if not match:
        raise ValueError('Captured reference has no page label: ' + str(entry.get('passageId')))
    return match.group(1), match.group(2), match.group(3)


def page_links(entry):
    """The passage's own page-label links and the real links that replace them."""
    work, unit, address = parse(entry)
    underscored = work.replace(' ', '_')
    return {SEFARIA + quote(f'{work} {unit}'): entry['current']['sourceUrl'],
            SEFARIA + f'{underscored}_{unit}.' + address.replace(':', '.'): SEFARIA + f'{underscored}.' + address.replace(':', '.')}


def check_map(correction, rows):
    if (not isinstance(correction, dict) or set(correction) != {'schema', 'reason', 'inputs', 'passages'} or correction['schema'] != SCHEMA or
            not str(correction['reason']).strip() or not isinstance(correction['inputs'], dict) or not correction['inputs'] or
            any(not str(k).strip() or not HEX.fullmatch(str(v)) for k, v in correction['inputs'].items()) or
            not isinstance(correction['passages'], list) or not correction['passages']):
        raise ValueError('Reference correction map is incomplete')
    entries, groups = {}, {}
    for entry in correction['passages']:
        pid = entry.get('passageId') if isinstance(entry, dict) else None
        if not isinstance(entry, dict) or set(entry) != ENTRY_KEYS or pid in entries:
            raise ValueError('Reference correction entry is malformed or repeated: ' + str(pid))
        work, unit, address = parse(entry)
        current, legacy = entry['current'], entry['legacy']
        chapter = f'{work} {address.split(":")[0]}'
        if (entry['canonicalRef'] != f'{work} {address}' or entry['copyRole'] not in {'fetched', 'repeat'} or
                not isinstance(legacy, dict) or set(legacy) != LEGACY_KEYS or not isinstance(current, dict) or set(current) != CURRENT_KEYS or
                any(not HEX.fullmatch(str(part[k])) for part, keys in ((legacy, ('rawFileSha256', 'rawTextSha256')), (current, ('rawFileSha256', 'rawTextSha256'))) for k in keys) or
                not str(legacy['rawFile']).strip() or not str(current['rawFile']).strip() or
                current['chapterRef'] != chapter or current['sourceUrl'] != SEFARIA + quote(chapter)):
            raise ValueError('Verified reference does not follow from the captured one: ' + pid)
        row = rows.get('passage:' + pid)
        passage = json.loads(row[-1]) if row and row[1] == 'passage' else None
        if not passage or row[3] != entry['captureRef'] or passage.get('ref') != entry['captureRef'] or digest(passage['source']['passage']) != entry['sourceTextSha256']:
            raise ValueError('Reference correction does not match the live passage: ' + pid)
        if not isinstance(entry['contextDifferences'], list):
            raise ValueError('Context differences must be listed: ' + pid)
        for change in entry['contextDifferences']:
            text = passage['source'].get(change.get('field')) if isinstance(change, dict) else None
            if (set(change) != DIFFERENCE_KEYS or not isinstance(text, str) or type(change['at']) is not int or not 0 <= change['at'] < len(text) or
                    text[change['at']] != change['captured'] or len(change['current']) != 1 or change['current'] == change['captured'] or
                    type(change['segmentAt']) is not int or not str(change['segmentRef']).strip() or
                    any(not HEX.fullmatch(str(change[k])) for k in ('segmentLegacyRawTextSha256', 'segmentCurrentRawTextSha256')) or
                    change['segmentLegacyRawTextSha256'] == change['segmentCurrentRawTextSha256']):
                raise ValueError('Recorded letter difference does not match the stored text: ' + pid)
        entries[pid] = entry
        groups.setdefault(entry['canonicalRef'], []).append(entry)
    for ref, members in groups.items():
        fetched = sorted(e['passageId'] for e in members if e['copyRole'] == 'fetched')
        primary = fetched[0] if fetched else min(e['passageId'] for e in members)
        if (len(fetched) > 1 or {e['primaryPassageId'] for e in members} != {primary} or
                len({(e['sourceTextSha256'], encode(e['contextDifferences'])) for e in members}) != 1):
            raise ValueError('Copies of one real text disagree: ' + ref)
    return entries, groups


def build(rows, correction, parent):
    """Every corrected record, rebuilt from the parent rows and the map."""
    rows = {r[0]: r for r in rows}
    entries, groups = check_map(correction, rows)
    by_ref = {e['captureRef']: pid for pid, e in entries.items()}
    records = []
    for key in sorted(rows):
        row = rows[key]
        pid = row[2]
        if pid not in entries:
            if row[3] in by_ref:
                raise ValueError('A record cites a mapped reference from another passage: ' + key)
            continue
        entry = entries[pid]
        if row[6] == 'user_correction':
            raise ValueError('Cannot correct the reference of a human correction: ' + key)
        if row[3] != entry['captureRef']:
            raise ValueError('Record reference differs from its passage: ' + key)
        data = json.loads(row[-1])
        if 'referenceCorrection' in data:
            raise ValueError('Record was already corrected: ' + key)
        replaced = [0]
        table = {entry['captureRef']: entry['canonicalRef'], **page_links(entry)}

        def swap(value):
            if isinstance(value, dict):
                return {k: swap(v) for k, v in value.items()}
            if isinstance(value, list):
                return [swap(v) for v in value]
            if isinstance(value, str) and value in table:
                replaced[0] += 1
                return table[value]
            return value
        # A reading's saved case is never rewritten; only its index moves.
        new = copy.deepcopy(data) if row[1] == 'name_reading' else swap(data)
        block = dict(schema=SCHEMA, legacyRef=entry['captureRef'], canonicalRef=entry['canonicalRef'], passageId=pid,
                     primaryPassageId=entry['primaryPassageId'], duplicateCopy=pid != entry['primaryPassageId'],
                     replacesPayloadSha256=row[-2], replacedValues=replaced[0])
        if row[1] == 'passage':
            members = sorted(e['passageId'] for e in groups[entry['canonicalRef']])
            block.update(copyRole=entry['copyRole'], copies=len(members), copyPassageIds=members, legacy=entry['legacy'],
                         current=entry['current'], contextDifferences=entry['contextDifferences'], sourceTextSha256=entry['sourceTextSha256'])
        if row[1] == 'name_reading' and 'sourceQuality' in data:
            block['resolvesSourceQualityWarning'] = True
        new['referenceCorrection'] = block
        records.append(dict(record_id=key, kind=row[1], passage_id=pid, ref=entry['canonicalRef'], subject_id=row[4], object_id=row[5],
                            authority=row[6], decision=row[7], replacesSha256=row[-2], data=new))
    missing = sorted(set(entries) - {r['passage_id'] for r in records if r['kind'] == 'passage'})
    if missing:
        raise ValueError('Mapped passage is missing: ' + missing[0])
    works = sorted({parse(e)[0] for e in entries.values()})
    return dict(parentRevision=parent['revision'], referenceCorrection=correction, records=records,
                description=(f'Move {len(entries)} passages of {" and ".join(works)} to their verified references ({len(groups)} real texts) '
                             f'and correct the {len(records)} records on them. No text, person or identity changes.'))
