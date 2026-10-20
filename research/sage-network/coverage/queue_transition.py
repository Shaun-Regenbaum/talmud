"""Explicitly reconcile one finished three-job probe before another approved probe."""
from decimal import Decimal
from queue_core import atomic, config_check, digest, file_hash, jobs, load, recipe_adapter, recipe_files, saved, verified_carry


def transition(inputs_root, output_root, prior_run, next_run, prior_hash, next_hash, commit):
    """Caller must hold the same queue lock; never call this as part of run/resume."""
    from queue_core import safe_id
    safe_id(prior_run)
    safe_id(next_run)
    if prior_run == next_run:
        raise ValueError('Transition needs a distinct reviewed probe run')
    prior_input = inputs_root / prior_run
    next_input = inputs_root / next_run
    prior = load(prior_input/'config.json')
    following = load(next_input/'config.json')
    if (digest(prior) != prior_hash or digest(following) != next_hash or
            prior['runId'] != prior_run or following['runId'] != next_run):
        raise ValueError('Reviewed transition config hash differs')
    old_scope = dict(runId=prior_run, configHash=prior_hash)
    new_scope = dict(runId=next_run, configHash=next_hash)
    scope_path = output_root/'budget-scope.json'
    scope = load(scope_path)
    if scope not in (old_scope, new_scope):
        raise ValueError('Budget scope changed before transition')
    if load(output_root/prior_run/'config.json') != prior:
        raise ValueError('Prior persisted run config differs')
    if (prior.get('executionMode') != 'probe' or following.get('executionMode') != 'probe' or
            following.get('budgetUsd', 1) > .1 or following.get('approvedConcurrency', 16) > 3):
        raise ValueError('Transition is only for another bounded probe')
    for field in ('inputManifestHash', 'keyFingerprint'):
        if prior[field] != following[field]:
            raise ValueError('Probe transition changes frozen ' + field)
    prior_manifest = load(prior_input/'queue-manifest.json')
    next_manifest = load(next_input/'queue-manifest.json')
    if digest(prior_manifest) != prior['inputManifestHash'] or prior_manifest != next_manifest:
        raise ValueError('Probe manifest differs')
    if prior_manifest['jobs'] != 3:
        raise ValueError('Transition requires exactly three completed probe requests')
    if recipe_files(prior_input/'recipe') != prior['recipeFiles']:
        raise ValueError('Prior recipe files differ')
    config_check(following, next_manifest, next_input/'recipe', following['approvedConcurrency'])
    for directory in (prior_input, next_input):
        for name, field in [('source-manifest.json','sourceManifestSha256'),
                            ('source-verification.json','sourceVerificationSha256')]:
            if file_hash(directory/name) != prior_manifest[field]:
                raise ValueError('Probe source receipt differs')
    next_adapter = recipe_adapter(next_input/'recipe')
    next_jobs = {}
    for job in jobs(next_input, next_manifest):
        next_adapter.messages(job)
        next_jobs[job['job_id']] = digest(job)
    adapter = recipe_adapter(prior_input/'recipe')
    evidence = []
    cost = Decimal(0)
    unknown = Decimal(0)
    prior_directory = output_root/prior_run
    for job in jobs(prior_input, prior_manifest):
        if next_jobs.get(job['job_id']) != digest(job):
            raise ValueError('Probe source job differs')
        attempt, result = saved(job, prior_directory, prior, adapter)
        if attempt is None or result is None or result['status'] == 'interrupted':
            raise ValueError('Probe has an unfinished request')
        if result.get('costUsd') is None:
            unknown += Decimal(str(attempt['reservedUsd']))
        else:
            if result['costUsd'] > attempt['reservedUsd']:
                raise ValueError('Probe charge exceeds reservation')
            cost += Decimal(str(result['costUsd']))
        evidence.append(dict(jobId=job['job_id'], status=result['status'], costUsd=result['costUsd'],
            attemptSha256=file_hash(prior_directory/'attempts'/(job['job_id']+'.json')),
            resultSha256=file_hash(prior_directory/'results'/(job['job_id']+'.json'))))
    for kind in ('attempts','results'):
        if {p.stem for p in (prior_directory/kind).glob('*.json')} != set(next_jobs):
            raise ValueError('Probe has extra or missing saved records')
    carried = dict(runId=prior_run, configHash=prior_hash, reportedCostUsd=float(cost), unknownReservedUsd=float(unknown))
    if following.get('priorRun') != carried:
        raise ValueError('New probe must carry the exact prior cost receipt')
    carried_unknown = float(Decimal(str(verified_carry(prior, output_root))) + unknown)
    if following.get('carriedUnknownReservedUsd', 0) != carried_unknown:
        raise ValueError('New probe must preserve all prior unknown reservations')
    if carried_unknown >= following['budgetUsd']:
        raise ValueError('Carried unknown reservations exhaust the new budget')
    receipt = dict(carriedUnknownReservedUsd=carried_unknown, previousScope=old_scope, nextScope=new_scope, priorCost=carried,
                   evidence=evidence, acceptedFacts=0,
                   reason='Explicit reviewed comparison of the same three source jobs with separately frozen recipes and model parameters')
    receipt['transitionHash'] = digest(receipt)
    archive = output_root/'budget-history'/(prior_hash + '-' + next_hash + '.json')
    if archive.exists():
        if load(archive) != receipt:
            raise ValueError('Existing transition receipt differs')
    else:
        if scope == new_scope:
            raise ValueError('New scope is missing its transition receipt')
        atomic(archive, receipt)
        commit()
    if load(scope_path) == new_scope:
        return receipt
    if load(scope_path) != old_scope:
        raise ValueError('Budget scope changed during transition')
    atomic(scope_path, new_scope)
    commit()
    return receipt
