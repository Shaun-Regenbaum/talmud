"""Explicitly move a finished probe's spending scope to one reviewed 210-job trial."""
from decimal import Decimal
from pathlib import Path
from queue_core import (atomic, config_check, digest, file_hash, jobs, load,
                        payload_for, recipe_adapter, recipe_files, reservation,
                        safe_id, saved, verified_carry)


def bridge(probe_inputs, probe_runs, full_inputs, full_runs,
           prior_run, next_run, prior_hash, next_hash, commit_probe, commit_full):
    """Caller holds the volume-wide queue lock. This function makes no provider calls."""
    safe_id(prior_run); safe_id(next_run)
    before_dir, after_dir = probe_inputs/prior_run, full_inputs/next_run
    prior, following = load(before_dir/'config.json'), load(after_dir/'config.json')
    if (digest(prior) != prior_hash or digest(following) != next_hash or
            prior['runId'] != prior_run or following['runId'] != next_run):
        raise ValueError('Reviewed bridge config hash differs')
    old_scope = dict(runId=prior_run, configHash=prior_hash)
    new_scope = dict(runId=next_run, configHash=next_hash)
    source_scope, target_scope = probe_runs/'budget-scope.json', full_runs/'budget-scope.json'
    if load(source_scope) not in (old_scope, new_scope):
        raise ValueError('Probe scope changed before bridge')
    if target_scope.exists() and load(target_scope) != new_scope:
        raise ValueError('Full queue already owns a different spending scope')
    if load(probe_runs/prior_run/'config.json') != prior:
        raise ValueError('Prior persisted config differs')
    if prior.get('executionMode') != 'probe' or following.get('qualityTrial') != 'source-readings-210-v1':
        raise ValueError('Bridge is only for the reviewed source-reading quality trial')
    for field in ('keyFingerprint', 'recipeFiles', 'parameters', 'route'):
        if prior[field] != following[field]:
            raise ValueError('Quality trial changes frozen ' + field)
    old_manifest, new_manifest = [load(p/'queue-manifest.json') for p in (before_dir, after_dir)]
    if digest(old_manifest) != prior['inputManifestHash'] or old_manifest['jobs'] != 3:
        raise ValueError('Prior probe manifest differs')
    if recipe_files(before_dir/'recipe') != prior['recipeFiles']:
        raise ValueError('Prior recipe files differ')
    config_check(following, new_manifest, after_dir/'recipe', following['approvedConcurrency'])
    for directory, manifest in ((before_dir, old_manifest), (after_dir, new_manifest)):
        for name, field in [('source-manifest.json', 'sourceManifestSha256'),
                            ('source-verification.json', 'sourceVerificationSha256')]:
            if file_hash(directory/name) != manifest[field]:
                raise ValueError('Captured source receipt differs')
    adapter = recipe_adapter(before_dir/'recipe')
    next_adapter = recipe_adapter(after_dir/'recipe')
    new_jobs, maximum = {}, Decimal(0)
    for job in jobs(after_dir, new_manifest):
        new_jobs[job['job_id']] = digest(job)
        maximum += Decimal(str(reservation(payload_for(job, next_adapter, following), following)))
    known, unknown, evidence = Decimal(0), Decimal(0), []
    old_jobs = set()
    for job in jobs(before_dir, old_manifest):
        jid = job['job_id']; old_jobs.add(jid)
        if new_jobs.get(jid) != digest(job):
            raise ValueError('Quality dataset must retain the exact three probe inputs')
        directory = probe_runs/prior_run
        attempt, result = saved(job, directory, prior, adapter)
        if attempt is None or result is None or result['status'] == 'interrupted':
            raise ValueError('Probe has unfinished requests')
        if result.get('costUsd') is None:
            unknown += Decimal(str(attempt['reservedUsd']))
        else:
            if result['costUsd'] > attempt['reservedUsd']:
                raise ValueError('Probe charge exceeds reservation')
            known += Decimal(str(result['costUsd']))
        evidence.append(dict(jobId=jid, costUsd=result['costUsd'],
            attemptSha256=file_hash(directory/'attempts'/(jid+'.json')),
            resultSha256=file_hash(directory/'results'/(jid+'.json'))))
    for kind in ('attempts', 'results'):
        if {p.stem for p in (probe_runs/prior_run/kind).glob('*.json')} != old_jobs:
            raise ValueError('Unexpected probe saved records')
    prior_cost = dict(runId=prior_run, configHash=prior_hash,
                      reportedCostUsd=float(known), unknownReservedUsd=float(unknown))
    carried = float(Decimal(str(verified_carry(prior, probe_runs))) + unknown)
    if following.get('priorRun') != prior_cost or following.get('carriedUnknownReservedUsd', 0) != carried:
        raise ValueError('Quality trial must preserve exact prior costs and unknown holds')
    if maximum + Decimal(str(carried)) > Decimal(str(following['budgetUsd'])):
        raise ValueError('Trial budget cannot reserve all reviewed source jobs')
    prior_carry_receipt = None
    if prior.get('carriedUnknownReservedUsd', 0):
        prior_carry_receipt = file_hash(probe_runs/'budget-history'/(prior['priorRun']['configHash']+'-'+prior_hash+'.json'))
    receipt = dict(priorCarryReceiptSha256=prior_carry_receipt, previousScope=old_scope, nextScope=new_scope, priorCost=prior_cost,
                   carriedUnknownReservedUsd=carried, evidence=evidence,
                   qualityInputManifestHash=following['inputManifestHash'],
                   maximumNewReservationUsd=float(maximum), acceptedFacts=0,
                   bridgeHash=file_hash(Path(__file__)),
                   reason='Explicit reviewed transfer to the bounded 210-source quality trial')
    receipt['transitionHash'] = digest(receipt)
    archive = full_runs/'budget-history'/(prior_hash+'-'+next_hash+'.json')
    if archive.exists():
        if load(archive) != receipt:
            raise ValueError('Existing quality bridge receipt differs')
    else:
        if target_scope.exists() or load(source_scope) != old_scope:
            raise ValueError('Scope changed without its bridge receipt')
        atomic(archive, receipt); commit_full()
    if target_scope.exists():
        if load(source_scope) != new_scope:
            raise ValueError('Full scope is active before probe scope was retired')
        return receipt
    # Retire the old volume before making the new volume runnable. The full runner
    # requires the target scope, so an interruption between commits cannot dispatch.
    if load(source_scope) == old_scope:
        atomic(source_scope, new_scope); commit_probe()
    if load(source_scope) != new_scope or target_scope.exists():
        raise ValueError('Spending scope changed during bridge')
    atomic(target_scope, new_scope); commit_full()
    return receipt
