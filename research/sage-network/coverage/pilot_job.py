"""Read a frozen source-only sample remotely, with saved attempts and a hard cap."""
from pathlib import Path
import modal

ROOT = Path(__file__).resolve().parents[1]
app = modal.App('talmud-name-coverage-pilot-v18')
volume = modal.Volume.from_name('talmud-name-coverage-pilot-v18', create_if_missing=True)
locks = modal.Dict.from_name('talmud-name-coverage-pilot-v18-locks', create_if_missing=True)
image = (modal.Image.debian_slim(python_version='3.12').apt_install('curl')
         .pip_install('jsonschema==4.25.1')
         .add_local_dir(ROOT / 'pilot', '/app/pilot', ignore=['outputs', 'inputs', 'compiled', 'reviews', '__pycache__'])
         .add_local_file(Path(__file__).with_name('sample_runner.py'), '/app/sample_runner.py'))

@app.function(image=image, volumes={'/data': volume},
              secrets=[modal.Secret.from_name('talmud-identity-wide-review')],
              cpu=0.5, memory=512, timeout=3600, retries=0, max_containers=1)
def read_sample(bundle: dict):
    import sys
    sys.path.insert(0, '/app')
    from sample_runner import run
    if not locks.put('sample', 'running', skip_if_exists=True):
        raise RuntimeError('An earlier sample is running or needs reconciliation')
    try:
        volume.reload()
        return run(bundle, Path('/data'), volume.commit)
    finally:
        locks.pop('sample')

@app.function(image=image, volumes={'/data': volume}, cpu=0.125, memory=128, timeout=60)
def status(run_id: str):
    import json,re
    if not re.fullmatch(r'[a-z0-9-]+', run_id):
        raise ValueError('Invalid run id')
    volume.reload()
    path = Path('/data') / run_id / 'progress.json'
    return json.loads(path.read_text()) if path.exists() else {'status': 'not_started'}

@app.local_entrypoint()
def launch(bundle: str, receipt: str):
    import json
    data = json.loads(Path(bundle).read_text())
    remote = modal.Function.from_name('talmud-name-coverage-pilot-v18', 'read_sample')
    call = remote.spawn(data)
    Path(receipt).write_text(json.dumps({'callId': call.object_id, 'runId': data['runId'],
        'app': 'talmud-name-coverage-pilot-v18', 'volume': 'talmud-name-coverage-pilot-v18'}, indent=2)+'\n')
    print('Started', call.object_id)
