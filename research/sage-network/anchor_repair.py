"""Auditable prefix-only mention amendments; the source validator stays unchanged."""
import copy
import re
from pathlib import Path

from compact_source.validate import Invalid, check, check_job, digest, hebrew_word_character, sha

VERSION = 'titled-name-left-prefix-v1'
PREFIXES = frozenset('ובלמשכד')
# Deliberately exclude bare names, pronouns and multiword phrases without a title.
TITLED_NAME = re.compile(r"(?:רב|רבי|רבן|ר['׳]) [א-ת]+(?: [א-ת]+)*\Z")


def starts(text, quote):
    found, offset = [], 0
    while (offset := text.find(quote, offset)) >= 0:
        found.append(offset)
        offset += 1
    return found


def amend(job, original):
    """Return original, amended answer and receipt only after strict revalidation."""
    try:
        compiled = check(job, original)
    except Invalid as error:
        if error.code != 'mention_boundary':
            raise
    sources = check_job(job)
    amended = copy.deepcopy(original)
    changes = []
    for person in amended['people']:
        for index, anchor in enumerate(person['mentions']):
            text = sources[anchor['source_id']]['text']
            positions = starts(text, anchor['quote'])
            if not 1 <= anchor['occurrence'] <= len(positions):
                raise Invalid('anchor_quote', person['id'])
            start = positions[anchor['occurrence'] - 1]
            end = start + len(anchor['quote'])
            if not hebrew_word_character(text, start - 1) and not hebrew_word_character(text, end):
                continue
            eligible = (person['kind'] == 'person' and person['form'] == 'named' and
                        TITLED_NAME.fullmatch(anchor['quote']) and start > 0 and
                        text[start - 1] in PREFIXES and
                        not hebrew_word_character(text, start - 2) and
                        not hebrew_word_character(text, end))
            if not eligible:
                raise Invalid('prefix_repair_ineligible', person['id'])
            before = copy.deepcopy(anchor)
            anchor['quote'] = text[start - 1:end]
            anchor['occurrence'] = starts(text, anchor['quote']).index(start - 1) + 1
            changes.append(dict(path=f"people/{person['id']}/mentions/{index}",
                                original=before, amended=copy.deepcopy(anchor),
                                originalStart=start, amendedStart=start - 1, end=end,
                                sourceSha256=sources[anchor['source_id']]['sha256'],
                                reason='Include the single attached Hebrew prefix before a titled name'))
    compiled = check(job, amended)
    receipt = dict(version=VERSION, helperSha256=sha(Path(__file__).read_bytes()),
                   jobSha256=digest(job), originalAnswerSha256=digest(original),
                   amendedAnswerSha256=digest(amended), changes=changes,
                   offsetUnit='Unicode code points', validatorRecipe=compiled['recipe'])
    receipt['receiptSha256'] = digest(receipt)
    return dict(original=copy.deepcopy(original), amended=amended, receipt=receipt, compiled=compiled)
