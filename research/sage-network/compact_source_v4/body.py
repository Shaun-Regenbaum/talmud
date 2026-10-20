"""The one place that builds a v4 request. Both request.py (to send it) and validate.py (to rebuild
and compare it) use this, so the two can never drift apart and neither imports the other.
No checks happen here; callers check the job first.
"""
import copy
from pathlib import Path

try:
    from . import units
    from .contract import RELATIONS, SCHEMA, VERSION
    from .dependency import NAMESPACE, PINNED, V2
except ImportError:
    import units
    from contract import RELATIONS, SCHEMA, VERSION
    from dependency import NAMESPACE, PINNED, V2

canonical, sha, digest = V2.canonical, V2.sha, V2.digest
ROOT = Path(__file__).parent
RECIPE_FILES = ('contract.py', 'validate.py', 'request.py', 'reader.md', 'units.py', 'body.py', 'dependency.py')


def recipe_binding():
    """The producer recipe: every v4 file, the splitter and layout versions, and the pinned v2 files
    whose checks run unchanged."""
    files = {name: sha((ROOT / name).read_bytes()) for name in RECIPE_FILES}
    depends = {f'compact_source_v2/{name}': h for name, h in PINNED.items()}
    bound = {'files': files, 'depends_on': depends, 'v2_namespace': NAMESPACE, 'tokenizer': units.TOKENIZER, 'display': units.DISPLAY}
    return {'version': VERSION, **bound, 'sha256': digest(bound)}


def source_bindings(job):
    return [units.binding(s) for s in job['sources']]


def shown_job(job):
    shown = copy.deepcopy(job)
    for s in shown['sources']:
        s['units'] = units.unit_list(s)
        del s['text']
    return shown


def build_body(job):
    return {'instructions': (ROOT / 'reader.md').read_text(),
            'relations': {name: {'category': pair[0], 'direction': pair[1]} for name, pair in RELATIONS.items()},
            'schema': SCHEMA, 'job': shown_job(job)}


def assemble_request(job):
    body = build_body(job)
    return {'recipe_version': VERSION, 'recipe': recipe_binding(), 'job_sha256': digest(job), 'units': source_bindings(job),
            'request_sha256': digest(body), 'messages': [{'role': 'user', 'content': canonical(body)}],
            'response_format': {'type': 'json_object'}}
