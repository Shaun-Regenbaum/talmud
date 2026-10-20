"""Explicit two-arm comparison on thirty unchanged source jobs in the full volume."""
from decimal import Decimal
from pathlib import Path
from queue_core import atomic, config_check, digest, file_hash, jobs, load, payload_for, recipe_adapter, recipe_files, reservation, safe_id, saved, verified_carry

VERSION = 'matched-source-30-v1'


def bounds(config, manifest):
    trial = config.get('comparisonTrial', {})
    required = {'version', 'experimentId', 'arm', 'incrementalCapUsd', 'priorExperimentCostUsd', 'baselineRun', 'baselineConfigHash', 'baselineKnownCostUsd', 'baselineUnknownReservedUsd'}
    if (set(trial) != required or trial['version'] != VERSION or trial['arm'] not in ('none', 'low') or
            manifest['jobs'] != 30 or config.get('executionMode') != 'full' or
            config.get('approvedConcurrency', 16) > 16 or config.get('qualityTrial') is not None or
            config.get('matchedTransitionHash') != file_hash(Path(__file__)) or not config.get('priorRun')):
        raise ValueError('Invalid matched thirty-job comparison')
    safe_id(trial['experimentId']); safe_id(trial['baselineRun'])
    from queue_core import money
    for field in ('incrementalCapUsd', 'priorExperimentCostUsd', 'baselineKnownCostUsd', 'baselineUnknownReservedUsd'):
        if not money(trial[field]):
            raise ValueError('Invalid comparison cost')
    if not 0 < trial['incrementalCapUsd'] <= .75:
        raise ValueError('Comparison exceeds the shared incremental cap')
    expected = Decimal(str(trial['incrementalCapUsd'])) - Decimal(str(trial['priorExperimentCostUsd'])) + Decimal(str(trial['baselineUnknownReservedUsd']))
    if expected <= 0 or float(expected) != config['budgetUsd']:
        raise ValueError('Comparison budget drops prior spending')
    if config['parameters']['reasoning'] != {'effort': trial['arm']}:
        raise ValueError('Comparison reasoning arm differs')
    return trial


def transition(inputs_root, output_root, prior_run, next_run, prior_hash, next_hash, commit):
    """Caller holds the full queue singleton lock; this never calls a provider."""
    safe_id(prior_run); safe_id(next_run)
    if prior_run == next_run:
        raise ValueError('Comparison requires a distinct run')
    old_input, new_input = inputs_root/prior_run, inputs_root/next_run
    prior, following = load(old_input/'config.json'), load(new_input/'config.json')
    if digest(prior) != prior_hash or digest(following) != next_hash or prior['runId'] != prior_run or following['runId'] != next_run:
        raise ValueError('Reviewed comparison config differs')
    old_scope, new_scope = dict(runId=prior_run, configHash=prior_hash), dict(runId=next_run, configHash=next_hash)
    scope_path = output_root/'budget-scope.json'; scope = load(scope_path)
    if scope not in (old_scope, new_scope) or load(output_root/prior_run/'config.json') != prior:
        raise ValueError('Prior comparison scope differs')
    old_manifest, manifest = load(old_input/'queue-manifest.json'), load(new_input/'queue-manifest.json')
    if digest(old_manifest) != prior['inputManifestHash'] or recipe_files(old_input/'recipe') != prior['recipeFiles']:
        raise ValueError('Prior source or recipe differs')
    config_check(following, manifest, new_input/'recipe', following['approvedConcurrency'])
    trial = bounds(following, manifest)
    if prior.get('executionMode') != 'full' or following['keyFingerprint'] != prior['keyFingerprint'] or following['route'] != prior['route']:
        raise ValueError('Comparison changed volume, key or route')
    for field in ('model', 'max_tokens', 'response_format', 'temperature'):
        if following['parameters'][field] != prior['parameters'][field]:
            raise ValueError('Comparison changed unrelated model parameter')
    for directory, binding in ((old_input, old_manifest), (new_input, manifest)):
        for name, field in [('source-manifest.json', 'sourceManifestSha256'), ('source-verification.json', 'sourceVerificationSha256')]:
            if file_hash(directory/name) != binding[field]:
                raise ValueError('Comparison source receipt differs')
    new_jobs = {j['job_id']: j for j in jobs(new_input, manifest)}
    adapter = recipe_adapter(old_input/'recipe'); evidence = []; known = Decimal(0); unknown = Decimal(0); old_jobs = {}
    for job in jobs(old_input, old_manifest):
        old_jobs[job['job_id']] = digest(job)
        attempt, result = saved(job, output_root/prior_run, prior, adapter)
        if attempt is None or result is None or result['status'] == 'interrupted':
            raise ValueError('Prior trial has unfinished requests')
        if result['costUsd'] is None:
            unknown += Decimal(str(attempt['reservedUsd']))
        else:
            if result['costUsd'] > attempt['reservedUsd']:
                raise ValueError('Prior charge exceeds reservation')
            known += Decimal(str(result['costUsd']))
        evidence.append(dict(jobId=job['job_id'], status=result['status'], costUsd=result['costUsd'], attemptSha256=file_hash(output_root/prior_run/'attempts'/(job['job_id']+'.json')), resultSha256=file_hash(output_root/prior_run/'results'/(job['job_id']+'.json'))))
    for kind in ('attempts', 'results'):
        if {p.stem for p in (output_root/prior_run/kind).glob('*.json')} != set(old_jobs):
            raise ValueError('Prior trial has extra or missing records')
    if any(old_jobs.get(jid) != digest(job) for jid, job in new_jobs.items()):
        raise ValueError('Comparison is not the same captured source jobs')
    carried = dict(runId=prior_run, configHash=prior_hash, reportedCostUsd=float(known), unknownReservedUsd=float(unknown))
    carry = float(Decimal(str(verified_carry(prior, output_root))) + unknown)
    if following['priorRun'] != carried or following.get('carriedUnknownReservedUsd') != carry:
        raise ValueError('Comparison must preserve exact prior charges and unknown holds')
    if trial['arm'] == 'none':
        if (prior.get('qualityTrial') != 'source-readings-210-v1' or old_manifest['jobs'] != 210 or
                trial['priorExperimentCostUsd'] != 0 or trial['baselineRun'] != prior_run or trial['baselineConfigHash'] != prior_hash or
                trial['baselineKnownCostUsd'] != float(known) or trial['baselineUnknownReservedUsd'] != carry):
            raise ValueError('First arm must follow the settled 210-job trial')
    else:
        old_trial = prior.get('comparisonTrial', {})
        if old_trial.get('version') != VERSION or old_trial.get('arm') != 'none' or set(old_jobs) != set(new_jobs) or prior['recipeFiles'] != following['recipeFiles']:
            raise ValueError('Second arm must follow the matched first arm')
        expected = dict(old_trial, arm='low', priorExperimentCostUsd=float(known))
        if trial != expected:
            raise ValueError('Second arm dropped the shared experiment budget')
    new_adapter = recipe_adapter(new_input/'recipe')
    maximum = sum(Decimal(str(reservation(payload_for(job, new_adapter, following), following))) for job in new_jobs.values())
    if maximum + Decimal(str(carry)) > Decimal(str(following['budgetUsd'])):
        raise ValueError('Worst-case comparison spending exceeds remaining budget')
    receipt = dict(previousScope=old_scope, nextScope=new_scope, priorCost=carried, carriedUnknownReservedUsd=carry, comparisonTrial=trial, evidence=evidence, acceptedFacts=0, reason='Explicit bounded matched source-reading comparison; previous charges retained')
    receipt['transitionHash'] = digest(receipt)
    archive = output_root/'budget-history'/(prior_hash+'-'+next_hash+'.json')
    if archive.exists():
        if load(archive) != receipt:
            raise ValueError('Comparison archive differs')
    else:
        if scope == new_scope:
            raise ValueError('Comparison archive missing')
        atomic(archive, receipt); commit()
    if load(scope_path) == new_scope:
        return receipt
    if load(scope_path) != old_scope:
        raise ValueError('Comparison scope changed')
    atomic(scope_path, new_scope); commit()
    return receipt
