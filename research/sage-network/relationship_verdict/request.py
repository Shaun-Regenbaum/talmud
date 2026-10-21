"""Build the request for one job. No network calls.

The model sees the source text, each person's exact mention, and the claims to check. It does
not see the job's record bindings, the sample's strata, earlier labels or verdicts: those
never enter a job's model view.
"""
import json
from pathlib import Path

try:
    from .contract import SCHEMA, VERSION
    from .validate import canonical, check_job, digest, recipe_binding
except ImportError:
    from contract import SCHEMA, VERSION
    from validate import canonical, check_job, digest, recipe_binding

MODEL_VIEW = ('job_id', 'reference', 'sources', 'people', 'claims')


def model_view(job):
    return {key: job[key] for key in MODEL_VIEW}


def build_request(job):
    check_job(job)
    guide = Path(__file__).with_name('reader.md').read_text()
    body = {'contract': VERSION, 'answer_schema': SCHEMA, 'job': model_view(job)}
    return {'recipe_version': VERSION, 'recipe': recipe_binding(), 'job_sha256': digest(job),
            'request_sha256': digest({'guide': guide, 'body': body}),
            'messages': [{'role': 'system', 'content': guide}, {'role': 'user', 'content': canonical(body)}]}


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Prepare one verdict request without calling any service.')
    parser.add_argument('job', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.write_text(json.dumps(build_request(json.loads(args.job.read_text())), ensure_ascii=False, indent=2) + '\n')
