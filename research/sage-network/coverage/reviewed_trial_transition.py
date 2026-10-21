"""Explicitly pinned small trials share one append-only spending history; no dispatch."""
from decimal import Decimal
from pathlib import Path
from queue_core import atomic, config_check, digest, file_hash, jobs, load, payload_for, recipe_adapter, reservation, safe_id, verified_carry
from provider_recovery import read_state

VERSION = 'reviewed-small-trial-v1'
SAMPLE_VERSION = 'reviewed-sample-150-v1'
FIELDS = ('keyFingerprint', 'recipeFiles', 'parameters', 'route', 'requestTimeoutSeconds', 'approvedConcurrency')


def bounds(config, manifest):
    marker = config.get('reviewedTrial', {})
    sample = config.get('sampleBudget')
    if (set(marker) != {'version', 'planHash'} or marker['version'] != (SAMPLE_VERSION if sample is not None else VERSION) or
            config.get('reviewedTrialTransitionHash') != file_hash(Path(__file__)) or
            config.get('providerRecoveryHash') != file_hash(Path(__file__).with_name('provider_recovery.py')) or
            config.get('providerRecovery') is not None or config.get('sourceUnitTrial') is not None or
            config.get('executionMode') != 'full' or not 1 <= manifest['jobs'] <= (150 if sample is not None else 30) or
            type(config.get('approvedConcurrency')) is not int or not 1 <= config['approvedConcurrency'] <= 16):
        raise ValueError('Invalid reviewed small trial')
    if sample is not None:
        required = {'version', 'incrementalCapUsd', 'priorScope', 'closedExperiment', 'selectionHash'}
        if (not isinstance(sample, dict) or set(sample) != required or sample['version'] != SAMPLE_VERSION or
                sample['incrementalCapUsd'] != 6.47 or manifest['jobs'] != 150 or
                config['approvedConcurrency'] > 4 or config.get('comparisonTrial') is not None or
                config['budgetUsd'] != float(Decimal('6.47') + Decimal(str(config.get('carriedUnknownReservedUsd', 0))))):
            raise ValueError('Invalid separate sample allowance')


def check_plan(config, manifest, inputs, expected_hash=None):
    bounds(config, manifest)
    plan = load(inputs/'reviewed-plan.json')
    required = {'version', 'priorScope', 'nextRun', 'experiment', 'frozen', 'jobs', 'requestHashes', 'reason'}
    if (set(plan) != required or plan['version'] != config['reviewedTrial']['version'] or not isinstance(plan['reason'], str) or not plan['reason'].strip() or
            digest(plan) != config['reviewedTrial']['planHash'] or (expected_hash is not None and digest(plan) != expected_hash) or
            plan['nextRun'] != config['runId'] or set(plan['frozen']) != set(FIELDS) or
            any(plan['frozen'][f] != config.get(f) for f in FIELDS)):
        raise ValueError('Reviewed plan differs from frozen configuration')
    safe_id(plan['nextRun'])
    trial = config.get('sampleBudget', config.get('comparisonTrial'))
    expected_experiment = trial if config.get('sampleBudget') is not None else {k:v for k,v in trial.items() if k != 'priorExperimentCostUsd'}
    if plan['experiment'] != expected_experiment:
        raise ValueError('Reviewed plan changed the shared experiment')
    source_jobs = list(jobs(inputs, manifest))
    if plan['jobs'] != {j['job_id']:digest(j) for j in source_jobs}:
        raise ValueError('Reviewed source jobs differ')
    if config.get('sampleBudget') is not None:
        selection = load(inputs/'sample-selection.json')
        rows = selection.get('selection', [])
        if (digest(selection) != trial['selectionHash'] or len(rows) != 150 or
                sum(r.get('sampleRole') == 'representative' for r in rows) != 120 or
                sum(r.get('sampleRole') == 'stress' for r in rows) != 30 or
                {r['jobId']:r['jobHash'] for r in rows} != plan['jobs']):
            raise ValueError('Reviewed sample selection differs')
    adapter = recipe_adapter(inputs/'recipe')
    payloads = {j['job_id']:payload_for(j, adapter, config) for j in source_jobs}
    if plan['requestHashes'] != {jid:digest(p) for jid,p in payloads.items()}:
        raise ValueError('Reviewed request payload differs')
    return plan, payloads


def verify_history(inputs_root, output_root, latest):
    """Recompute each prior charge/hold back to the experiment's fixed baseline."""
    current = latest; seen = set(); fixed = latest['comparisonTrial']
    while True:
        h = digest(current)
        if h in seen or len(seen) >= 64:
            raise ValueError('Trial history repeats or exceeds its bounded depth')
        seen.add(h)
        verified_carry(current, output_root)
        link = current['priorRun']; safe_id(link['runId'])
        parent = load(inputs_root/link['runId']/'config.json')
        if (digest(parent) != link['configHash'] or parent['runId'] != link['runId'] or
                load(output_root/parent['runId']/'config.json') != parent or parent['keyFingerprint'] != latest['keyFingerprint']):
            raise ValueError('Trial history config or key differs')
        _, evidence, known, unknown = read_state(inputs_root/parent['runId'], output_root, parent)
        archive = load(output_root/'budget-history'/(digest(parent)+'-'+h+'.json'))
        actual = dict(runId=parent['runId'],configHash=digest(parent),reportedCostUsd=float(known),unknownReservedUsd=float(unknown))
        carry = float(Decimal(str(verified_carry(parent, output_root))) + unknown)
        if (archive.get('previousScope') != dict(runId=parent['runId'],configHash=digest(parent)) or
                archive.get('evidence') != evidence or link != actual or current['carriedUnknownReservedUsd'] != carry):
            raise ValueError('Trial history dropped evidence, charges or holds')
        if parent['runId'] == fixed['baselineRun']:
            if (digest(parent) != fixed['baselineConfigHash'] or float(known) != fixed['baselineKnownCostUsd'] or
                    carry != fixed['baselineUnknownReservedUsd'] or current['comparisonTrial']['priorExperimentCostUsd'] != 0):
                raise ValueError('Trial baseline differs')
            return
        old_trial, trial = parent['comparisonTrial'], current['comparisonTrial']
        for field in ('version', 'experimentId', 'incrementalCapUsd', 'baselineRun', 'baselineConfigHash', 'baselineKnownCostUsd', 'baselineUnknownReservedUsd'):
            if old_trial[field] != fixed[field] or trial[field] != fixed[field]:
                raise ValueError('Trial history reset the experiment')
        if trial['priorExperimentCostUsd'] != float(Decimal(str(old_trial['priorExperimentCostUsd'])) + known):
            raise ValueError('Trial history dropped known spending')
        current = parent


def transition(inputs_root, output_root, prior_run, next_run, prior_hash, next_hash, plan_hash, commit):
    """Caller holds the shared lock. Both config hashes and the independent plan hash are required."""
    safe_id(prior_run); safe_id(next_run)
    old_input, new_input = inputs_root/prior_run, inputs_root/next_run
    prior, following = load(old_input/'config.json'), load(new_input/'config.json')
    if (prior_run == next_run or digest(prior) != prior_hash or digest(following) != next_hash or
            prior['runId'] != prior_run or following['runId'] != next_run):
        raise ValueError('Reviewed trial config differs')
    old_scope, new_scope = dict(runId=prior_run,configHash=prior_hash), dict(runId=next_run,configHash=next_hash)
    scope_path = output_root/'budget-scope.json'; scope = load(scope_path)
    if scope not in (old_scope,new_scope) or load(output_root/prior_run/'config.json') != prior:
        raise ValueError('Reviewed trial scope differs')
    manifest = load(new_input/'queue-manifest.json')
    config_check(following,manifest,new_input/'recipe',following['approvedConcurrency'])
    plan,payloads = check_plan(following,manifest,new_input,plan_hash)
    if plan['priorScope'] != old_scope or following['keyFingerprint'] != prior['keyFingerprint']:
        raise ValueError('Reviewed plan changed prior scope or key')
    verify_history(inputs_root,output_root,prior)
    entries,evidence,known,unknown = read_state(old_input,output_root,prior)
    if any(attempt is None or result is None for _,attempt,result in entries.values()):
        raise ValueError('Prior trial has unfinished jobs')
    progress = load(output_root/prior_run/'progress.json')
    if progress.get('inFlight') != 0 or progress.get('notStarted') != 0 or progress.get('manifestHash') != prior_hash:
        raise ValueError('Prior trial has not reached a terminal state')
    for name,field in [('source-manifest.json','sourceManifestSha256'),('source-verification.json','sourceVerificationSha256')]:
        if file_hash(new_input/name) != manifest[field]:
            raise ValueError('Reviewed source receipt differs')
    carried = dict(runId=prior_run,configHash=prior_hash,reportedCostUsd=float(known),unknownReservedUsd=float(unknown))
    carry = float(Decimal(str(verified_carry(prior,output_root))) + unknown)
    expected = dict(prior['comparisonTrial'],priorExperimentCostUsd=float(Decimal(str(prior['comparisonTrial']['priorExperimentCostUsd'])) + known))
    if following['priorRun'] != carried or following['carriedUnknownReservedUsd'] != carry:
        raise ValueError('Reviewed trial dropped costs or reset the shared allowance')
    if following.get('sampleBudget') is not None:
        sample = following['sampleBudget']
        if sample['priorScope'] != old_scope or sample['closedExperiment'] != expected:
            raise ValueError('Sample dropped the closed experiment costs')
        for field in ('parameters', 'route', 'keyFingerprint', 'pricingApplicability', 'requestTimeoutSeconds'):
            if following.get(field) != prior.get(field):
                raise ValueError('Sample changed the reviewed reading settings')
        old_files, new_files = prior['recipeFiles'], following['recipeFiles']
        if ({k:v for k,v in old_files.items() if k != 'queue_adapter.py'} !=
                {k:v for k,v in new_files.items() if k != 'queue_adapter.py'}):
            raise ValueError('Sample changed the reading recipe')
        before = (old_input/'recipe/queue_adapter.py').read_text()
        after = (new_input/'recipe/queue_adapter.py').read_text()
        if after != before.replace('thirty', '150').replace('len(_requests) >= 30', 'len(_requests) >= 150'):
            raise ValueError('Sample adapter changed beyond bounded capacity')
    elif following['comparisonTrial'] != expected:
        raise ValueError('Reviewed trial dropped costs or reset the shared allowance')
    maximum = sum(Decimal(str(reservation(p,following))) for p in payloads.values())
    if maximum + Decimal(str(carry)) > Decimal(str(following['budgetUsd'])):
        raise ValueError('Reviewed trial exceeds remaining allowance')
    receipt = dict(previousScope=old_scope,nextScope=new_scope,priorCost=carried,carriedUnknownReservedUsd=carry,
                   comparisonTrial=expected,reviewedPlanHash=plan_hash,evidence=evidence,acceptedFacts=0,
                   reason=plan['reason'])
    if following.get('sampleBudget') is not None:
        receipt['sampleBudget'] = following['sampleBudget']
    receipt['transitionHash'] = digest(receipt)
    archive = output_root/'budget-history'/(prior_hash+'-'+next_hash+'.json')
    if archive.exists():
        if load(archive) != receipt:
            raise ValueError('Reviewed trial archive differs')
    else:
        if scope == new_scope:
            raise ValueError('Reviewed trial archive missing')
        atomic(archive,receipt);commit()
    if load(scope_path) == new_scope:
        return receipt
    if load(scope_path) != old_scope:
        raise ValueError('Reviewed trial scope changed')
    atomic(scope_path,new_scope);commit()
    return receipt
