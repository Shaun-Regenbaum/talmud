"""Check a raw compact-source-v4 answer, compile its unit ranges, and run the unchanged v2 checks.

Every step passes or refuses the whole answer; nothing is defaulted and nothing is matched loosely.
Exact quotes do not certify an interpretation.

Order (DESIGN.md, "The order of checks"):
  1. the job: v2's job check, unique source IDs, every text matching its sha256
  2. the request the model saw: rebuilt in full and compared, messages and hashes included
  3. the raw answer against the v4 schema
  4-5. unit ranges compiled to exact v2-form anchors
  6. the pinned compact-source-v2 check, unchanged, on the derived v2-form answer
  7. the saved record: raw answer, binding, compile map, derived answer, v2 verdict, all hashed

The v2 code is loaded from pinned bytes by dependency.py, never from an ambient import.
"""
import copy

from jsonschema import Draft202012Validator

try:
    from . import units
    from .body import RecipeChanged, assemble_request, digest, recipe_binding, source_bindings, verify_running_code
    from .contract import SCHEMA, VERSION
    from .dependency import V2, DependencyError
except ImportError:
    import units
    from body import RecipeChanged, assemble_request, digest, recipe_binding, source_bindings, verify_running_code
    from contract import SCHEMA, VERSION
    from dependency import V2, DependencyError


class Invalid(ValueError):
    def __init__(self, code, detail):
        self.code = code
        super().__init__(f'{code}: {detail}')


def require(condition, code, detail):
    if not condition:
        raise Invalid(code, detail)


def check_running_code():
    try:
        verify_running_code()
    except (DependencyError, RecipeChanged) as e:
        raise Invalid('recipe_changed', str(e))


def check_job(job):
    check_running_code()
    try:
        sources = V2.check_job(job)
    except V2.Invalid as e:
        raise Invalid(e.code, str(e))
    ids = [s['source_id'] for s in job['sources']]
    require(len(set(ids)) == len(ids), 'source_id', 'duplicate source ID')
    return sources


def check_request(job, request):
    """The request must be exactly the one this recipe builds for this job, byte for byte."""
    require(isinstance(request, dict), 'request', 'the request record is required')
    expected = assemble_request(job)
    require(set(request) == set(expected), 'request', f'request fields differ: {sorted(set(request) ^ set(expected))}')
    require(request['recipe_version'] == expected['recipe_version'], 'request_recipe', 'request was built by another recipe version')
    require(request['recipe'] == expected['recipe'], 'request_recipe', 'request recipe differs from this recipe')
    require(request['job_sha256'] == expected['job_sha256'], 'request_job', 'request was built for another job')
    require(request['units'] == expected['units'], 'request_units', 'unit tables differ from the ones this job gives')
    for key in ('messages', 'response_format', 'request_sha256'):
        require(request[key] == expected[key], 'request_body', f'{key} differs from the request this recipe builds')


def check(job, answer, request):
    check_job(job)
    check_request(job, request)
    errors = list(Draft202012Validator(SCHEMA).iter_errors(answer))
    require(not errors, 'schema', '; '.join(f'{list(e.path)} {e.message}' for e in errors[:3]))
    require(answer['job_id'] == job['job_id'], 'job_id', 'answer belongs to another job')
    try:
        derived, compiled = units.compile_answer(job, answer, {b['source_id']: b for b in request['units']})
    except units.UnitError as e:
        raise Invalid(e.code, str(e))
    derived['schema_version'] = V2.VERSION
    try:
        verdict = V2.check(job, derived)
    except V2.Invalid as e:
        raise Invalid(f'v2:{e.code}', str(e))
    record = {
        'raw': {'schema_version': VERSION, 'answer': copy.deepcopy(answer), 'answer_sha256': digest(answer)},
        'binding': {'recipe': recipe_binding(), 'job_sha256': digest(job), 'request_sha256': request['request_sha256'],
                    'sources': source_bindings(job)},
        'compile': {'map': compiled['anchors'], 'derived_v2_answer': derived, 'derived_v2_answer_sha256': digest(derived),
                    'derived_from': digest(answer)},
        'v2_check': verdict,
    }
    record['record_sha256'] = digest(record)
    return record


def check_saved(job, request, saved):
    """A resume must reproduce the complete record from the raw answer, not merely find a file."""
    require(isinstance(saved, dict) and isinstance(saved.get('raw'), dict) and 'answer' in saved['raw'], 'saved_record', 'raw answer missing')
    expected = check(job, saved['raw']['answer'], request)
    require(saved == expected, 'saved_binding', 'job, sources, recipe, request, raw answer, compile or verdict changed')
    return expected
