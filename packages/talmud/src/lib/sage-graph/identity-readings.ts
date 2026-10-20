import { canonicalSlug } from '../rabbi/identity';
import type { InitialOccurrence, ReadingAnchor } from './initial-readings';
import { type LegacyRow, legacyPersonId, wholeName } from './legacy-readings';
import type { SourcePerson } from './types';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Person = { id: string; label: string; quote: string; quoteLocation: string };
type Evidence = { location: string; quote: string };
type Candidate = { id: string; canonical: string; canonicalHe: string; generation?: string };
type Proposal = {
  case: {
    id: string;
    personKey: string;
    person: Person;
    ref: string;
    source: Record<string, string>;
    candidates: Candidate[];
  };
  inputSha256: string;
  sourceSha256: string;
  status: string;
  accepted: boolean;
  answer: { personId: string | null; reason: string; evidence: Evidence[]; status: string } | null;
  audit?: {
    disagreement: boolean;
    accepted: boolean;
    comparisonSha256: string;
    reviewSha256: string;
    comparison: {
      id: string;
      first: NonNullable<Proposal['answer']>;
      second: NonNullable<Proposal['answer']>;
    };
    review: {
      caseId: string;
      finding: string;
      disposition: string;
      evidence?: Evidence[];
      supportingQuote?: string;
      quoteLocation?: string;
    };
  } | null;
  referenceCorrection?: Correction;
};
type Correction = {
  schema: string;
  passageId: string;
  legacyRef: string;
  canonicalRef: string;
  replacesPayloadSha256: string;
  primaryPassageId: string;
  current?: { sourceUrl: string };
};
type Passage = {
  id: string;
  ref: string;
  source: Record<string, string>;
  people: Person[];
  referenceCorrection?: Correction;
};
export const textHash = async (text: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
const canonical = (value: Json, spaced = false): string => {
  const comma = spaced ? ', ' : ',',
    colon = spaced ? ': ' : ':';
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v, spaced)).join(comma)}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}${colon}${canonical(value[k], spaced)}`)
      .join(comma)}}`;
  return JSON.stringify(value);
};
/** A canonical-reference amendment may change addresses, never the saved reasoning. */
export async function originalProposal(
  row: LegacyRow,
  passage: Passage,
  predecessors: LegacyRow[],
) {
  const current = JSON.parse(row.payload_json) as Proposal;
  if ((await textHash(row.payload_json)) !== row.payload_sha256) return null;
  const block = current.referenceCorrection;
  if (!block) return current;
  const fixed = passage.referenceCorrection;
  if (
    !fixed ||
    block.schema !== 'reference-correction/v1' ||
    fixed.schema !== block.schema ||
    block.passageId !== row.passage_id ||
    fixed.passageId !== row.passage_id ||
    block.legacyRef !== fixed.legacyRef ||
    block.canonicalRef !== fixed.canonicalRef ||
    block.primaryPassageId !== fixed.primaryPassageId ||
    row.ref !== block.canonicalRef ||
    passage.ref !== row.ref
  )
    return null;
  const before = predecessors.find(
    (r) => r.record_id === row.record_id && r.payload_sha256 === block.replacesPayloadSha256,
  );
  if (
    !before ||
    before.kind !== row.kind ||
    before.passage_id !== row.passage_id ||
    before.ref !== block.legacyRef ||
    (await textHash(before.payload_json)) !== before.payload_sha256
  )
    return null;
  const original = JSON.parse(before.payload_json) as Proposal;
  const match = /^(.+) (\d+[ab]):(.+)$/.exec(block.legacyRef);
  if (!match || !fixed.current?.sourceUrl) return null;
  const [, work, unit, address] = match,
    underscored = work.replaceAll(' ', '_');
  const replacements = new Map([
    [block.legacyRef, block.canonicalRef],
    [`https://www.sefaria.org/${encodeURIComponent(`${work} ${unit}`)}`, fixed.current.sourceUrl],
    [
      `https://www.sefaria.org/${underscored}_${unit}.${address.replaceAll(':', '.')}`,
      `https://www.sefaria.org/${underscored}.${address.replaceAll(':', '.')}`,
    ],
  ]);
  const amend = (value: Json): Json =>
    typeof value === 'string'
      ? (replacements.get(value) ?? value)
      : Array.isArray(value)
        ? value.map(amend)
        : value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, amend(v)]))
          : value;
  const { referenceCorrection: _correction, ...actual } = current;
  if (canonical(amend(original as unknown as Json)) !== canonical(actual as unknown as Json))
    return null;
  return original;
}

export async function identityCards(
  revision: string,
  rows: LegacyRow[],
  predecessors: LegacyRow[] = [],
) {
  const cards = new Map<string, SourcePerson>(),
    occurrences = new Map<string, InitialOccurrence>();
  for (const row of rows.filter(
    (r) =>
      r.kind === 'identity_proposal' &&
      r.authority === 'screening' &&
      r.decision === 'needs_review',
  )) {
    const passageRow = rows.find((r) => r.record_id === `passage:${row.passage_id}`);
    if (!passageRow) continue;
    const passage = JSON.parse(passageRow.payload_json) as Passage,
      proposal = await originalProposal(row, passage, predecessors);
    if (
      proposal?.accepted !== false ||
      proposal.status !== 'complete' ||
      !proposal.answer?.reason?.trim()
    )
      continue;
    const { case: item, answer } = proposal,
      [pid, local] = item.personKey.split('/');
    const person = passage.people.find((p) => p.id === local);
    if (
      !person ||
      passage.id !== pid ||
      row.ref !== passage.ref ||
      pid !== row.passage_id ||
      canonical(person as unknown as Json) !== canonical(item.person as unknown as Json) ||
      canonical(item.source) !== canonical(passage.source) ||
      (await textHash(canonical(item as unknown as Json, true))) !== proposal.inputSha256 ||
      (await textHash(canonical(item.source, true))) !== proposal.sourceSha256
    )
      continue;
    if (item.ref !== passage.ref && item.ref !== passage.referenceCorrection?.legacyRef) continue;
    const evidence: ReadingAnchor[] = [];
    for (const e of answer.evidence) {
      const text = passage.source[e.location],
        at = text?.indexOf(e.quote) ?? -1;
      if (!e.quote || at < 0) break;
      const unique = text.indexOf(e.quote, at + 1) < 0,
        start = Array.from(text.slice(0, at)).length,
        hash = await textHash(text);
      evidence.push({
        occurrenceKey: `${passage.referenceCorrection?.primaryPassageId ?? pid}:${e.location}:${hash}:${unique ? `${start}:${Array.from(e.quote).length}` : await textHash(e.quote)}`,
        ref: passage.ref,
        edition: '',
        quote: e.quote,
        start: unique ? start : -1,
        end: unique ? start + Array.from(e.quote).length : -1,
        source_sha256: hash,
        offset_unit: unique ? 'Unicode code points' : 'unresolved',
        location: e.location,
        primary: e.location === 'passage' && unique,
      });
    }
    if (!evidence.length || evidence.length !== answer.evidence.length) continue;
    const warned = passageWarned(rows, pid, passage);
    const id = legacyPersonId(item.personKey),
      candidate = item.candidates.find((c) => c.id === answer.personId);
    if (answer.personId && !candidate) continue;
    const card = structuredClone(cards.get(id)) ?? {
      revision,
      id,
      name: person.label,
      nameHe: person.label,
      summary: '',
      summaryHe: '',
      generation: null,
      places: [],
      ref: passage.ref,
      quote: person.quote,
      initialReading: {
        reason: '',
        alternatives: [],
        relationships: [],
        neededContext: [],
        proposals: [],
      },
    };
    card.initialReading!.proposals!.push({
      id: row.record_id,
      reason: answer.reason,
      candidate: candidate
        ? { id: candidate.id, name: candidate.canonical, nameHe: candidate.canonicalHe }
        : undefined,
      alternatives: [],
      evidence,
      sourceWarning: warned,
    });
    if (proposal.audit) {
      const audit = proposal.audit;
      if (
        audit.accepted !== false ||
        audit.disagreement !== true ||
        audit.comparison.id !== item.id ||
        audit.review.caseId !== item.id ||
        canonical(audit.comparison.first as unknown as Json) !==
          canonical(answer as unknown as Json) ||
        (await textHash(canonical(audit.comparison as unknown as Json, true))) !==
          audit.comparisonSha256 ||
        (await textHash(canonical(audit.review as unknown as Json, true))) !== audit.reviewSha256
      )
        continue;
      const second = audit.comparison.second;
      const secondEvidence = await evidenceAnchors(passage, second.evidence);
      const auditEvidence = await evidenceAnchors(passage, [
        ...(audit.review.evidence ?? []),
        ...(audit.review.supportingQuote && audit.review.quoteLocation
          ? [{ quote: audit.review.supportingQuote, location: audit.review.quoteLocation }]
          : []),
      ]);
      const alternative = item.candidates.find((c) => c.id === second.personId);
      if (!secondEvidence || !auditEvidence || (second.personId && !alternative)) continue;
      card.initialReading!.proposals!.push({
        id: `${row.record_id}/audit-answer`,
        reason: second.reason,
        candidate: alternative
          ? { id: alternative.id, name: alternative.canonical, nameHe: alternative.canonicalHe }
          : undefined,
        alternatives: [],
        evidence: secondEvidence,
        sourceWarning: warned,
        reviewDecision: 'disagreement',
      });
      card.initialReading!.proposals!.push({
        id: `${row.record_id}/audit-finding`,
        reason: audit.review.finding,
        alternatives: [],
        evidence: auditEvidence,
        sourceWarning: warned,
        reviewDecision: 'held',
      });
    }
    for (const reviewed of rows.filter(
      (r) =>
        r.kind === 'identity_assessment' &&
        ['source_review', 'user_correction'].includes(r.authority),
    )) {
      if ((await textHash(reviewed.payload_json)) !== reviewed.payload_sha256) continue;
      const assessment = JSON.parse(reviewed.payload_json) as {
        personKey: string;
        proposalId: string;
        proposalPayloadSha256: string;
        reason: string;
        outcome: string;
        evidence?: Evidence[];
        alternativesConsidered?: { reason?: string }[];
      };
      const current = JSON.parse(row.payload_json) as Proposal;
      if (
        assessment.personKey !== item.personKey ||
        assessment.proposalId !== row.record_id ||
        ![row.payload_sha256, current.referenceCorrection?.replacesPayloadSha256].includes(
          assessment.proposalPayloadSha256,
        ) ||
        !assessment.reason?.trim()
      )
        continue;
      const reviewedEvidence: ReadingAnchor[] = [];
      for (const e of assessment.evidence ?? []) {
        const text = passage.source[e.location],
          at = text?.indexOf(e.quote) ?? -1;
        if (!e.quote || at < 0) break;
        const start = Array.from(text.slice(0, at)).length,
          unique = text.indexOf(e.quote, at + 1) < 0;
        reviewedEvidence.push({
          occurrenceKey: `${pid}:${e.location}:${await textHash(text)}:${await textHash(e.quote)}`,
          ref: passage.ref,
          edition: '',
          quote: e.quote,
          start: unique ? start : -1,
          end: unique ? start + Array.from(e.quote).length : -1,
          source_sha256: await textHash(text),
          offset_unit: unique ? 'Unicode code points' : 'unresolved',
          location: e.location,
          primary: false,
        });
      }
      if (!reviewedEvidence.length || reviewedEvidence.length !== assessment.evidence?.length)
        continue;
      card.initialReading!.proposals!.push({
        id: reviewed.record_id,
        reason: assessment.reason,
        alternatives: (assessment.alternativesConsidered ?? []).flatMap((a) =>
          a.reason ? [a.reason] : [],
        ),
        evidence: reviewedEvidence,
        sourceWarning: warned,
        reviewDecision: assessment.outcome,
      });
    }
    const identityRows = rows.filter(
      (r) =>
        r.kind === 'source_identity' &&
        (JSON.parse(r.payload_json) as { personKey: string }).personKey === item.personKey,
    );
    const preferred = identityRows.some((r) => r.authority === 'user_correction')
      ? identityRows.filter((r) => r.authority === 'user_correction')
      : identityRows;
    card.initialReading!.reviewedPeople = preferred
      .filter(
        (r) =>
          ['source_review', 'user_correction'].includes(r.authority) &&
          r.decision === 'accepted_registry_identity',
      )
      .flatMap((r) => {
        const d = JSON.parse(r.payload_json) as {
          personId: string;
          historicalIdentityResolved: boolean;
          status: string;
        };
        return d.historicalIdentityResolved && d.status === 'accepted_registry_identity'
          ? [{ id: d.personId, name: registryName(rows, d.personId) }]
          : [];
      });
    const currentProposal = card.initialReading!.proposals!.find((p) => p.id === row.record_id)!;
    const assessments = card.initialReading!.proposals!.filter((p) =>
      rows.some(
        (r) =>
          r.kind === 'identity_assessment' &&
          r.record_id === p.id &&
          (JSON.parse(r.payload_json) as { proposalId?: string }).proposalId === row.record_id,
      ),
    );
    const humanAssessments = assessments.filter((p) =>
      rows.some((r) => r.record_id === p.id && r.authority === 'user_correction'),
    );
    const decisions = new Set(
      (humanAssessments.length ? humanAssessments : assessments).map((p) => p.reviewDecision),
    );
    const humanAccepted =
      preferred.some(
        (r) => r.authority === 'user_correction' && r.decision === 'accepted_registry_identity',
      ) && card.initialReading!.reviewedPeople.length > 0;
    if (
      humanAccepted &&
      card.initialReading!.reviewedPeople.some(
        (p) => canonicalSlug(p.id) === canonicalSlug(answer.personId ?? ''),
      )
    )
      currentProposal.reviewDecision = 'current';
    else if (
      card.initialReading!.reviewedPeople.some(
        (p) => canonicalSlug(p.id) !== canonicalSlug(answer.personId ?? ''),
      )
    )
      currentProposal.reviewDecision = 'superseded';
    else if (decisions.size === 1 && decisions.has('rejected'))
      currentProposal.reviewDecision = 'rejected';
    else if (humanAssessments.length && decisions.has('held'))
      currentProposal.reviewDecision = 'held';
    cards.set(id, card);
    if (
      !warned &&
      person.quoteLocation === 'passage' &&
      passage.source.passage.includes(person.quote)
    ) {
      const text = passage.source.passage,
        at = text.indexOf(person.quote),
        start = Array.from(text.slice(0, at)).length;
      const key = `${passage.referenceCorrection?.primaryPassageId ?? pid}:passage:${await textHash(text)}:${wholeName(text, person.quote) ? `${start}:${Array.from(person.quote).length}` : await textHash(person.quote)}`;
      const occurrence = occurrences.get(key) ?? {
        key,
        ref: passage.ref,
        quote: person.quote,
        people: [],
        passageOnly: !wholeName(text, person.quote),
      };
      if (!occurrence.people.some((p) => p.id === id))
        occurrence.people.push({ id, name: person.label });
      occurrences.set(key, occurrence);
    }
  }
  for (const row of rows.filter(
    (r) =>
      r.kind === 'source_identity' && ['source_review', 'user_correction'].includes(r.authority),
  )) {
    if ((await textHash(row.payload_json)) !== row.payload_sha256) continue;
    const data = JSON.parse(row.payload_json) as {
      personKey: string;
      reason?: string;
      evidence?: Evidence[];
      status: string;
    };
    if (
      !data.reason?.trim() ||
      !['accepted_passage_identity', 'accepted_registry_identity'].includes(data.status) ||
      !['accepted_local', 'accepted_registry_identity'].includes(row.decision ?? '')
    )
      continue;
    if (
      row.authority !== 'user_correction' &&
      rows.some(
        (r) =>
          r.kind === 'source_identity' &&
          r.authority === 'user_correction' &&
          (JSON.parse(r.payload_json) as { personKey: string }).personKey === data.personKey,
      )
    )
      continue;
    const [pid, local] = data.personKey.split('/');
    if (row.passage_id !== pid) continue;
    const passageRow = rows.find((r) => r.record_id === `passage:${pid}`);
    if (!passageRow) continue;
    const passage = JSON.parse(passageRow.payload_json) as Passage;
    const person = passage.people.find((p) => p.id === local);
    if (!person || passage.id !== pid || passage.ref !== row.ref) continue;
    const evidence = await evidenceAnchors(passage, data.evidence ?? []);
    if (!evidence) continue;
    const id = legacyPersonId(data.personKey);
    const card = cards.get(id) ?? {
      revision,
      id,
      name: person.label,
      nameHe: person.label,
      summary: '',
      summaryHe: '',
      generation: null,
      places: [],
      ref: passage.ref,
      quote: person.quote,
      initialReading: {
        reason: '',
        alternatives: [],
        relationships: [],
        neededContext: [],
        proposals: [],
      },
    };
    card.initialReading!.proposals!.push({
      id: row.record_id,
      reason: data.reason,
      sourceWarning: passageWarned(rows, pid, passage),
      alternatives: [],
      evidence,
    });
    cards.set(id, card);
    // A saved local identity provides passage-level discovery, not a new name placement.
    const key = `${passage.referenceCorrection?.primaryPassageId ?? pid}:local-basis:${await textHash(passage.source.passage)}:${local}`;
    if (
      !passageWarned(rows, pid, passage) &&
      ![...occurrences.values()].some((o) => o.people.some((p) => p.id === id))
    )
      occurrences.set(key, {
        key,
        ref: passage.ref,
        quote: person.quote,
        people: [{ id, name: person.label }],
        passageOnly: true,
      });
  }
  return { cards: [...cards.values()], occurrences: [...occurrences.values()] };
}

async function evidenceAnchors(
  passage: Passage,
  values: Evidence[],
): Promise<ReadingAnchor[] | null> {
  const result: ReadingAnchor[] = [];
  for (const e of values) {
    const text = passage.source[e.location],
      at = text?.indexOf(e.quote) ?? -1;
    if (!e.quote || at < 0) return null;
    const hash = await textHash(text),
      unique = text.indexOf(e.quote, at + 1) < 0,
      start = Array.from(text.slice(0, at)).length;
    result.push({
      occurrenceKey: `${passage.id}:${e.location}:${hash}:${await textHash(e.quote)}`,
      ref: passage.ref,
      edition: '',
      quote: e.quote,
      start: unique ? start : -1,
      end: unique ? start + Array.from(e.quote).length : -1,
      source_sha256: hash,
      offset_unit: unique ? 'Unicode code points' : 'unresolved',
      location: e.location,
      primary: false,
    });
  }
  return result.length ? result : null;
}

function registryName(rows: LegacyRow[], id: string): string {
  const row = rows.find((r) => r.record_id === `registry_person:${id}`);
  return row ? ((JSON.parse(row.payload_json) as { canonical?: string }).canonical ?? id) : id;
}

function passageWarned(rows: LegacyRow[], pid: string, passage: Passage): boolean {
  return rows.some((r) => {
    if (r.kind !== 'name_reading' || r.passage_id !== pid) return false;
    const d = JSON.parse(r.payload_json) as {
      sourceQuality?: { sourceReferenceVerified?: boolean; ref?: string };
      referenceCorrection?: Correction & { resolvesSourceQualityWarning?: boolean };
    };
    if (d.sourceQuality?.sourceReferenceVerified !== false) return false;
    const fixed = passage.referenceCorrection,
      block = d.referenceCorrection;
    return !(
      fixed &&
      block &&
      block.resolvesSourceQualityWarning === true &&
      block.passageId === pid &&
      fixed.passageId === pid &&
      block.legacyRef === fixed.legacyRef &&
      block.legacyRef === d.sourceQuality.ref &&
      block.canonicalRef === fixed.canonicalRef &&
      block.canonicalRef === r.ref &&
      r.ref === passage.ref
    );
  });
}
