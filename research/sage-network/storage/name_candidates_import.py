"""Prepare and check name_candidates records for the graph. Offline: no remote access and no database writes.

A record is built only from checked inputs:
- the graph parent revision, from a verified local export: registry rows, reviewed and human decisions, older
  readings and their source bindings;
- each source reading's rows as checked. A reading the graph holds is read from the graph. A reading a source-reading
  store holds comes from that store's read-back file (`source-reading-store-readback-v1`), which the store owner
  writes only after a full read-back rebuilds every passage from its R2 artifact;
- a pin file root writes for the release (`name-candidates-release-pins-v1`). It names the graph revision and record
  set, and for each read-back file: the sha256 of its exact bytes, the store and its physical database, the revision,
  record set and parent, the export hash, the ownership manifest, the reviewed producer code, and that root found the
  store revision verified. The read-back receipt does not cover the passages, so only that outside pin binds them: a
  file whose bytes differ from its pin is refused, whatever its own fields say. A file never pins itself.

Checked readings (checked-source-store-v1 rows in a store) need pin file version 2
(`name-candidates-release-pins-v2`). Each read-back pin then also lists the sorted hashes of root's checked selections
that file holds. The caller gives each selection file once (`--checked-selection`, repeated) and the approved artifacts
(`--artifacts`); the read-back must be made with `--with-checked-rows`. A checked reading is read only against the
selection its envelope names, and only if its pin lists it; its rows must hash to the stored hashes, its ownership must
be the pinned manifest's, and its artifact must match by hash and length. Only owned `printed_name` mentions are looked
up. A checked reading replaces every raw reading of the same raw result and job; it is refused if the graph holds one, or
if a reviewed or human decision covers a person of one.

Every JSON input is read strictly: a repeated key or a non-finite number is refused.

Each candidate cites the person, passage and source_reading rows exactly as stored (store, revision, stored hash and
format) together with the rebuilt v1 hash. A checked candidate cites its checked_person, checked_reading,
checked_ownership and checked_coverage rows the same way, and the approved artifact by hash and length. The check rebuilds every record from the same inputs, refuses any
difference, and re-checks human precedence, coverage at every mention and the alias guards on its own.

`release` hands a checked changes file to extend_d1.prepare() with root's pins and the read-back files, which runs the
same check again on the parent export and writes import.sql, manifest.json and activate.sql. Nothing touches a database.
Usage:
  name_candidates_import.py prepare --graph EXPORT.sqlite --revision R --pins PINS [--readback FILE ...] --output DIR
  name_candidates_import.py check --graph EXPORT.sqlite --revision R --pins PINS [--readback FILE ...] --changes CHANGES
  name_candidates_import.py release --export PARENT.sql --manifest PARENT.json --pins PINS [--readback FILE ...]
                                    --changes CHANGES --output DIR
"""
import argparse
import hashlib
import json
import math
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'identity'))
import name_candidates as nc  # noqa: E402
from prepare_d1 import encode as d1_encode  # noqa: E402
from shared_records import COLUMNS as RECORD_COLUMNS, literal, record_table, version_hash  # noqa: E402

VERSION = 'name-candidates-import-v1'
READBACK = 'source-reading-store-readback-v1'
PINS = 'name-candidates-release-pins-v1'
# Version 2 adds, per read-back, the sorted hashes of root's checked selections that file holds. A store can hold
# readings of several selections; each checked reading is read only against the one it names, if its pin lists it.
PINS_V2 = 'name-candidates-release-pins-v2'
CHECKED_FORMAT = 'checked-source-store-v1'
CHECKED_ROW_KINDS = ('checked_reading', 'checked_person', 'checked_ownership', 'checked_coverage', 'checked_decision')
# The stored rows a checked record cites: the person, and the reading's envelope, ownership and coverage.
CHECKED_CITED = ('person', 'reading', 'ownership', 'coverage')
STORES = ('bavli', 'other')
# The physical store databases and their reviewed ownership manifests (the hashes the source-binding release used).
DATABASES = {'bavli': 'talmud-source-readings-bavli', 'other': 'talmud-source-readings-other'}
REVIEWED_OWNERSHIP = {'bavli': '42a7236ec9db64b1382f12ffe7493a38a096c71f4f1c75c229b3c9b9b7df5176',
                      'other': 'da0c4ed080e12faf1c2eedcdddae54576baaf5bccefc6b5ea0bf7ff7385498d5'}
READBACK_FIELDS = {'version', 'store', 'revision', 'parentRevision', 'recordSetSha256', 'readBack', 'readBackSha256', 'complete', 'passages'}
PIN_FIELDS = {'sha256', 'store', 'database', 'revision', 'recordSetSha256', 'parentRevision', 'exportSha256',
              'ownershipManifestSha256', 'revisionState', 'producer'}
V1_FORMAT = 'source_readings.records v1 row'
STORE_FORMAT = 'source-reading-store-v2'
READING_KINDS = ('passage', 'person', 'claim', 'source_reading', 'source_reading_coverage', 'source_reading_unit')
COLUMNS = 'record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json'
DATA = Path(__file__).resolve().parents[3] / 'packages/talmud/src/lib/data'
DESCRIPTION = 'Add first registry suggestions for people in checked source readings'
# The release hook writes each new record as one statement, and refuses the batch if any statement is longer than this
# (shared_records.statements). A record that would be longer cannot be stored whole.
STATEMENT_LIMIT = 100_000


def require(value, message):
    if not value:
        raise ValueError(message)


def d1_hash(data):
    """The payload hash D1 stores (prepare_d1.encode)."""
    return hashlib.sha256(d1_encode(data).encode()).hexdigest()


def strict_json(text):
    """json.loads that refuses a repeated key or a non-finite number, so one file cannot be read two ways."""
    def pairs(items):
        keys = [k for k, _ in items]
        require(len(keys) == len(set(keys)), 'Repeated JSON key')
        return dict(items)

    def constant(name):
        raise ValueError('Non-finite JSON number: ' + name)

    def number(text):
        value = float(text)
        require(math.isfinite(value), 'Non-finite JSON number: ' + text)  # 1e999 parses to inf without parse_constant
        return value
    return json.loads(text.decode() if isinstance(text, bytes) else text, object_pairs_hook=pairs, parse_constant=constant,
                      parse_float=number)


def read_graph(path, revision):
    """A verified graph revision from a local export: every payload matches its hash, and the record set its manifest."""
    with sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True) as db:
        saved = db.execute('SELECT manifest_json,state FROM sage_graph_revisions WHERE id=?', (revision,)).fetchone()
        require(saved and saved[1] == 'verified', 'Graph revision is not verified: ' + revision)
        manifest = dict(strict_json(saved[0]), revision=revision)
        rows = list(db.execute(f'SELECT {COLUMNS} FROM {record_table(db)} WHERE revision_id=? ORDER BY record_id', (revision,)))
    for row in rows:
        require(hashlib.sha256(row[-1].encode()).hexdigest() == row[-2], 'Graph payload differs from its hash: ' + row[0])
        strict_json(row[-1])
    require(len(rows) == manifest['recordCount'], 'Graph record count differs from its manifest')
    require(hashlib.sha256(d1_encode([list(r[:-1]) for r in rows]).encode()).hexdigest() == manifest['recordSetSha256'],
            'Graph record set differs from its manifest')
    return rows, manifest


def load_pins(data):
    """Root's release pins, from their own file. Nothing here is ever taken from the files the pins cover."""
    return checked_pins(strict_json(data))


def checked_pins(pins):
    require(isinstance(pins, dict) and pins.get('version') in (PINS, PINS_V2) and set(pins) == {'version', 'graph', 'readbacks'},
            'Not a name_candidates release pin file')
    require(set(pins['graph']) == {'revision', 'recordSetSha256'}, 'Graph pin must name the revision and record set')
    fields = PIN_FIELDS | ({'checkedSelectionSha256s'} if pins['version'] == PINS_V2 else set())
    require(all(set(x) == fields for x in pins['readbacks']), 'Each read-back pin needs exactly: ' + ', '.join(sorted(fields)))
    for x in pins['readbacks']:
        require(x['store'] in STORES and x['database'] == DATABASES[x['store']], 'A read-back pin names another database')
        require(x['revisionState'] == 'verified', 'Root must find the store revision verified before pinning it')
        require(isinstance(x['producer'], dict) and set(x['producer']) == {'commit', 'codeSha256'} and all(x['producer'].values()),
                'A read-back pin must name the reviewed producer commit and code hash')
        named = x.get('checkedSelectionSha256s', [])
        require(isinstance(named, list) and named == sorted(set(named)) and all(isinstance(h, str) and len(h) == 64 for h in named),
                'A read-back pin lists its checked selections once each, sorted, by sha256')
    require(len({x['sha256'] for x in pins['readbacks']}) == len(pins['readbacks']), 'A read-back file is pinned twice')
    return pins


def row_dict(row):
    return dict(zip(COLUMNS.split(',')[:-2], row[:8]), data=json.loads(row[-1]))


def graph_passages(rows):
    """Source readings the graph itself holds: there the stored row is the v1 row."""
    out = {}
    readings = {r[2] for r in rows if r[1] == 'source_reading'}
    for row in rows:
        if row[2] in readings and row[1] in READING_KINDS:
            p = out.setdefault(row[2], dict(store='graph', revision=None, stored={}, v1=[], v1Sha256={}))
            p['stored'][row[0]] = dict(recordId=row[0], kind=row[1], payloadSha256=row[-2], payloadFormat=V1_FORMAT)
            p['v1'].append(row_dict(row))
            p['v1Sha256'][row[0]] = row[-2]
    return out


def back_count(f, key):
    value = (f.get('readBack') or {}).get(key)
    return value if isinstance(value, int) else bool(value)


def checked_passage(pid, p, pin, selections, artifacts):
    """One checked reading from a read-back: its rows as stored, held to the root selection it names (which its pin must
    list) and to the approved artifact. selections: each given selection's cases by job, keyed by the file's sha256."""
    stored = {s['recordId']: s for s in p['stored']}
    require(len(stored) == len(p['stored']) and all(s['payloadFormat'] == CHECKED_FORMAT for s in stored.values()),
            'Stored rows repeat or are not checked store rows: ' + pid)
    rows = p.get('rows')
    require(isinstance(rows, list) and rows, 'A checked passage needs its stored rows in the read-back: ' + pid)
    ids = [r['record_id'] for r in rows]
    require(len(set(ids)) == len(ids) and set(ids) == {k for k, x in stored.items() if x['kind'] in CHECKED_ROW_KINDS},
            'Checked rows differ from the stored rows of those kinds: ' + pid)
    for r in rows:
        require(r['passage_id'] == pid and stored[r['record_id']]['kind'] == r['kind'], 'Row belongs elsewhere: ' + r['record_id'])
        require(d1_hash(r['data']) == stored[r['record_id']]['payloadSha256'], 'Checked row differs from its stored hash: ' + r['record_id'])
    one = lambda kind: [r for r in rows if r['kind'] == kind]
    require(len(one('checked_reading')) == len(one('checked_ownership')) == len(one('checked_coverage')) == 1, 'A checked passage needs one envelope: ' + pid)
    reading = one('checked_reading')[0]
    rd = reading['data']
    # A passage is named by its own approved artifact; its envelope, ownership and coverage rows say so too.
    require(rd['readingId'] == pid == 'cs1-' + rd['artifactHash'] and
            [r['record_id'] for r in (reading, one('checked_ownership')[0], one('checked_coverage')[0])] ==
            ['checked_reading:' + pid, 'checked_ownership:' + pid, 'checked_coverage:' + pid], 'Checked passage is named for another reading: ' + pid)
    # Owned units decide which printed names are looked up, so they are held to the pinned manifest, as raw readings are.
    ownership, job = one('checked_ownership')[0]['data'], rd['binding']['jobHash']
    require(ownership['passageId'] == pid and ownership['jobSha256'] == job and
            all(u['passageId'] == pid and u['jobSha256'] == job for u in ownership['ownedUnits']) and
            {x['ownershipManifestSha256'] for x in ownership['ownedUnits'] + ownership['sources']} <= {pin['ownershipManifestSha256']},
            'Checked ownership is for another reading or manifest than its pin: ' + pid)
    require(one('checked_coverage')[0]['data']['readingId'] == pid, 'Checked coverage is for another reading: ' + pid)
    # Root's selection, never the row, says which plan, approval and artifact this reading may use. The row only names
    # which pinned selection to look in; a case is never taken from another selection.
    require(rd['selectionSha256'] in pin['checkedSelectionSha256s'], 'Checked reading names a selection its pin does not list: ' + pid)
    case = selections[rd['selectionSha256']].get(rd['jobId'])
    require(case is not None, 'Checked reading is absent from the selection it names: ' + pid)
    require((rd['planHash'], rd['approvalHash'], rd['artifactHash'], rd['artifact']['sha256'], rd['rootApprovalFileSha256']) ==
            (case['planHash'], case['approvalHash'], case['artifactHash'], case['bundleFileSha256'], case['rootApprovalFileSha256']) and
            rd['artifact']['sha256'] == rd['bundleFileSha256'] == p['artifactSha256'] and rd['jobId'] == p['jobId'],
            "Checked reading differs from root's selection: " + pid)
    raw = artifacts.get(rd['artifact']['sha256'])
    require(raw is not None and hashlib.sha256(raw).hexdigest() == rd['artifact']['sha256'] and len(raw) == rd['artifact']['bytes'],
            'The approved artifact is missing or differs: ' + pid)
    sources = {}
    for source in strict_json(raw)['job']['sources']:
        require(hashlib.sha256(source['text'].encode()).hexdigest() == source['sha256'], 'Artifact source differs from its hash: ' + pid)
        sources[source['source_id']] = source
    return dict(passageId=pid, stored=stored, row=reading, people=one('checked_person'), ownership=ownership,
                coverage=one('checked_coverage')[0]['data'], holds=one('checked_decision'), sources=sources,
                rawResultHash=rd['supersedes']['rawResultHash'], jobHash=job)


def selection_cases(checked_selections, pins):
    """Root's checked selection files, each given once by the caller, exactly the ones the pins list: cases by job, by
    file sha256. A selection is never found from a hash a stored row names."""
    out = {}
    for raw in checked_selections or ():
        key = hashlib.sha256(raw).hexdigest()
        require(key not in out, 'A checked selection is given twice')
        cases = strict_json(raw)['cases']
        out[key] = {c['jobId']: c for c in cases}
        require(len(out[key]) == len(cases), 'A checked selection lists a job twice')
    pinned = {h for x in pins['readbacks'] for h in x.get('checkedSelectionSha256s', [])}
    require(pinned <= set(out), 'A pinned checked selection is not given: ' + ', '.join(sorted(pinned - set(out))))
    require(set(out) <= pinned, 'A checked selection is given that no pin lists: ' + ', '.join(sorted(set(out) - pinned)))
    return out


def readback_passages(files, pins, reviewed_ownership=REVIEWED_OWNERSHIP, checked_selections=None, artifacts=None):
    """Passages from store read-back files. Each file's exact bytes must equal a pin in root's release pins, and every
    pinned file must be given; then the store owner's full read-back must have passed. Checked readings need a version-2
    pin listing root's selections that file holds, each selection file itself, and the approved artifacts, all from the
    caller."""
    pinned = {x['sha256']: x for x in pins['readbacks']}
    given = [hashlib.sha256(raw).hexdigest() for raw in files]
    require(len(set(given)) == len(given), 'A read-back file is given twice')
    require(set(given) == set(pinned), 'Read-back files differ from the release pins')
    selections = selection_cases(checked_selections, pins)
    out, checked_out, sources = {}, {}, []
    for raw, file_sha in zip(files, given):
        f, pin = strict_json(raw), pinned[file_sha]
        require((f.get('store'), f.get('revision'), f.get('recordSetSha256'), f.get('parentRevision')) ==
                (pin['store'], pin['revision'], pin['recordSetSha256'], pin['parentRevision']), 'Read-back file names another revision than its pin')
        require(f.get('version') == READBACK and f.get('store') in STORES, 'Not a source-reading store read-back file')
        # Checked readings (checked-source-store-v1) are typed, reviewed items, never read as original reading rows. They
        # are read only with root's pinned selection; otherwise a file that holds any is refused whole, never read in part.
        checked = f.get('checkedPassages') or {}
        if checked or back_count(f, 'checkedPassages'):
            require(pins['version'] == PINS_V2 and pin['checkedSelectionSha256s'],
                    "Checked readings need a version-2 pin listing root's checked selections")
        require(set(f) <= READBACK_FIELDS | {'checkedPassages'}, 'Read-back file has fields this version does not know: '
                + ', '.join(sorted(set(f) - READBACK_FIELDS - {'checkedPassages'})))
        require(pin['ownershipManifestSha256'] == reviewed_ownership[pin['store']], 'The pinned ownership manifest is not the reviewed one')
        back = f['readBack']
        require(f.get('complete') is True and back.get('matchesImporter') is True, 'The read-back did not check every passage')
        require(d1_hash(back) == f['readBackSha256'], 'Read-back receipt differs from its hash')
        require((back.get('store'), back.get('revision'), back.get('recordSetSha256'), back.get('parentRevision')) ==
                (f['store'], f['revision'], f['recordSetSha256'], f.get('parentRevision')), 'Read-back receipt names another revision')
        require(back.get('passagesChecked') == back.get('passages') == len(f['passages']) + len(checked), 'The read-back did not rebuild every passage')
        require(back.get('checkedPassages', 0) == len(checked) and (not checked or back.get('checkedPassagesSha256') == d1_hash(checked)),
                'Checked passages differ from the read-back receipt')
        require((back.get('database'), back.get('exportSha256')) == (pin['database'], pin['exportSha256']), 'The read-back read another database or export than its pin')
        # The receipt covers the passages (passagesSha256) and the verified state; readBackSha256 covers the receipt.
        require(back.get('passagesSha256') == d1_hash(f['passages']), 'Passages differ from the read-back receipt')
        require(back.get('revisionState') == 'verified', 'The read-back was of a revision that is not verified')
        for pid, p in f['passages'].items():
            require(pid not in out, 'A passage is in two read-back files: ' + pid)
            stored = {s['recordId']: s for s in p['stored']}
            require(len(stored) == len(p['stored']) and all(s['payloadFormat'] == STORE_FORMAT for s in stored.values()),
                    'Stored rows repeat or are not compact store rows: ' + pid)
            v1 = [x['row'] for x in p['v1']]
            hashes = {x['row']['record_id']: x['v1PayloadSha256'] for x in p['v1']}
            require(set(hashes) == set(stored) and len(hashes) == len(v1), 'Stored and rebuilt rows differ: ' + pid)
            coverage = [r for r in v1 if r['kind'] == 'source_reading_coverage']
            require(len(coverage) == 1 and {s.get('ownershipManifestSha256') for s in coverage[0]['data']['sources']} == {pin['ownershipManifestSha256']},
                    'A passage is owned under another manifest than its pin: ' + pid)
            for row in v1:
                require(row['passage_id'] == pid and stored[row['record_id']]['kind'] == row['kind'], 'Row belongs elsewhere: ' + row['record_id'])
                require(d1_hash(row['data']) == hashes[row['record_id']], 'Rebuilt row differs from its v1 hash: ' + row['record_id'])
            out[pid] = dict(store=f['store'], revision=f['revision'], stored=stored, v1=v1, v1Sha256=hashes)
        used = set()
        for pid, p in checked.items():
            require(pid not in out and pid not in checked_out, 'A passage is in two read-back files: ' + pid)
            checked_out[pid] = dict(checked_passage(pid, p, pin, selections, artifacts or {}), store=f['store'], revision=f['revision'])
            used.add(checked_out[pid]['row']['data']['selectionSha256'])
        # The pin lists exactly the selections this file holds, so a pin cannot vouch for readings it never saw.
        require(used == set(pin.get('checkedSelectionSha256s', [])), 'The pin lists a checked selection this read-back does not hold')
        sources.append(dict(store=f['store'], revision=f['revision'], parentRevision=f.get('parentRevision'),
                            recordSetSha256=f['recordSetSha256'], readBackSha256=f['readBackSha256'], fileSha256=file_sha,
                            database=pin['database'], exportSha256=pin['exportSha256'], ownershipManifestSha256=pin['ownershipManifestSha256'],
                            producer=pin['producer'], **({'checkedSelectionSha256s': pin['checkedSelectionSha256s']} if checked else {})))
    return out, checked_out, sorted(sources, key=nc.encode)


def readings(graph_rows, readbacks, pins, reviewed_ownership=REVIEWED_OWNERSHIP, checked_selections=None, artifacts=None):
    held, checked, sources = readback_passages(readbacks, pins, reviewed_ownership, checked_selections, artifacts)
    results = [c['rawResultHash'] for c in checked.values()]
    require(len(results) == len(set(results)), 'Two checked readings of one raw result')
    own = graph_passages(graph_rows)
    both = set(own) & set(held)
    require(not both, 'A reading is in the graph and in a store; the graph copy wins, so the store copy cannot be cited: ' + ', '.join(sorted(both)))
    raw = {**own, **held}
    # A checked reading supersedes every raw reading of the same raw result, as the reader does (supersededReadings).
    # The graph copy wins on the page, so a checked reading whose raw result the graph holds would never show: it is
    # refused, not hidden. A raw reading of another job, or one whose people a reviewed or human decision covers, is
    # refused too: replacing it would hide that decision.
    provenance = lambda p: next(r['data']['provenance'] for r in p['v1'] if r['kind'] == 'source_reading')
    by_result = defaultdict(list)
    for pid, p in sorted(raw.items()):
        by_result[provenance(p).get('resultSha256')].append(pid)
    superseded, decisions = [], None
    for pid, c in sorted(checked.items()):
        others = by_result.get(c['rawResultHash'], [])
        require(not set(others) & set(own), 'The graph holds the raw reading this checked reading supersedes: ' + pid)
        for other in others:
            require(provenance(raw[other]).get('jobSha256') == c['jobHash'], 'The raw reading this checked reading supersedes is of another job: ' + other)
            decisions = decisions or nc.Decisions(graph_rows)
            people = [r['data']['id'] for r in raw[other]['v1'] if r['kind'] == 'person']
            require(not any(decisions.about(other + '/' + person) for person in people),
                    'A reviewed or human decision covers a person of the raw reading this checked reading supersedes: ' + other)
            superseded.append(dict(passageId=other, reason='A checked reading of the same raw result supersedes this raw reading', checkedPassageId=pid))
            del raw[other]
    return raw, checked, sources, superseded


def build(graph_rows, graph_manifest, readbacks, pins, he_aliases_bytes, duplicates_bytes, reviewed_ownership=REVIEWED_OWNERSHIP, *,
          checked_selections=None, artifacts=None):
    """readbacks: the exact bytes of each read-back file. pins: root's release pins, from load_pins.
    reviewed_ownership: the reviewed ownership manifest per store; only tests on a test-made store pass another.
    checked_selections: the exact bytes of each of root's checked selections the pins list; artifacts: approved artifact
    bytes by sha256. Both come from the caller and are needed only when a read-back holds checked readings."""
    parent = graph_manifest['revision']
    pins = checked_pins(pins)
    require(pins['graph'] == dict(revision=parent, recordSetSha256=graph_manifest['recordSetSha256']), 'The graph parent differs from the release pins')
    require(not any(r[1] == nc.KIND for r in graph_rows), 'The parent already holds name_candidates records; this version only adds')
    passages, checked, sources, superseded = readings(graph_rows, readbacks, pins, reviewed_ownership, checked_selections, artifacts)
    registry = nc.registry_index([(r[0], r[-2], r[-1]) for r in graph_rows if r[1] == 'registry_person'], strict_json(he_aliases_bytes))
    duplicates = strict_json(duplicates_bytes)['duplicates']
    decisions = nc.Decisions(graph_rows)
    spans = nc.older_occurrences([(r[0], r[1], r[2], r[-1]) for r in graph_rows if r[1] in ('passage', 'person') and r[2] not in passages],
                                 [json.loads(r[-1]) for r in graph_rows if r[1] == 'source_binding'])
    groups = [passages[pid]['v1'] for pid in sorted(passages)]
    cases, held = nc.build(groups, registry, duplicates, parent, spans, decisions)
    for case in cases:
        p = passages[case['passageId']]
        for name in ('person', 'passage', 'sourceReading'):
            b = case['bindings'][name]
            stored = p['stored'][b['recordId']]
            require(b['v1PayloadSha256'] == p['v1Sha256'][b['recordId']], 'Rebuilt v1 hash differs: ' + b['recordId'])
            b.update(store=p['store'], revision=p['revision'] or parent, payloadSha256=stored['payloadSha256'], payloadFormat=stored['payloadFormat'])
    if checked:
        checked_cases, checked_held = nc.build_checked([checked[pid] for pid in sorted(checked)], registry, duplicates, parent, spans, decisions)
        for case in checked_cases:
            c = checked[case['passageId']]
            for name in CHECKED_CITED:
                b = case['bindings'][name]
                stored = c['stored'][b['recordId']]
                b.update(store=c['store'], revision=c['revision'], payloadSha256=stored['payloadSha256'], payloadFormat=stored['payloadFormat'])
        cases = cases + checked_cases
        held = held + superseded + checked_held
        nc.cross_link(cases)  # a checked and a raw reading of different jobs can share printed words
    producer = dict(nc.envelope(registry, parent, he_aliases_bytes, duplicates_bytes), importer=VERSION,
                    importerFileSha256=nc.sha256_file(__file__), graphRecordSetSha256=graph_manifest['recordSetSha256'], sources=sources,
                    pinsSha256=d1_hash(pins), **({'checkedRulesSha256': nc.checked_rules_sha()} if checked else {}))
    records, too_large = fit(cases, producer)
    return dict(version=VERSION, parentRevision=parent, description=DESCRIPTION, nameCandidateInputs=producer,
                records=records, held=held + too_large)


def statement_bytes(record):
    """The length in bytes of the statement shared_records.statements writes for this new record's version."""
    payload = d1_encode(record['data'])
    row = (record['record_id'], record['kind'], record['passage_id'], record['ref'], record['subject_id'], record['object_id'],
           record['authority'], record['decision'], hashlib.sha256(payload.encode()).hexdigest(), payload)
    sha = version_hash(row)
    return len((f'INSERT INTO sage_graph_record_versions(version_sha256,{RECORD_COLUMNS}) SELECT ' + ','.join(map(literal, (sha, *row)))
                + ' WHERE NOT EXISTS (SELECT 1 FROM sage_graph_record_versions ' + f'WHERE version_sha256={literal(sha)});').encode())


def bare_title(case):
    """Every registry entry the case lists was matched by a bare title alone, as a printed "רב" or "רבי" is."""
    forms = {h['form'] for c in case['candidates'] for h in c['matchedBy']}
    return case['status'] == 'alternatives' and bool(forms) and forms <= set(nc.TITLES)


def fit(cases, producer):
    """Records for the cases, and the cases held because their record is too large to store. Root's decision
    (2026-10-21): a bare title's list is held whole, with its reason, never cut short; the person it names stays as
    stored. Any other record too large for one statement refuses the batch, as the hook would."""
    records, held = [], []
    for case in cases:
        record = nc.record(case, producer)
        size = statement_bytes(record)
        if size <= STATEMENT_LIMIT:
            records.append(record)
            continue
        require(bare_title(case), 'A name_candidates record is too large for one database statement: ' + case['personKey'])
        held.append(dict(personKey=case['personKey'], reason=(
            f'A bare title alone fits {len(case["candidates"])} registry entries. Its record would be {size:,} bytes, more than the '
            f'{STATEMENT_LIMIT:,}-byte limit for one database statement, so it is held whole, not stored or cut short. '
            'The person it names stays as stored.'), status=case['status'], printed=[m['quote'] for m in case['mentions']],
            registryEntries=len(case['candidates']), statementBytes=size, statementLimit=STATEMENT_LIMIT))
    return records, held


def alias_guards_hold(mention, text):
    """No alias that must not name a father, or must not run into a longer name, survives at this mention."""
    printed = nc.forms(mention['quote'])
    names = {f['name'] for f in printed['forms']}
    for hit in mention['exact']:
        guard = hit.get('guard')
        # A hit from the one-letter retry carries that letter as its prefix, as in match_mention.
        prefix = printed['prefix'] if hit['form'] in names else printed['text'][0]
        if guard and (mention['nextWord'] in guard['notFollowedBy'] or
                      (guard['notAfterPatronymic'] and nc.after_patronymic(text, mention['start'], prefix))):
            return False
    return True


def validate_changes(changes, graph_rows, graph_manifest, readbacks, pins, he_aliases_bytes, duplicates_bytes, reviewed_ownership=REVIEWED_OWNERSHIP, *,
                     checked_selections=None, artifacts=None):
    """Rebuild everything from the same inputs and refuse any difference; then check the rules a second time."""
    expected = build(graph_rows, graph_manifest, readbacks, pins, he_aliases_bytes, duplicates_bytes, reviewed_ownership,
                     checked_selections=checked_selections, artifacts=artifacts)
    require(nc.encode(changes) == nc.encode(expected), 'Changes differ from a rebuild from the checked inputs')
    require(all(statement_bytes(r) <= STATEMENT_LIMIT for r in changes['records']), 'A record is too large for one database statement')
    passages, checked, _, _ = readings(graph_rows, readbacks, pins, reviewed_ownership, checked_selections, artifacts)
    decisions = nc.Decisions(graph_rows)
    for record in changes['records']:
        data, key = record['data'], record['subject_id']
        require(record['kind'] == nc.KIND and record['record_id'] == f'{nc.KIND}:v1/{key}' and record['object_id'] is None, 'Bad record: ' + key)
        require((record['authority'], record['decision']) == ('screening', 'needs_review'), 'A suggestion is never accepted: ' + key)
        require(data['accepted'] is False and data['historicalIdentityResolved'] is False and data['candidateMetadataVerified'] is False,
                'A suggestion is never accepted: ' + key)
        require(data['producer'] == changes['nameCandidateInputs'] and data['personKey'] == key and record['passage_id'] == data['passageId'],
                'Record names other inputs: ' + key)
        require(not decisions.about(key), 'A reviewed or human decision covers this person: ' + key)
        require({x['occurrenceKey'] for x in data['olderReading']['covered']} != {m['occurrenceKey'] for m in data['mentions']},
                'Older readings cover every mention: ' + key)
        if data.get('basis') == nc.CHECKED_BASIS:
            c = checked[data['passageId']]
            texts = {sid: source['text'] for sid, source in c['sources'].items()}
            person = next(r['data'] for r in c['people'] if r['record_id'] == data['bindings']['person']['recordId'])
            printed = {(m['sourceId'], m['start'], m['end']) for m in person['mentions'] if m['role'] == 'printed_name' and any(
                u['segmentId'] == m['segmentId'] and u['rawStart'] <= m['segmentStart'] and m['segmentEnd'] <= u['rawEnd']
                for u in c['ownership']['ownedUnits'])}
            require(all((m['sourceId'], m['start'], m['end']) in printed for m in data['mentions']),
                    'Only owned printed names of this checked person may be looked up: ' + key)
            require(data['bindings']['artifact'] == dict(sha256=c['row']['data']['artifact']['sha256'], bytes=c['row']['data']['artifact']['bytes']),
                    'The artifact citation differs from the checked reading: ' + key)
        else:
            texts = {s['source_id']: s['text'] for s in next(r for r in passages[data['passageId']]['v1'] if r['kind'] == 'passage')['data']['sourceSegments']}
        require(all(alias_guards_hold(m, texts[m['sourceId']]) for m in data['mentions']), 'An alias guard would refuse this match: ' + key)
        if data['status'] == 'tentative':
            found = [h for m in data['mentions'] for h in m['exact'] if h['slug'] == data['suggestion']]
            chosen = next(c for c in data['candidates'] if c['slug'] == data['suggestion'])
            require(data['clearestShape'] == 'full' and not any(m['notes'] for m in data['mentions']) and found
                    and not any(h['registryLabels'] or h.get('readings') for h in found) and chosen['registryDuplicate'] is None,
                    'A tentative suggestion needs one exact full name: ' + key)
        names, held_by = (CHECKED_CITED, checked) if data.get('basis') == nc.CHECKED_BASIS else (('person', 'passage', 'sourceReading'), passages)
        for b in (data['bindings'][n] for n in names):
            stored = held_by[data['passageId']]['stored'][b['recordId']]
            require((b['payloadSha256'], b['payloadFormat']) == (stored['payloadSha256'], stored['payloadFormat']) and b['store'] and b['revision'],
                    'A citation differs from the stored row: ' + b['recordId'])
    return dict(records=len(changes['records']), held=len(changes['held']), parentRevision=changes['parentRevision'], matchesRebuild=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('step', choices=['prepare', 'check', 'release'])
    parser.add_argument('--graph', type=Path)
    parser.add_argument('--revision')
    parser.add_argument('--export', type=Path, help='release: the verified parent export (SQL) extend_d1 reads')
    parser.add_argument('--manifest', type=Path, help='release: the parent manifest')
    parser.add_argument('--pins', type=Path, required=True, help="Root's release pins; never generated from the inputs they pin")
    parser.add_argument('--readback', type=Path, action='append', default=[])
    parser.add_argument('--checked-selection', type=Path, action='append', default=[],
                        help="one of root's checked selection files; repeat for every selection the pins list")
    parser.add_argument('--artifacts', type=Path, help='a folder of approved artifacts named <sha256>.json, for checked readings')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--changes', type=Path)
    args = parser.parse_args()
    readbacks = [p.read_bytes() for p in args.readback]
    pins = load_pins(args.pins.read_bytes())
    selections = [path.read_bytes() for path in args.checked_selection]
    # Only artifacts named by their own hash are offered; the importer still checks each one against its pin.
    artifacts = {f.stem: f.read_bytes() for f in sorted(args.artifacts.glob('*.json'))} if args.artifacts else None
    given = dict(checked_selections=selections, artifacts=artifacts)
    if args.step == 'release':
        from extend_d1 import prepare
        require(args.export and args.manifest and args.changes and args.output, 'release needs --export, --manifest, --changes and --output')
        print(json.dumps(prepare(args.export, args.manifest, args.changes, args.output, shared=True,
                                 name_candidate_pins=pins, readbacks=readbacks, name_candidate_selections=selections,
                                 name_candidate_artifacts=artifacts)))
        return
    require(args.graph and args.revision, 'prepare and check need --graph and --revision')
    rows, manifest = read_graph(args.graph, args.revision)
    aliases, duplicates = (DATA / 'rabbi-he-aliases.json').read_bytes(), (DATA / 'rabbi-duplicates.json').read_bytes()
    if args.step == 'prepare':
        require(args.output and not args.output.exists(), 'Give a new --output folder')
        changes = build(rows, manifest, readbacks, pins, aliases, duplicates, **given)
        result = validate_changes(changes, rows, manifest, readbacks, pins, aliases, duplicates, **given)
        args.output.mkdir(parents=True)
        (args.output / 'changes.json').write_text(json.dumps(changes, ensure_ascii=False, sort_keys=True, indent=1) + '\n')
    else:
        result = validate_changes(strict_json(args.changes.read_bytes()), rows, manifest, readbacks, pins, aliases, duplicates, **given)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
