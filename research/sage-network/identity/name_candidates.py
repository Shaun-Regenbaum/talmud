"""First registry candidates for people in new source readings. No model calls.

A candidate comes only from the name as the source prints it: the quoted mention, after a short list
of recorded rewrites. The reader's English label and its own expansion of an abbreviation are kept
for display. They are never matched.

- One registry entry with the exact full name gives a tentative suggestion. It is never accepted.
- A short name (a title and one name) gives alternatives, even when the registry has only one entry
  with that name. The entry that owns a bare name is not the only man who carried it.
- An abbreviation gives no candidates. Its possible readings are listed as guesses, each with the list
  it came from. No list is complete, so other readings always stay possible.
- If the source goes on with a patronymic after the quoted name, the quote may be cut short, and no
  suggestion is made.
- A father named inside a patronymic stays a local relative. Generic actors are not matched.
- No outside facts, no partner evidence and no era reasoning are used. A registry generation is copied
  only as stored metadata of a candidate, never as this person's era.

The output is a new record kind, `name_candidates`. Existing identity_proposal records and recipes
are not touched.
"""
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ownership.tile_ownership import digest as tile_digest, source_unit  # noqa: E402

VERSION = 'source-name-candidates-v1'
KIND = 'name_candidates'
TITLES = ('רב', 'רבי', 'רבן', 'מר')
PATRONYMIC = ('בר', 'בן', 'בריה', 'ברבי', 'בת')
NOT_MATCHED = 'A first suggestion from the printed name only. Not a confirmed identity.'
BINDING_FORMAT = ('rebuiltV1Sha256: the v1 row source_readings.records() rebuilds from the verified bundle. storedSha256: '
                  'the stored D1 payload, set only by the importer after it replays the bundle and compares every anchor.')
RULES = {
    'marks': 'Remove vowel points, cantillation and direction marks. Lookup only; anchors keep the original text.',
    'punctuation': "Turn punctuation and maqaf into spaces, the Hebrew geresh and gershayim into plain quote marks, and '' into \".",
    'attached-prefix': 'Remove one or two attached letters (ו ד ל ב מ ש כ ה) printed before a title, as in ור\' יהושע or '
                       'מדר\' סימאי, or one letter, or ו and one more, before an abbreviation, as in דר"ע or ולר"ע. A one-word name '
                       'that fits nothing as printed is tried once without its first letter, as in ושמואל.',
    'title-r': "Read ר' as רבי, as the site's own name scan does (expandAbbreviations). The registry writes it as a bare ר.",
    'abbreviation-reading': 'Read an abbreviation through ABBREVIATION_LISTS. A reading is a guess, never a candidate.',
    'registry-label': 'Drop a bracketed label from a registry name, such as (2) or (תנא). The label means the registry has '
                      'more than one person with this name, so a match through it is never a suggestion.',
    'he-alias': 'Use an explicit Hebrew alias from rabbi-he-aliases.json, with its own guards.',
}
SITE_LIST = 'packages/talmud/src/worker/index.ts expandAbbreviations'
MATCHER_LIST = 'name_candidates.UNREVIEWED_READINGS, written for this matcher and not reviewed'
# The site's explicit list. ר"מ is read as Rabbi Meir there only next to these words.
SITE_READINGS = {'ריב"ל': ['רבי יהושע בן לוי'], 'רשב"י': ['רבי שמעון בר יוחאי'], 'א"ר': ['רבי']}
SITE_MEIR = dict(after=('דברי', 'לדברי', 'כדברי', 'אמר', 'ואמר'), before=('וחכמים', 'אומר'))
# Common readings the site list leaves out on purpose. They are guesses with open lists: ר"י, for one,
# can also be Rabbi Yehoshua.
UNREVIEWED_READINGS = {
    'ר"ע': ['רבי עקיבא'],
    'ר"מ': ['רבי מאיר'],
    'ר"ש': ['רבי שמעון'],
    'ר"א': ['רבי אליעזר', 'רבי אלעזר'],
    'ר"י': ['רבי יהודה', 'רבי יוסי', 'רבי יוחנן', 'רבי ישמעאל'],
    'ר"ג': ['רבן גמליאל'],
    'ר"נ': ['רב נחמן'],
    'ר"פ': ['רב פפא'],
    'ר"ל': ['ריש לקיש'],
    'רשב"ג': ['רבן שמעון בן גמליאל'],
    'רשב"ל': ['רבי שמעון בן לקיש'],
}
# The site's one rule for registry rows that are not sages (packages/talmud/src/lib/nonSageTopics.ts).
NON_SAGE_SLUGS = frozenset({'hallel', 'mordekhai', 'mordechai1', 'blessings', 'blessings-(halakhah)'})
# The anchor audit's whole-word rule (name-coverage-v18/anchor-audit/anchor_audit.py): a quote may follow only a
# short attached prefix, and may not start after a quote mark or end inside a word.
WORD_PREFIX = re.compile('[ודלבכמשה]{1,3}|א|אד|ואד|כד|מד')
# The site's rule for an alias that must not name a father (HE_PATRONYMIC_PREFIX_RE in the worker), applied to the
# text before the name plus any prefix letter the quote itself carries: X בריה דרב אמי names Rav Ami as a father.
PATRONYMIC_BEFORE = re.compile(r'(?:^|\s)(?:בריה\s+ד|בר|בן|ברבי)\s*$')
SETTLING = {('source_identity', 'accepted_registry_identity'), ('source_identity', 'accepted_local'), ('accepted_identity', 'accepted')}
QUOTES = str.maketrans({'׳': "'", '’': "'", '‘': "'", '״': '"', '“': '"', '”': '"'})
# Before a title two attached letters are safe (מדר' סימאי). Before an abbreviation only ו and one more,
# so that an abbreviation such as מהר"ל is never cut down to ר"ל.
TITLE_PREFIX = re.compile("^[ודלבמשכה]{1,2}(?=ר' |רבי |רב |רבן )")
ABBREVIATION_PREFIX = re.compile('^(?:ו[דלבמשכה]?|[דלבמשכה])')


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def digest(value):
    return sha(encode(value))


def require(value, message):
    if not value:
        raise ValueError(message)


def clean(text):
    """Return the lookup text and the rules that changed it."""
    rules = []
    out = re.sub('[־]', ' ', text)
    out = re.sub('[֑-ׇ‎‏]', '', out)
    if out != text:
        rules.append('marks')
    before = out
    out = ' '.join(re.sub(r'[.,:;!?()\[\]{}]', ' ', out.translate(QUOTES).replace("''", '"')).split())
    if out != before:
        rules.append('punctuation')
    return out, rules


def is_abbreviation(word):
    return '"' in word


def strip_prefix(text):
    words = text.split()
    if words and is_abbreviation(words[0]) and words[0] not in SITE_READINGS and words[0] not in UNREVIEWED_READINGS:
        bare = ABBREVIATION_PREFIX.match(words[0])
        rest = words[0][bare.end():] if bare else None
        if rest in SITE_READINGS or rest in UNREVIEWED_READINGS:
            return ' '.join([rest, *words[1:]]), words[0][:bare.end()]
    titled = TITLE_PREFIX.match(text)
    return (text[titled.end():], titled.group(0)) if titled else (text, '')


def readings(word, previous, following):
    """Every listed reading of an abbreviation, each with the list it came from."""
    out = [dict(abbreviation=word, readAs=x, source=SITE_LIST) for x in SITE_READINGS.get(word, [])]
    if word == 'ר"מ' and (previous in SITE_MEIR['after'] or following in SITE_MEIR['before']):
        out.append(dict(abbreviation=word, readAs='רבי מאיר', source=SITE_LIST))
    listed = {r['readAs'] for r in out}
    out += [dict(abbreviation=word, readAs=x, source=MATCHER_LIST) for x in UNREVIEWED_READINGS.get(word, []) if x not in listed]
    return [dict(r, reviewed=False, otherReadingsPossible=True) for r in out]


def forms(quote, previous=None, following=None):
    """Every lookup form of a printed name, each with the rules and abbreviation readings that made it."""
    text, rules = clean(quote)
    text, prefix = strip_prefix(text)
    if prefix:
        rules = rules + ['attached-prefix']
    words = text.split()
    choices = []
    for i, w in enumerate(words):
        if is_abbreviation(w):
            before = words[i - 1] if i else previous
            after = words[i + 1] if i + 1 < len(words) else following
            choices.append([(r['readAs'], ['abbreviation-reading'], [r]) for r in readings(w, before, after)] or [(w, [], [])])
        elif w == "ר'":
            choices.append([('רבי', ['title-r'], [])])
        else:
            choices.append([(w, [], [])])
    out = [('', rules, [])]
    for options in choices:
        out = [((name + ' ' + w).strip(), steps + extra, used + read) for name, steps, used in out for w, extra, read in options]
    unique = {encode([name, steps, used]): dict(name=name, rules=steps, readings=used) for name, steps, used in out}
    return dict(text=text, prefix=prefix, abbreviated=any(is_abbreviation(w) for w in text.split()), forms=list(unique.values()))


def registry_form(name):
    """A registry name for lookup. No prefix or abbreviation rewrites: those are for printed text."""
    labels = re.findall(r'\(([^)]*)\)', name)
    text, rules = clean(re.sub(r'\([^)]*\)', ' ', name))
    words = ['רבי' if w in ("ר'", 'ר') else w for w in text.split()]
    if words != text.split():
        rules.append('title-r')
    return ' '.join(words), rules + (['registry-label'] if labels else []), labels


def shape(name, abbreviated):
    words = name.split()
    titles = 1 if words and words[0] in TITLES else 0
    if abbreviated:
        return 'abbreviation'
    return 'full' if len(words) > 1 + titles else 'short'


def is_non_sage_topic(slug, canonical_he):
    return slug in NON_SAGE_SLUGS or 'קבלה' in (canonical_he or '')


def on_word_edges(text, start, end):
    """The anchor audit's rule, so a quote such as רבא inside תרבא is never read as a name."""
    letter = lambda c: '\u05d0' <= c <= '\u05ea'
    mark = lambda c: '\u0591' <= c <= '\u05c7'
    ws = start
    while ws > 0 and (letter(text[ws - 1]) or mark(text[ws - 1]) or text[ws - 1] in '"\''):
        ws -= 1
    before = ''.join(c for c in text[ws:start] if not mark(c))
    bare = before.replace('"', '').replace("'", '')
    start_ok = before == '' or (bool(WORD_PREFIX.fullmatch(bare)) and '"' not in before and "'" not in before)
    stop = end
    while stop < len(text) and mark(text[stop]):
        stop += 1
    return start_ok and (stop >= len(text) or not letter(text[stop]))


def registry_index(rows, he_aliases):
    """rows: (record_id, payload_sha256, payload_json) of every registry_person in the parent revision."""
    entries, index, not_people = {}, defaultdict(list), []
    for record_id, payload_sha, payload in sorted(rows):
        require(record_id.startswith('registry_person:'), 'Not a registry person: ' + record_id)
        require(sha(payload) == payload_sha, 'Registry payload hash differs: ' + record_id)
        slug, data = record_id.split(':', 1)[1], json.loads(payload)
        entries[slug] = dict(recordId=record_id, payloadSha256=payload_sha, data=data)
        if is_non_sage_topic(slug, data.get('canonicalHe')):
            not_people.append(slug)
            continue
        if data.get('canonicalHe'):
            name, rules, labels = registry_form(data['canonicalHe'])
            index[name].append(dict(slug=slug, via='canonicalHe', registryName=data['canonicalHe'], registryRules=rules, registryLabels=labels))
    unusable = []
    for alias in he_aliases['aliases']:
        if alias['slug'] in not_people:
            unusable.append(dict(alias=alias['he'], slug=alias['slug'], reason='slug is not a sage'))
            continue
        if alias['slug'] not in entries:
            unusable.append(dict(alias=alias['he'], slug=alias['slug'], reason='slug not in registry snapshot'))
            continue
        name, rules, labels = registry_form(alias['he'])
        index[name].append(dict(slug=alias['slug'], via='he-alias', registryName=alias['he'], registryRules=rules, registryLabels=labels,
                                guard=dict(notFollowedBy=alias.get('notFollowedBy', []),
                                           notAfterPatronymic=alias.get('notAfterPatronymic', False))))
    snapshot = sorted((e['recordId'], e['payloadSha256']) for e in entries.values())
    return dict(entries=entries, index=dict(index), unusableAliases=unusable, notSages=sorted(not_people),
                registryRecordSetSha256=digest(snapshot), registryRecords=len(snapshot))


def occurrence_key(source, start, end):
    """source_readings.occurrence_key, restated so the matcher can check anchors without the reading importer."""
    _, raw_start, _, segment_hash = source_unit(source)
    return 'occ-' + tile_digest([source['edition'], source['provenance']['segment_id'], segment_hash, raw_start + start, raw_start + end])


def nth_start(text, quote, occurrence):
    """Where the reading compiler puts the occurrence-th match (it steps one character at a time, so matches may overlap)."""
    starts, pos = [], 0
    while (pos := text.find(quote, pos)) >= 0:
        starts.append(pos)
        pos += 1
    return starts[occurrence - 1] if 0 < occurrence <= len(starts) else None


def after_patronymic(text, start, prefix):
    before = clean(text[:start])[0] + (' ' + prefix if prefix else '')
    return bool(PATRONYMIC_BEFORE.search(before))


def neighbours(segment_text, start, end):
    before = clean(segment_text[:start])[0].split()
    after = clean(segment_text[end:])[0].split()
    return (before[-1] if before else None), (after[0] if after else None)


def match_mention(mention, source, registry):
    """One printed mention: its lookup forms, exact registry matches, guesses, and anything rejected."""
    text, start, end = source['text'], mention['start'], mention['end']
    require(text[start:end] == mention['quote'], 'Mention quote is not at its span: ' + mention['occurrenceKey'])
    # Every copied anchor field must agree with the source itself; the matcher does not trust them as given.
    require(mention['source_sha256'] == source['sha256'] == sha(text), 'Mention source hash differs: ' + mention['occurrenceKey'])
    require((mention['segmentId'], mention['edition'], mention['ref']) == (source['provenance']['segment_id'], source['edition'], source['ref']),
            'Mention source identity differs: ' + mention['occurrenceKey'])
    require(nth_start(text, mention['quote'], mention['occurrence']) == start, 'Mention occurrence differs: ' + mention['occurrenceKey'])
    require(mention['occurrenceKey'] == occurrence_key(source, start, end), 'Mention occurrence key differs: ' + mention['occurrenceKey'])
    _, raw_start, _, segment_sha = source_unit(source)
    previous, following = neighbours(text, start, end)
    f = forms(mention['quote'], previous, following)
    whole = on_word_edges(text, start, end)
    if not whole:
        # Kept with its anchor so a reviewer sees it, but nothing is looked up for a quote inside another word.
        f['forms'] = []
    word = f['text']
    if (whole and f['forms'] and ' ' not in word and not f['abbreviated'] and len(word) > 2 and word[0] in 'ודלבמשכה'
            and not any(registry['index'].get(x['name']) for x in f['forms'])):
        # A one-word name is never more than a short name, so one retry without an attached letter is safe.
        f['forms'].append(dict(name=word[1:], rules=f['forms'][0]['rules'] + ['attached-prefix'], readings=[], prefix=word[0]))
    found, guesses, rejected, notes = [], [], [], []
    if not f['forms']:
        notes.append(dict(rule='inside-a-word', note='The quote starts or ends inside a longer word, so it is not read as a name.'))
    elif following in PATRONYMIC:
        notes.append(dict(rule='continues-with-patronymic', word=following,
                          note='The source goes on with a patronymic after the quoted name, so the quote may be cut short.'))
    for form in f['forms']:
        for hit in registry['index'].get(form['name'], []):
            guard = hit.get('guard')
            if guard and following in guard['notFollowedBy']:
                rejected.append(dict(slug=hit['slug'], form=form['name'], reason=f'Alias guard: the next word is {following}.'))
                continue
            if guard and guard['notAfterPatronymic'] and after_patronymic(text, start, form.get('prefix', f['prefix'])):
                rejected.append(dict(slug=hit['slug'], form=form['name'], reason='Alias guard: the name follows a patronymic, so it names a father.'))
                continue
            (guesses if form['readings'] else found).append(dict(hit, form=form['name'], rules=form['rules'], readings=form['readings']))
    name_shape = 'abbreviation' if f['abbreviated'] else shape(f['forms'][0]['name'] if f['forms'] else f['text'], False)
    longer = []
    if name_shape == 'short' or any(h['registryLabels'] for h in found):
        for form in f['forms']:
            longer += [dict(slug=h['slug'], form=form['name'], registryName=h['registryName'], rules=form['rules'])
                       for name, hits in registry['index'].items() if name.startswith(form['name'] + ' ')
                       for h in hits if h['via'] == 'canonicalHe']
    return dict(occurrenceKey=mention['occurrenceKey'], sourceId=mention['source_id'], segmentId=mention['segmentId'],
                edition=mention['edition'], ref=mention['ref'], sourceSha256=mention['source_sha256'],
                start=mention['start'], end=mention['end'], segmentSha256=segment_sha,
                segmentStart=raw_start + mention['start'], segmentEnd=raw_start + mention['end'], occurrence=mention['occurrence'],
                quote=mention['quote'], primary=mention['primary'], lookupText=f['text'], forms=f['forms'], nameShape=name_shape,
                exact=found, longerNames=longer, abbreviationGuesses=guesses, rejected=rejected, notes=notes,
                previousWord=previous, nextWord=following)


def candidate_entry(slug, registry, duplicates):
    entry = registry['entries'][slug]
    data = entry['data']
    dup = dict(sameAs=duplicates[slug]) if slug in duplicates else (
        dict(duplicates=sorted(k for k, v in duplicates.items() if v == slug)) if slug in duplicates.values() else None)
    return dict(slug=slug, recordId=entry['recordId'], payloadSha256=entry['payloadSha256'], name=data.get('canonical'),
                nameHe=data.get('canonicalHe'), generationAsStored=data.get('generation'), regionAsStored=data.get('region'),
                metadataVerified=False, registryDuplicate=dup)


def grouped(pairs, registry, duplicates):
    by_slug = defaultdict(list)
    for slug, hit in pairs:
        by_slug[slug].append(hit)
    listed = sorted(by_slug.items(), key=lambda item: (not any(h['match'] == 'exact' for h in item[1]), item[0]))
    return [dict(candidate_entry(slug, registry, duplicates), matchedBy=sorted(hits, key=encode)) for slug, hits in listed]


def build_case(person_row, passage_row, reading_row, registry, duplicates, parent):
    person, passage = person_row['data'], passage_row['data']
    reading, key = person['reading'], person_row['record_id'].removeprefix('person:')
    require(reading_row['record_id'] == person['sourceReadingId'], 'Person belongs to another source reading')
    require(reading['kind'] == 'person' and reading['form'] in ('named', 'embedded_parent'), 'Not a named person: ' + key)
    sources = {s['source_id']: s for s in passage['sourceSegments']}
    mentions = [match_mention(m, sources[m['source_id']], registry) for m in person['mentions']]
    bind = lambda row: dict(recordId=row['record_id'], rebuiltV1Sha256=digest(row['data']), storedSha256=None)
    base = dict(version=VERSION, personKey=key, passageId=passage['id'], sourceReadingId=person['sourceReadingId'], ref=passage['ref'],
                bindings=dict(format=BINDING_FORMAT, person=bind(person_row), passage=bind(passage_row), sourceReading=bind(reading_row)),
                readingLabel=person['label'], readingForm=reading['form'], readingReason=reading['reason'],
                readingAlternatives=reading['alternatives'], parentRevision=parent, accepted=False,
                historicalIdentityResolved=False, candidateMetadataVerified=False, note=NOT_MATCHED,
                mentions=mentions, nameShapes=sorted({m['nameShape'] for m in mentions}), namedInsidePatronymicOf=[],
                suggestion=None, candidates=[], fromLessClearMentions=[], abbreviationGuesses=[], clearestShape=None)
    if reading['form'] == 'embedded_parent':
        children = sorted({p['id'] for p in passage['people'] if p['id'] != person['id'] and p['reading']['form'] == 'named'
                           for c in p['mentions'] for m in person['mentions']
                           if c['source_id'] == m['source_id'] and c['start'] <= m['start'] and m['end'] <= c['end']})
        return dict(base, status='local_relative', namedInsidePatronymicOf=[passage['id'] + '/' + c for c in children],
                    reason='Named only as a father inside a patronymic. Kept as a local relative. '
                           "A father's name alone is not matched to the registry.")
    hit = lambda m, h, match: dict(occurrenceKey=m['occurrenceKey'], match=match, via=h.get('via', 'canonicalHe'), form=h['form'],
                                   registryName=h['registryName'], rules=h['rules'] + h.get('registryRules', []),
                                   registryLabels=h.get('registryLabels', []), readings=h.get('readings', []), nameShape=m['nameShape'])
    base['abbreviationGuesses'] = grouped([(h['slug'], hit(m, h, 'abbreviation-guess')) for m in mentions for h in m['abbreviationGuesses']],
                                          registry, duplicates)
    plain = [m for m in mentions if m['nameShape'] != 'abbreviation']
    cut = [m for m in mentions if m['notes']]
    if not plain:
        reads = '; '.join(f'"{m["quote"]}" may be ' + (' or '.join(dict.fromkeys(r['readAs'] for f in m['forms'] for r in f['readings']))
                                                      or 'read in no listed way') for m in mentions)
        return dict(base, status='unresolved', clearestShape='abbreviation',
                    reason=f'The source prints only an abbreviation: {reads}. These readings come from unreviewed lists, and others '
                           'are possible. Any registry entries they fit are guesses, not candidates.')
    # Only the clearest way the person is printed decides the list. A full name that fits no entry is not
    # rescued by a short form of it.
    best = 'full' if any(m['nameShape'] == 'full' for m in plain) else 'short'
    clearest = [m for m in plain if m['nameShape'] == best]
    pairs = [(h['slug'], hit(m, h, 'exact')) for m in plain for h in m['exact']]
    pairs += [(h['slug'], hit(m, dict(h, via='canonicalHe'), 'longer-registry-name')) for m in plain for h in m['longerNames']]
    keep = {h['slug'] for m in clearest for h in m['exact'] + m['longerNames']}
    listed = grouped(pairs, registry, duplicates)
    base.update(candidates=[c for c in listed if c['slug'] in keep], fromLessClearMentions=[c for c in listed if c['slug'] not in keep],
                clearestShape=best)
    said = ', '.join(dict.fromkeys(f'"{m["quote"]}"' for m in clearest))
    fits = [h for m in clearest if m['nameShape'] == 'full' for h in m['exact']]
    full = {h['slug'] for h in fits}
    if cut:
        why = (f'The source goes on with "{cut[0]["nextWord"]}" right after the quote "{cut[0]["quote"]}", so the full name may be longer. '
               'No suggestion is made.')
    elif len(full) == 1:
        slug = next(iter(full))
        name = registry['entries'][slug]['data'].get('canonical')
        labels = sorted({x for h in fits for x in h['registryLabels']})
        if labels:
            why = f'The full name {said} fits {name}, but the registry adds the label ({labels[0]}) to that name, so it has more than one person by it.'
        elif candidate_entry(slug, registry, duplicates)['registryDuplicate']:
            why = f'The full name {said} fits {name}, but the registry lists that person in more than one row.'
        else:
            return dict(base, status='tentative', suggestion=slug,
                        reason=f'The full name {said} is printed here, and it is the registry name of {name}. This is a first suggestion only.')
    elif len(full) > 1:
        why = f'The full name {said} fits {len(full)} registry entries.'
    elif best == 'full':
        why = f'No registry entry has the full name {said}.'
        if base['fromLessClearMentions']:
            why += f' Shorter mentions of this person fit {len(base["fromLessClearMentions"])} entries; they are listed apart.'
    else:
        why = f'The source gives only the short name {said}. A short name alone does not say who this is.'
    n = len(base['candidates'])
    if n:
        return dict(base, status='alternatives', reason=why + (' One registry entry is listed.' if n == 1 else f' {n} registry entries are listed.'))
    return dict(base, status='unresolved', reason=why + ' The registry is not complete, so this person may still be known.')


def older_occurrences(rows, bindings):
    """Where earlier readings already placed a name, by source segment and character span.

    rows: parent passage and person records as (record_id, kind, passage_id, payload_json); bindings: source_binding payloads.
    A quote printed more than once in its passage has no single position; every place it could be is kept as possible.
    """
    texts, people = {}, defaultdict(list)
    for record_id, kind, passage_id, payload in rows:
        data = json.loads(payload)
        if kind == 'passage':
            texts[passage_id] = data.get('source', {}).get('passage')
        elif kind == 'person' and data.get('named') in ('name', 'father_of_named') and data.get('quoteLocation') == 'passage':
            people[passage_id].append((passage_id + '/' + data['id'], data['quote'], data['named']))
    spans = defaultdict(list)
    for b in bindings:
        text = texts.get(b['passageId'])
        if not isinstance(text, str) or sha(text) != b['sourceSha256']:
            continue
        for key, quote, role in people[b['passageId']]:
            places = [m.start() for m in re.finditer(re.escape(quote), text)] if quote else []
            for start in places:
                spans[(b['edition'], b['segmentId'], b['sourceSha256'])].append(
                    dict(personKey=key, start=start, end=start + len(quote), role=role, printedOnce=len(places) == 1))
    return spans


def prior_reading(mentions, form, spans):
    """Per occurrence: older people at exactly the same span in the same role, and older people that only overlap.

    An older father record quotes the whole patronymic, so a father inside it is only ever a possible match. Overlap is
    support for a reviewer, never coverage.
    """
    role = {'named': 'name', 'embedded_parent': 'father_of_named'}[form]
    covered, possible = {}, {}
    for m in mentions:
        for s in spans.get((m['edition'], m['segmentId'], m['segmentSha256']), []):
            same = s['printedOnce'] and s['role'] == role and (s['start'], s['end']) == (m['segmentStart'], m['segmentEnd'])
            if same:
                covered.setdefault(m['occurrenceKey'], set()).add(s['personKey'])
            elif s['start'] < m['segmentEnd'] and m['segmentStart'] < s['end']:
                possible.setdefault(m['occurrenceKey'], set()).add(s['personKey'])
    listed = lambda d: [dict(occurrenceKey=k, olderPeople=sorted(v)) for k, v in sorted(d.items())]
    return dict(covered=listed(covered), possible=listed(possible))


def settled_from_parent(rows):
    """People a human or an accepted identity already decides, from the parent records themselves.

    rows: (record_id, kind, passage_id, ref, subject_id, object_id, authority, decision, payload_sha256, payload_json).
    An accepted source_identity or accepted_identity decides its personKey. A human correction decides every local
    person it names. Each person keeps the exact records and payload hashes that decide it.
    """
    out = defaultdict(list)
    for record_id, kind, _, _, subject, obj, authority, decision, payload_sha, payload in rows:
        require(sha(payload) == payload_sha, 'Parent payload hash differs: ' + record_id)
        data = json.loads(payload)
        keys = set()
        if (kind, decision) in SETTLING and authority in ('source_review', 'user_correction') and data.get('personKey'):
            keys.add(data['personKey'])
        if authority == 'user_correction':
            keys |= {x.removeprefix('local:') for x in (subject, obj, data.get('a'), data.get('b')) if isinstance(x, str) and x.startswith('local:')}
            if data.get('personKey'):
                keys.add(data['personKey'])
        for key in keys:
            out[key].append(dict(recordId=record_id, kind=kind, authority=authority, decision=decision, payloadSha256=payload_sha))
    return {k: sorted(v, key=encode) for k, v in out.items()}


def build(rows_by_passage, registry, duplicates, parent, spans=None, settled=None):
    """rows_by_passage: the v1 rows that source_readings.records() builds, one list per reading.

    settled maps a person key to the human correction or accepted identity that already decides it. Those
    people get no candidates: a reviewer's answer always outranks a name match.
    """
    cases, skipped = [], []
    for rows in rows_by_passage:
        passage = next(r for r in rows if r['kind'] == 'passage')
        source_reading = next(r for r in rows if r['kind'] == 'source_reading')
        for row in (r for r in rows if r['kind'] == 'person'):
            reading, key = row['data']['reading'], row['record_id'].removeprefix('person:')
            if reading['kind'] != 'person' or reading['form'] not in ('named', 'embedded_parent'):
                skipped.append(dict(personKey=key, reason=f'{reading["kind"]}/{reading["form"]} is not matched to the registry'))
                continue
            if key in (settled or {}):
                require(all({'recordId', 'payloadSha256', 'authority', 'decision'} <= set(x) for x in settled[key]), 'Settlement needs its records')
                skipped.append(dict(personKey=key, reason='A human correction or accepted identity already decides this person',
                                    settledBy=settled[key]))
                continue
            case = build_case(row, passage, source_reading, registry, duplicates, parent)
            older = prior_reading(case['mentions'], reading['form'], spans or {})
            if {x['occurrenceKey'] for x in older['covered']} == {m['occurrenceKey'] for m in case['mentions']}:
                skipped.append(dict(personKey=key, reason='Older readings already placed every mention of this person, at the same words '
                                    'and in the same role', olderReading=older))
                continue
            cases.append(dict(case, olderReading=older))
    by_occurrence = defaultdict(set)
    for c in cases:
        for m in c['mentions']:
            by_occurrence[m['occurrenceKey']].add(c['personKey'])
    for c in cases:
        c['sameOccurrenceIn'] = sorted({k for m in c['mentions'] for k in by_occurrence[m['occurrenceKey']]} - {c['personKey']})
        c['contextOnly'] = not any(m['primary'] for m in c['mentions'])
    return cases, skipped


def rules_sha():
    return digest(dict(version=VERSION, rules=RULES, siteList=SITE_LIST, siteReadings=SITE_READINGS, siteMeir=SITE_MEIR,
                       matcherList=MATCHER_LIST, unreviewedReadings=UNREVIEWED_READINGS, titles=TITLES, patronymic=PATRONYMIC,
                       nonSageSlugs=sorted(NON_SAGE_SLUGS), wordPrefix=WORD_PREFIX.pattern, patronymicBefore=PATRONYMIC_BEFORE.pattern,
                       titlePrefix=TITLE_PREFIX.pattern, abbreviationPrefix=ABBREVIATION_PREFIX.pattern, settling=sorted(SETTLING),
                       quotes=sorted(QUOTES.items()), bindingFormat=BINDING_FORMAT))


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha256_file(path):
    return sha256_bytes(Path(path).read_bytes())


def envelope(registry, parent, he_aliases_bytes, duplicates_bytes):
    """Everything an output depends on, so an importer can rebuild it exactly and refuse any difference."""
    return dict(version=VERSION, rulesSha256=rules_sha(), matcherFileSha256=sha256_file(__file__),
                heAliasesSha256=sha256_bytes(he_aliases_bytes), duplicatesSha256=sha256_bytes(duplicates_bytes),
                parentRevision=parent, registryRecordSetSha256=registry['registryRecordSetSha256'], registryRecords=registry['registryRecords'])


def record(case, producer):
    data = dict(case, producer=producer)
    return dict(record_id=f'{KIND}:v1/{case["personKey"]}', kind=KIND, passage_id=case['passageId'], ref=case['ref'],
                subject_id=case['personKey'], object_id=None, authority='screening', decision='needs_review', data=data)
