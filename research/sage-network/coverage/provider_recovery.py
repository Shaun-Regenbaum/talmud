"""Explicit one-item route probe, then one bounded remainder of a stopped comparison."""
from decimal import Decimal
from pathlib import Path
import re
from queue_core import atomic, config_check, digest, file_hash, jobs, load, payload_for, recipe_adapter, recipe_files, reservation, safe_id, saved, verified_carry

VERSION = 'matched-provider-recovery-v2'
LEGACY_VERSION = 'matched-provider-recovery-v1'
MAX_PROBES = 8


def bounds(config, manifest):
    recovery = config.get('providerRecovery', {})
    required = {'version', 'stage', 'originRun', 'originConfigHash', 'eligibleJobsHash', 'probeNumber'}
    if (set(recovery) != required or recovery['version'] != VERSION or recovery['stage'] not in ('probe', 'remainder') or
            type(recovery.get('probeNumber')) is not int or not 1 <= recovery['probeNumber'] <= MAX_PROBES or
            not re.fullmatch('[0-9a-f]{64}', recovery.get('originConfigHash', '')) or
            not re.fullmatch('[0-9a-f]{64}', recovery.get('eligibleJobsHash', '')) or
            config.get('comparisonTrial', {}).get('arm') != 'low' or
            config.get('providerRecoveryHash') != file_hash(Path(__file__)) or config.get('approvedConcurrency') != 1 or
            (recovery['stage'] == 'probe' and manifest['jobs'] != 1) or
            (recovery['stage'] == 'remainder' and not 1 <= manifest['jobs'] <= 29)):
        raise ValueError('Invalid bounded provider recovery')
    safe_id(recovery['originRun'])
    return recovery


def read_state(inputs, output, config):
    """Verify every existing byte and retain absent versus interrupted requests."""
    manifest = load(inputs/'queue-manifest.json')
    if digest(manifest) != config['inputManifestHash'] or recipe_files(inputs/'recipe') != config['recipeFiles']:
        raise ValueError('Recovery source or recipe differs')
    for name, field in [('source-manifest.json', 'sourceManifestSha256'), ('source-verification.json', 'sourceVerificationSha256')]:
        if file_hash(inputs/name) != manifest[field]:
            raise ValueError('Recovery source receipt differs')
    adapter = recipe_adapter(inputs/'recipe'); entries = {}; evidence = []; known = Decimal(0); unknown = Decimal(0)
    for job in jobs(inputs, manifest):
        jid = job['job_id']; attempt, result = saved(job, output/config['runId'], config, adapter)
        if result is not None and result['status'] == 'interrupted':
            raise ValueError('Recovery cannot reconcile interrupted requests')
        entries[jid] = (job, attempt, result)
        if attempt is None:
            evidence.append(dict(jobId=jid, status='never_started', jobHash=digest(job)))
            continue
        if result['costUsd'] is None:
            unknown += Decimal(str(attempt['reservedUsd']))
        else:
            if result['costUsd'] > attempt['reservedUsd']:
                raise ValueError('Recovery charge exceeds reservation')
            known += Decimal(str(result['costUsd']))
        evidence.append(dict(jobId=jid, status=result['status'], costUsd=result['costUsd'],
                             attemptSha256=file_hash(output/config['runId']/'attempts'/(jid+'.json')),
                             resultSha256=file_hash(output/config['runId']/'results'/(jid+'.json'))))
    expected = {jid for jid, (_, attempt, _) in entries.items() if attempt is not None}
    for kind in ('attempts', 'results'):
        if {p.stem for p in (output/config['runId']/kind).glob('*.json')} != expected:
            raise ValueError('Recovery has extra or missing saved records')
    return entries, evidence, known, unknown



def verify_chain(inputs_root, output_root, latest, recovery):
    """Reconcile all prior probe receipts back to the unchanged original thirty jobs."""
    current = latest; seen = set(); number = recovery.get('probeNumber', 1)
    if type(number) is not int or not 1 <= number <= MAX_PROBES:
        raise ValueError('Invalid saved recovery probe number')
    for expected_number in range(number, 0, -1):
        h = digest(current)
        if h in seen:
            raise ValueError('Recovery chain repeats a scope')
        seen.add(h)
        step = current.get('providerRecovery', {})
        if (step.get('version') not in (LEGACY_VERSION, VERSION) or step.get('stage') != 'probe' or
                step.get('probeNumber', 1) != expected_number or
                any(step.get(k) != recovery[k] for k in ('originRun', 'originConfigHash', 'eligibleJobsHash'))):
            raise ValueError('Recovery chain changed origin or probe order')
        link = current['priorRun']; parent = load(inputs_root/link['runId']/'config.json')
        if digest(parent) != link['configHash'] or load(output_root/parent['runId']/'config.json') != parent:
            raise ValueError('Recovery chain prior config differs')
        _, evidence, known, unknown = read_state(inputs_root/parent['runId'], output_root, parent)
        archive = load(output_root/'budget-history'/(digest(parent)+'-'+h+'.json'))
        verified_carry(current, output_root)
        if archive.get('evidence') != evidence:
            raise ValueError('Recovery origin evidence changed after the probe')
        actual_link = dict(runId=parent['runId'], configHash=digest(parent), reportedCostUsd=float(known), unknownReservedUsd=float(unknown))
        if (link != actual_link or current['carriedUnknownReservedUsd'] != float(Decimal(str(verified_carry(parent, output_root))) + unknown) or
                current['comparisonTrial'] != dict(parent['comparisonTrial'], priorExperimentCostUsd=float(Decimal(str(parent['comparisonTrial']['priorExperimentCostUsd'])) + known)) or
                current['recipeFiles'] != parent['recipeFiles'] or current['parameters'] != parent['parameters'] or
                current['keyFingerprint'] != parent['keyFingerprint']):
            raise ValueError('Recovery chain dropped costs, holds or frozen identity')
        current = parent
    if current['runId'] != recovery['originRun'] or digest(current) != recovery['originConfigHash'] or current.get('providerRecovery') is not None:
        raise ValueError('Recovery chain does not end at the original stopped trial')
    original, _, _, _ = read_state(inputs_root/current['runId'], output_root, current)
    if len(original) != 30:
        raise ValueError('Recovery origin must contain thirty jobs')
    return current, {jid: entry[0] for jid, entry in original.items()}

def transition(inputs_root, output_root, prior_run, next_run, prior_hash, next_hash, commit):
    """Caller holds the shared queue lock. This does not contact a provider."""
    safe_id(prior_run); safe_id(next_run)
    prior_input, next_input = inputs_root/prior_run, inputs_root/next_run
    prior, following = load(prior_input/'config.json'), load(next_input/'config.json')
    if (prior_run == next_run or digest(prior) != prior_hash or digest(following) != next_hash or
            prior['runId'] != prior_run or following['runId'] != next_run):
        raise ValueError('Reviewed recovery config differs')
    old_scope, new_scope = dict(runId=prior_run, configHash=prior_hash), dict(runId=next_run, configHash=next_hash)
    scope_path = output_root/'budget-scope.json'; scope = load(scope_path)
    if scope not in (old_scope, new_scope) or load(output_root/prior_run/'config.json') != prior:
        raise ValueError('Recovery scope differs')
    manifest = load(next_input/'queue-manifest.json')
    config_check(following, manifest, next_input/'recipe', 1)
    recovery = bounds(following, manifest)
    if (prior.get('executionMode') != 'full' or following['keyFingerprint'] != prior['keyFingerprint'] or
            following['parameters'] != prior['parameters'] or following['recipeFiles'] != prior['recipeFiles']):
        raise ValueError('Recovery changed key, model parameters or recipe')
    entries, evidence, known, unknown = read_state(prior_input, output_root, prior)
    previous = prior.get('providerRecovery')
    if previous is None:
        if (recovery['stage'] != 'probe' or recovery['probeNumber'] != 1 or
                prior.get('comparisonTrial', {}).get('arm') != 'low' or len(entries) != 30 or
                recovery['originRun'] != prior_run or recovery['originConfigHash'] != prior_hash or
                load(output_root/prior_run/'progress.json').get('stopReason') != 'provider_failure_burst'):
            raise ValueError('Probe must follow the stopped thirty-job low arm')
        eligible = {}
        for jid, (job, attempt, result) in entries.items():
            if attempt is None:
                eligible[jid] = job
            elif (result['status'] == 'failed' and result.get('errorKind') == 'provider' and
                    result.get('providerDiagnostic', {}).get('httpStatus') == 429):
                eligible[jid] = job
            else:
                raise ValueError('Probe reconciliation only covers saved HTTP 429 failures or never-started jobs')
        if not any(item[1] is not None for item in entries.values()):
            raise ValueError('Probe requires saved provider failures')
    else:
        if (previous.get('stage') != 'probe' or previous.get('version') not in (LEGACY_VERSION, VERSION) or
                any(recovery[k] != previous[k] for k in ('originRun', 'originConfigHash', 'eligibleJobsHash')) or
                len(entries) != 1):
            raise ValueError('Recovery successor must follow an exact single provider probe')
        origin, eligible = verify_chain(inputs_root, output_root, prior, previous)
        probe = next(iter(entries.values()))
        if probe[2] is None:
            raise ValueError('Provider probe has not finished')
        previous_number = previous.get('probeNumber', 1)
        if recovery['stage'] == 'probe':
            if (recovery['probeNumber'] != previous_number + 1 or probe[2]['status'] != 'failed' or
                    probe[2].get('errorKind') != 'provider'):
                raise ValueError('Another probe requires a terminal provider failure and increasing probe number')
        else:
            if (recovery['probeNumber'] != previous_number or following['route'] != prior['route'] or
                    following.get('requestTimeoutSeconds', 360) != prior.get('requestTimeoutSeconds', 360) or
                    probe[2]['status'] not in ('complete', 'needs_context') or probe[2]['costUsd'] is None):
                raise ValueError('Provider probe has not succeeded with a known charge on the unchanged route')
    if recovery['stage'] == 'probe' and following['route']['provider'] == prior['route']['provider']:
        raise ValueError('Recovery probe requires a different explicitly approved provider')
    eligible_hash = digest({jid: digest(job) for jid, job in sorted(eligible.items())})
    if recovery['eligibleJobsHash'] != eligible_hash:
        raise ValueError('Recovery eligible source set differs')
    new_jobs = {job['job_id']: job for job in jobs(next_input, manifest)}
    if any(jid not in eligible or digest(job) != digest(eligible[jid]) for jid, job in new_jobs.items()):
        raise ValueError('Recovery changed captured source jobs')
    if recovery['stage'] == 'remainder' and set(new_jobs) != set(eligible) - set(entries):
        raise ValueError('Remainder must exclude the successful probe and include only the original remaining jobs')
    for name, field in [('source-manifest.json', 'sourceManifestSha256'), ('source-verification.json', 'sourceVerificationSha256')]:
        if file_hash(next_input/name) != manifest[field]:
            raise ValueError('Recovery next source receipt differs')
    carried = dict(runId=prior_run, configHash=prior_hash, reportedCostUsd=float(known), unknownReservedUsd=float(unknown))
    carry = float(Decimal(str(verified_carry(prior, output_root))) + unknown)
    if following['priorRun'] != carried or following['carriedUnknownReservedUsd'] != carry:
        raise ValueError('Recovery dropped prior charges or unknown holds')
    expected_trial = dict(prior['comparisonTrial'], priorExperimentCostUsd=float(Decimal(str(prior['comparisonTrial']['priorExperimentCostUsd'])) + known))
    if following['comparisonTrial'] != expected_trial:
        raise ValueError('Recovery reset the shared experiment budget')
    adapter = recipe_adapter(next_input/'recipe')
    maximum = sum(Decimal(str(reservation(payload_for(job, adapter, following), following))) for job in new_jobs.values())
    if maximum + Decimal(str(carry)) > Decimal(str(following['budgetUsd'])):
        raise ValueError('Recovery exceeds remaining experiment allowance')
    receipt = dict(previousScope=old_scope, nextScope=new_scope, priorCost=carried,
                   carriedUnknownReservedUsd=carry, comparisonTrial=following['comparisonTrial'], providerRecovery=recovery,
                   evidence=evidence, acceptedFacts=0, reason='Explicit provider recovery; all old charges and unknown holds retained; route-confounded comparison')
    receipt['transitionHash'] = digest(receipt)
    archive = output_root/'budget-history'/(prior_hash+'-'+next_hash+'.json')
    if archive.exists():
        if load(archive) != receipt:
            raise ValueError('Recovery archive differs')
    else:
        if scope == new_scope:
            raise ValueError('Recovery archive missing')
        atomic(archive, receipt); commit()
    if load(scope_path) == new_scope:
        return receipt
    if load(scope_path) != old_scope:
        raise ValueError('Recovery scope changed')
    atomic(scope_path, new_scope); commit()
    return receipt
