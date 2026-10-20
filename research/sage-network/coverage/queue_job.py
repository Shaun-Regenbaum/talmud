"""Private remote queue; deploy and launch only after the source-reading sample is approved."""
from pathlib import Path
import os
import modal

MODE = os.environ.get('COVERAGE_QUEUE_MODE', 'full')
if MODE not in {'full', 'probe'}:
    raise ValueError('Unknown queue execution mode')
APP_NAME = 'talmud-name-coverage-probe-v18' if MODE == 'probe' else 'talmud-name-coverage-queue-v18'
app = modal.App(APP_NAME)
volume = modal.Volume.from_name(APP_NAME, create_if_missing=True)
probe_volume = modal.Volume.from_name('talmud-name-coverage-probe-v18')
locks = modal.Dict.from_name('talmud-name-coverage-queue-v18-locks', create_if_missing=True)
image = (modal.Image.debian_slim(python_version='3.12').apt_install('curl')
         .env({'COVERAGE_QUEUE_MODE': MODE})
         .pip_install('jsonschema==4.25.1')
         .add_local_file(Path(__file__).with_name('queue_core.py'), '/app/queue_core.py')
         .add_local_file(Path(__file__).with_name('provider_errors.py'), '/app/provider_errors.py')
         .add_local_file(Path(__file__), '/app/queue_job.py')
         .add_local_file(Path(__file__).with_name('queue_transition.py'), '/app/queue_transition.py')
         .add_local_file(Path(__file__).with_name('quality_bridge.py'), '/app/quality_bridge.py')
         .add_local_file(Path(__file__).with_name('matched_transition.py'), '/app/matched_transition.py')
         .add_local_file(Path(__file__).with_name('provider_recovery.py'), '/app/provider_recovery.py')
         .add_local_file(Path(__file__).with_name('unit_trial_transition.py'), '/app/unit_trial_transition.py'))


@app.function(image=image, volumes={'/data': volume},
              secrets=[modal.Secret.from_name('talmud-identity-wide-review')],
              cpu=1, memory=2048, timeout=86400, retries=0, max_containers=1)
def read_queue(run_id: str, concurrency: int = 16):
    import json
    import signal
    import sys
    import threading
    import uuid
    sys.path.insert(0, '/app')
    from queue_core import Transport, file_hash, run, safe_id
    safe_id(run_id)
    owner = str(uuid.uuid4())
    # One lock across all run IDs prevents separate run folders spending concurrently.
    if not locks.put('queue', {'owner': owner, 'runId': run_id}, skip_if_exists=True):
        raise RuntimeError('Earlier queue is running or its lock needs reconciliation')
    transport = Transport()
    stop = threading.Event()
    def terminate(signum, frame):
        stop.set()
        transport.close()
    previous = signal.signal(signal.SIGTERM, terminate)
    try:
        volume.reload()
        bundle = Path('/data/inputs') / run_id
        config = json.loads((bundle/'config.json').read_text())
        if config.get('executionMode') != MODE:
            raise ValueError('Frozen execution mode differs')
        if MODE == 'probe' and (config['budgetUsd'] > 0.10 or concurrency > 3 or
                                json.loads((bundle/'queue-manifest.json').read_text())['jobs'] > 3):
            raise ValueError('Probe must stay within 10 cents and three concurrent jobs')
        if config.get('coordinatorHash') != file_hash(Path('/app/queue_job.py')):
            raise ValueError('Frozen coordinator code differs')
        if config['runId'] != run_id:
            raise ValueError('Run directory differs from config')
        return run(config, bundle, bundle/'recipe', Path('/data/runs'), volume.commit,
                   concurrency=concurrency, request=transport, stop_event=stop)
    finally:
        transport.close()
        signal.signal(signal.SIGTERM, previous)
        # A hard container kill can leave the lock. Do not auto-expire and risk two spenders.
        if locks.get('queue', None) == {'owner': owner, 'runId': run_id}:
            locks.pop('queue')


@app.function(image=image, volumes={'/data': volume}, cpu=0.125, memory=128, timeout=60)
def status(run_id: str):
    import json
    import sys
    sys.path.insert(0, '/app')
    from queue_core import safe_id
    safe_id(run_id)
    volume.reload()
    path = Path('/data/runs') / run_id / 'progress.json'
    return {'lock': locks.get('queue', None),
            'progress': json.loads(path.read_text()) if path.exists() else {'status': 'not_started'}}


@app.function(image=image, volumes={'/data': volume}, cpu=0.25, memory=256, timeout=120,
              retries=0, max_containers=1)
def transition_probe(prior_run: str, next_run: str, prior_hash: str, next_hash: str):
    import sys
    import uuid
    sys.path.insert(0, '/app')
    from queue_core import file_hash, load
    from queue_transition import transition
    if MODE != 'probe':
        raise ValueError('Budget transitions are restricted to the probe volume')
    owner = str(uuid.uuid4())
    lock = {'owner': owner, 'runId': 'transition:' + prior_run + ':' + next_run}
    if not locks.put('queue', lock, skip_if_exists=True):
        raise RuntimeError('A queue is running or its lock needs reconciliation')
    try:
        volume.reload()
        from queue_core import safe_id
        safe_id(next_run)
        following = load(Path('/data/inputs')/next_run/'config.json')
        if following.get('coordinatorHash') != file_hash(Path('/app/queue_job.py')):
            raise ValueError('Next probe coordinator hash differs')
        if following.get('transitionHash') != file_hash(Path('/app/queue_transition.py')):
            raise ValueError('Reviewed transition code hash differs')
        return transition(Path('/data/inputs'), Path('/data/runs'), prior_run, next_run,
                          prior_hash, next_hash, volume.commit)
    finally:
        if locks.get('queue', None) == lock:
            locks.pop('queue')


@app.function(image=image, volumes=({'/data': volume, '/probe': probe_volume} if MODE == 'full' else {'/data': volume}),
              cpu=0.25, memory=512, timeout=180, retries=0, max_containers=1)
def initialize_quality_trial(prior_run: str, next_run: str, prior_hash: str, next_hash: str):
    import sys
    import uuid
    sys.path.insert(0, '/app')
    from quality_bridge import bridge
    from queue_core import file_hash, load, safe_id
    if MODE != 'full':
        raise ValueError('Quality bridge must run from the full queue app')
    safe_id(next_run)
    owner = str(uuid.uuid4())
    lock = {'owner': owner, 'runId': 'quality:' + prior_run + ':' + next_run}
    if not locks.put('queue', lock, skip_if_exists=True):
        raise RuntimeError('A queue or transition is already running')
    try:
        volume.reload(); probe_volume.reload()
        config = load(Path('/data/inputs')/next_run/'config.json')
        if (config.get('coordinatorHash') != file_hash(Path('/app/queue_job.py')) or
                config.get('qualityBridgeHash') != file_hash(Path('/app/quality_bridge.py'))):
            raise ValueError('Reviewed quality coordinator hash differs')
        return bridge(Path('/probe/inputs'), Path('/probe/runs'),
                      Path('/data/inputs'), Path('/data/runs'), prior_run, next_run,
                      prior_hash, next_hash, probe_volume.commit, volume.commit)
    finally:
        if locks.get('queue', None) == lock:
            locks.pop('queue')


@app.function(image=image, volumes={'/data': volume}, cpu=0.25, memory=512,
              timeout=180, retries=0, max_containers=1)
def transition_matched_trial(prior_run: str, next_run: str, prior_hash: str, next_hash: str):
    import sys
    import uuid
    sys.path.insert(0, '/app')
    from matched_transition import transition
    from queue_core import file_hash, load, safe_id
    if MODE != 'full':
        raise ValueError('Matched comparisons require the full volume')
    safe_id(prior_run); safe_id(next_run)
    lock = {'owner': str(uuid.uuid4()), 'runId': 'matched:' + prior_run + ':' + next_run}
    if not locks.put('queue', lock, skip_if_exists=True):
        raise RuntimeError('A queue or transition is already running')
    try:
        volume.reload()
        following = load(Path('/data/inputs')/next_run/'config.json')
        if (following.get('coordinatorHash') != file_hash(Path('/app/queue_job.py')) or
                following.get('matchedTransitionHash') != file_hash(Path('/app/matched_transition.py'))):
            raise ValueError('Reviewed matched coordinator differs')
        return transition(Path('/data/inputs'), Path('/data/runs'), prior_run, next_run,
                          prior_hash, next_hash, volume.commit)
    finally:
        if locks.get('queue', None) == lock:
            locks.pop('queue')


@app.function(image=image, volumes={'/data': volume}, cpu=0.25, memory=512,
              timeout=180, retries=0, max_containers=1)
def reconcile_provider_failure(prior_run: str, next_run: str, prior_hash: str, next_hash: str):
    import sys
    import uuid
    sys.path.insert(0, '/app')
    from provider_recovery import transition
    from queue_core import file_hash, load, safe_id
    if MODE != 'full':
        raise ValueError('Matched comparisons require the full volume')
    safe_id(prior_run); safe_id(next_run)
    lock = {'owner': str(uuid.uuid4()), 'runId': 'recovery:' + prior_run + ':' + next_run}
    if not locks.put('queue', lock, skip_if_exists=True):
        raise RuntimeError('A queue or transition is already running')
    try:
        volume.reload()
        following = load(Path('/data/inputs')/next_run/'config.json')
        if (following.get('coordinatorHash') != file_hash(Path('/app/queue_job.py')) or
                following.get('providerRecoveryHash') != file_hash(Path('/app/provider_recovery.py'))):
            raise ValueError('Reviewed matched coordinator differs')
        return transition(Path('/data/inputs'), Path('/data/runs'), prior_run, next_run,
                          prior_hash, next_hash, volume.commit)
    finally:
        if locks.get('queue', None) == lock:
            locks.pop('queue')


@app.function(image=image, volumes={'/data': volume}, cpu=0.25, memory=512,
              timeout=180, retries=0, max_containers=1)
def transition_source_unit_trial(prior_run: str, next_run: str, prior_hash: str, next_hash: str):
    import sys
    import uuid
    sys.path.insert(0, '/app')
    from unit_trial_transition import transition
    from queue_core import file_hash, load, safe_id
    if MODE != 'full':
        raise ValueError('Matched comparisons require the full volume')
    safe_id(prior_run); safe_id(next_run)
    lock = {'owner': str(uuid.uuid4()), 'runId': 'source-units:' + prior_run + ':' + next_run}
    if not locks.put('queue', lock, skip_if_exists=True):
        raise RuntimeError('A queue or transition is already running')
    try:
        volume.reload()
        following = load(Path('/data/inputs')/next_run/'config.json')
        if (following.get('coordinatorHash') != file_hash(Path('/app/queue_job.py')) or
                following.get('unitTrialTransitionHash') != file_hash(Path('/app/unit_trial_transition.py'))):
            raise ValueError('Reviewed matched coordinator differs')
        return transition(Path('/data/inputs'), Path('/data/runs'), prior_run, next_run,
                          prior_hash, next_hash, volume.commit)
    finally:
        if locks.get('queue', None) == lock:
            locks.pop('queue')


@app.local_entrypoint()
def launch(run_id: str, receipt: str, concurrency: int = 16):
    import json
    import os
    if os.environ.get('MODAL_PROFILE') != 'shaun-regenbaum':
        raise RuntimeError('Select the personal Modal profile explicitly')
    remote = modal.Function.from_name(APP_NAME, 'read_queue')
    call = remote.spawn(run_id, concurrency)
    Path(receipt).write_text(json.dumps(dict(callId=call.object_id, runId=run_id,
        concurrency=concurrency, app=APP_NAME, volume=APP_NAME), indent=2)+'\n')
    print('Started', call.object_id)
