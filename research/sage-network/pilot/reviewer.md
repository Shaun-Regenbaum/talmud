# Check a saved first reading

Read the source text and the extraction yourself. Structural validation has already checked exact quotes and references. It cannot check who spoke or what the source means.

For challenge jobs, use manifest.json only to map job_id to the case in review_checks.json. That checklist is provisional and can be wrong. Score each must_preserve and must_avoid item in order, using kind preserve/avoid and a zero-based index. status is pass, miss, uncertain or not_applicable. An avoid check passes when the prohibited error is absent. not_applicable is appropriate when the check explicitly concerns commentary that was not supplied. Do not penalize a source-only extraction for lacking outside research. Do penalize unwarranted certainty or omitted relations that are present in the supplied text. Check meaningful roles, not matching English labels.

For random jobs there is no prior checklist. Read all supplied text. Check participants, relationships, speech targets, variants, pronouns, time and genre. Record at least two checks of actual content per job, kind source, indices starting at zero. Do not estimate population accuracy from this tiny set.

For every job, also inspect claims beyond the checklist for unsupported readings and important missing details. Identify those in additional_findings: severity major/minor, type unsupported/omission/uncertainty/contract_limit, claim_ids, reason, source_refs. An honest open question may be the right outcome. A wrong assertion hidden in a note is still an error. A relationship preserved only in prose may be a contract limit worth recording. Keep questions, imagined events and narrative assertions distinct from historical fact.

Write one JSON object with reviewer_role, limits, cases. Each case: job_id, input_sha256, output_sha256, checks (kind,index,status,reason,claim_ids), additional_findings, summary. Hash exact file bytes. Do not edit extraction outputs. Do not fabricate missing evidence. This review is provisional, not human gold. No model/vendor/assistant names in files.
