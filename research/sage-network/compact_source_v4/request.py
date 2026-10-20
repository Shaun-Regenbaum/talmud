"""Build the complete source-only request for compact-source-v4. No network or production writes.

The model is shown each source as a list of numbered units in place of its text; the frozen job,
with its text and sha256, stays as it is and is bound by hash. The request record keeps the recipe,
the job hash and every unit table. validate.check rebuilds this record and compares all of it.
"""
import json
from pathlib import Path

try:
    from .body import assemble_request
    from .validate import check_job
except ImportError:
    from body import assemble_request
    from validate import check_job


def build_request(job):
    check_job(job)
    return assemble_request(job)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Prepare a compact-source-v4 research request without calling any service.')
    parser.add_argument('job', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.write_text(json.dumps(build_request(json.loads(args.job.read_text())), ensure_ascii=False, indent=2) + '\n')
