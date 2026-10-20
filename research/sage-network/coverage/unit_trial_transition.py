"""Three unchanged source controls with a separately frozen source-unit recipe."""
from decimal import Decimal
from pathlib import Path
import re
from queue_core import atomic, config_check, digest, file_hash, jobs, load, payload_for, recipe_adapter, recipe_files, reservation, safe_id, verified_carry
from provider_recovery import read_state, verify_chain

VERSION = 'numbered-source-three-v1'
CONTROLS = frozenset({'v18-bavli-005', 'v18-bavli-011', 'v18-bavli-061'})


def bounds(config, manifest):
    trial = config.get('sourceUnitTrial', {})
    required = {'version', 'experimentId', 'originRun', 'originConfigHash', 'sourceJobsHash', 'previousRecipeHash', 'newRecipeHash'}
    if (set(trial) != required or trial['version'] != VERSION or manifest['jobs'] != 3 or
            config.get('approvedConcurrency') != 1 or config.get('executionMode') != 'full' or
            config.get('providerRecovery') is not None or config.get('qualityTrial') is not None or
            config.get('comparisonTrial', {}).get('arm') != 'low' or
            config.get('unitTrialTransitionHash') != file_hash(Path(__file__)) or
            config.get('providerRecoveryHash') != file_hash(Path(__file__).with_name('provider_recovery.py'))):
        raise ValueError('Invalid three-source unit trial')
    safe_id(trial['experimentId']); safe_id(trial['originRun'])
    for name in ('originConfigHash', 'sourceJobsHash', 'previousRecipeHash', 'newRecipeHash'):
        if not re.fullmatch('[0-9a-f]{64}', trial[name]):
            raise ValueError('Invalid source-unit trial binding')
    if trial['newRecipeHash'] != digest(config['recipeFiles']) or trial['previousRecipeHash'] == trial['newRecipeHash']:
        raise ValueError('Source-unit trial requires an explicitly changed recipe')
    return trial



def validate_controls(config, source_jobs):
    """Also run during config validation, before direct dispatch can reach the API."""
    rows = list(source_jobs)
    if len(rows) != 3 or {job['job_id'] for job in rows} != CONTROLS:
        raise ValueError('Source-unit trial requires exactly controls 005, 011 and 061')
    if config['sourceUnitTrial']['sourceJobsHash'] != digest({j['job_id']: digest(j) for j in rows}):
        raise ValueError('Source-unit control digest differs')


def transition(inputs_root, output_root, prior_run, next_run, prior_hash, next_hash, commit):
    """Caller holds the shared lock; no request, retry or publication occurs here."""
    safe_id(prior_run); safe_id(next_run)
    old_input, new_input = inputs_root/prior_run, inputs_root/next_run
    prior, following = load(old_input/'config.json'), load(new_input/'config.json')
    if (prior_run == next_run or digest(prior) != prior_hash or digest(following) != next_hash or
            prior['runId'] != prior_run or following['runId'] != next_run):
        raise ValueError('Reviewed source-unit config differs')
    old_scope, new_scope = dict(runId=prior_run, configHash=prior_hash), dict(runId=next_run, configHash=next_hash)
    scope_path = output_root/'budget-scope.json'; scope = load(scope_path)
    if scope not in (old_scope, new_scope) or load(output_root/prior_run/'config.json') != prior:
        raise ValueError('Source-unit scope differs')
    manifest = load(new_input/'queue-manifest.json')
    config_check(following, manifest, new_input/'recipe', 1)
    trial = bounds(following, manifest)
    recovery = prior.get('providerRecovery', {})
    if (recovery.get('stage') != 'probe' or prior.get('sourceUnitTrial') is not None or
            prior.get('executionMode') != 'full' or following['keyFingerprint'] != prior['keyFingerprint'] or
            following['parameters'] != prior['parameters'] or following['route'] != prior['route'] or
            following.get('requestTimeoutSeconds', 360) != prior.get('requestTimeoutSeconds', 360)):
        raise ValueError('Source-unit trial may change only the recipe, not provider or model settings')
    origin, original_jobs = verify_chain(inputs_root, output_root, prior, recovery)
    if (trial['originRun'] != origin['runId'] or trial['originConfigHash'] != digest(origin) or
            trial['previousRecipeHash'] != digest(prior['recipeFiles'])):
        raise ValueError('Source-unit trial changed its prior source or recipe binding')
    entries, evidence, known, unknown = read_state(old_input, output_root, prior)
    if len(entries) != 1:
        raise ValueError('Source-unit trial must follow the single reviewed probe')
    result = next(iter(entries.values()))[2]
    choices = result.get('response', {}).get('choices') if result else None
    if (result is None or result['costUsd'] is None or result.get('errorKind') not in (None, 'validation') or
            not isinstance(choices, list) or len(choices) != 1 or not isinstance(choices[0], dict) or
            choices[0].get('finish_reason') != 'stop'):
        raise ValueError('Source-unit trial needs a finished probe answer with a known charge')
    for name, field in [('source-manifest.json', 'sourceManifestSha256'), ('source-verification.json', 'sourceVerificationSha256')]:
        if file_hash(new_input/name) != manifest[field]:
            raise ValueError('Source-unit source receipt differs')
    new_jobs = {job['job_id']: job for job in jobs(new_input, manifest)}
    if set(new_jobs) != CONTROLS or any(digest(original_jobs[jid]) != digest(job) for jid, job in new_jobs.items()):
        raise ValueError('Source-unit trial must use the exact original controls 005, 011 and 061')
    if trial['sourceJobsHash'] != digest({jid: digest(job) for jid, job in sorted(new_jobs.items())}):
        raise ValueError('Source-unit control digest differs')
    carried = dict(runId=prior_run, configHash=prior_hash, reportedCostUsd=float(known), unknownReservedUsd=float(unknown))
    carry = float(Decimal(str(verified_carry(prior, output_root))) + unknown)
    if following['priorRun'] != carried or following['carriedUnknownReservedUsd'] != carry:
        raise ValueError('Source-unit trial dropped prior charges or holds')
    expected_budget = dict(prior['comparisonTrial'], priorExperimentCostUsd=float(Decimal(str(prior['comparisonTrial']['priorExperimentCostUsd'])) + known))
    if following['comparisonTrial'] != expected_budget:
        raise ValueError('Source-unit trial reset the shared experiment allowance')
    adapter = recipe_adapter(new_input/'recipe')
    maximum = sum(Decimal(str(reservation(payload_for(job, adapter, following), following))) for job in new_jobs.values())
    if maximum + Decimal(str(carry)) > Decimal(str(following['budgetUsd'])):
        raise ValueError('Source-unit trial exceeds the remaining shared allowance')
    receipt = dict(previousScope=old_scope, nextScope=new_scope, priorCost=carried,
                   carriedUnknownReservedUsd=carry, comparisonTrial=following['comparisonTrial'], sourceUnitTrial=trial,
                   evidence=evidence, acceptedFacts=0,
                   reason='Explicit three-source recipe comparison; provider and model parameters unchanged; all previous charges and holds retained')
    receipt['transitionHash'] = digest(receipt)
    archive = output_root/'budget-history'/(prior_hash+'-'+next_hash+'.json')
    if archive.exists():
        if load(archive) != receipt:
            raise ValueError('Source-unit archive differs')
    else:
        if scope == new_scope:
            raise ValueError('Source-unit archive missing')
        atomic(archive, receipt); commit()
    if load(scope_path) == new_scope:
        return receipt
    if load(scope_path) != old_scope:
        raise ValueError('Source-unit scope changed')
    atomic(scope_path, new_scope); commit()
    return receipt
