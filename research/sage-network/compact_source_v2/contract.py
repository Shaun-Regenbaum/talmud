"""Compact local people and relationships. This recipe creates no historical facts."""

VERSION = 'compact-source-v2'


def obj(properties):
    return {'type': 'object', 'properties': properties, 'required': list(properties),
            'additionalProperties': False}


def arr(items, minimum=0):
    return {'type': 'array', 'items': items, 'minItems': minimum}


def enum(*values):
    return {'enum': list(values)}


TEXT = {'type': 'string', 'minLength': 1}
PERSON_ID = {'type': 'string', 'pattern': '^p[1-9][0-9]*$'}
ENDPOINT = {'anyOf': [PERSON_ID, {'type': 'null'}]}
ANCHOR = obj({'source_id': TEXT, 'quote': TEXT,
              'occurrence': {'type': 'integer', 'minimum': 1}})
# Category, direction. Directed predicates always read from subject to object.
RELATIONS = {
    'child_of': ('family', 'directed'),
    'child_in_law_of': ('family', 'directed'),
    'spouse_of': ('family', 'symmetric'),
    'sibling_of': ('family', 'symmetric'),
    'acts_on': ('action', 'directed'),
    'speaks_to': ('action', 'directed'),
    'asks': ('debate', 'directed'),
    'answers': ('debate', 'directed'),
    'opposes': ('debate', 'directed'),
    'supports': ('debate', 'directed'),
    'responds_to_teaching': ('debate', 'directed'),
    'teaches': ('teaching', 'directed'),
    'student_of': ('teaching', 'directed'),
    'reports_in_name_of': ('teaching', 'directed'),
}

SCHEMA = obj({
    'schema_version': {'const': VERSION},
    'job_id': TEXT,
    'episode': obj({
        'coverage': enum('complete_for_supplied_text', 'needs_context'),
        'needed_context': arr(TEXT), 'notes': arr(TEXT),
    }),
    'people': arr(obj({
        'id': PERSON_ID,
        'kind': enum('person', 'group', 'deity', 'angel', 'supernatural', 'not_a_person'),
        'label': TEXT,
        'form': enum('named', 'embedded_parent', 'unnamed', 'generic'),
        'setting': enum('reported', 'hypothetical', 'uncertain'),
        'mentions': arr(ANCHOR, 1),
        'reason': TEXT,
        'alternatives': arr(obj({'person_id': ENDPOINT, 'reason': TEXT})),
    })),
    'relationships': arr(obj({
        'id': {'type': 'string', 'pattern': '^r[1-9][0-9]*$'},
        'subject': ENDPOINT, 'object': ENDPOINT,
        'alternatives': arr(obj({'subject': ENDPOINT, 'object': ENDPOINT, 'reason': TEXT})),
        'relation': enum(*RELATIONS),
        'verb': TEXT,
        'modality': enum('asserted', 'hypothetical', 'uncertain', 'response_to_teaching'),
        'scene_status': enum('actual_report', 'hypothetical', 'mixed'),
        'polarity': enum('positive', 'negative', 'uncertain'),
        'reason': TEXT,
        'evidence': arr(ANCHOR, 1),
    })),
})
