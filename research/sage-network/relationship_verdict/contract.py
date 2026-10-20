"""Verdicts on existing relationship claims: the fixed vocabulary and the answer shape.

The model judges claims that already exist. It never adds claims, people, quotes or
positions, and never names a historical identity.
"""

VERSION = 'relationship-verdict-v0.2'
MAX_CLAIMS = 12
SOURCE_IDS = ('before', 'passage', 'after')

# Does the claim hold exactly as written (its kind, direction and family degree)?
CLAIM_AS_WRITTEN = ('supported', 'contradicted', 'uncertain')
# What the text shows between the two people, whatever the claim says.
SUPPORTED_KIND = ('direct_interaction', 'teaching_transmission', 'response_to_teaching', 'family',
                  'narrative', 'hypothetical', 'none', 'unclear')
DIRECTION = ('as_written', 'reversed', 'undetermined', 'symmetric')
FAMILY_DEGREE = ('as_written', 'descent', 'unspecified', 'not_applicable')
# The seven codes earlier readers used, kept only so results can be compared with them.
LEGACY_VERDICT = ('ok', 'fam', 'teach', 'narr', 'hyp', 'unc', 'bad')
ASPECT = ('speaker', 'addressee', 'direction', 'kind', 'family_degree', 'presence', 'text_reading',
          'same_name', 'other')
DETAIL_STATUS = ('unclear', 'contradicted')

# Kinds that keep the two people connected even when the detailed claim is wrong.
PAIR_KINDS = ('direct_interaction', 'teaching_transmission', 'response_to_teaching', 'family', 'narrative')

REASON_MAX = 1000
NOTE_MAX = 300
MAX_DETAILS = 8


def enum(values):
    return {'enum': list(values)}


VERDICT = {
    'type': 'object', 'additionalProperties': False,
    'required': ['claim_id', 'claim_as_written', 'supported_kind', 'direction', 'family_degree', 'verdict',
                 'reason', 'uncertain_detail'],
    'properties': {
        'claim_id': {'type': 'string'},
        'claim_as_written': enum(CLAIM_AS_WRITTEN),
        'supported_kind': enum(SUPPORTED_KIND),
        'direction': enum(DIRECTION),
        'family_degree': enum(FAMILY_DEGREE),
        'verdict': enum(LEGACY_VERDICT),
        'reason': {'type': 'string', 'minLength': 1, 'maxLength': REASON_MAX},
        'uncertain_detail': {'type': 'array', 'maxItems': MAX_DETAILS, 'items': {
            'type': 'object', 'additionalProperties': False, 'required': ['aspect', 'status', 'note'],
            'properties': {'aspect': enum(ASPECT), 'status': enum(DETAIL_STATUS),
                           'note': {'type': 'string', 'maxLength': NOTE_MAX}}}},
    },
}
SCHEMA = {
    'type': 'object', 'additionalProperties': False, 'required': ['job_id', 'verdicts'],
    'properties': {'job_id': {'type': 'string'}, 'verdicts': {'type': 'array', 'items': VERDICT}},
}
