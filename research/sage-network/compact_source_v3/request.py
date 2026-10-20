"""Build the complete source-only request. No network or production writes."""
import json
from pathlib import Path

try:
    from .contract import RELATIONS, SCHEMA, VERSION
    from .validate import canonical, check_job, digest, recipe_binding
except ImportError:
    from contract import RELATIONS, SCHEMA, VERSION
    from validate import canonical, check_job, digest, recipe_binding


def build_request(job):
    check_job(job)
    guide = Path(__file__).with_name('reader.md').read_text()
    body = {'instructions': guide,
            'relations': {name: {'category': pair[0], 'direction': pair[1]} for name, pair in RELATIONS.items()},
            'schema': SCHEMA, 'job': job}
    return {'recipe_version': VERSION, 'recipe': recipe_binding(), 'job_sha256': digest(job),
            'request_sha256': digest(body), 'messages': [{'role': 'user', 'content': canonical(body)}],
            'response_format': {'type': 'json_object'}}


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Prepare a compact research request without calling any service.')
    parser.add_argument('job', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.write_text(json.dumps(build_request(json.loads(args.job.read_text())), ensure_ascii=False, indent=2) + '\n')
