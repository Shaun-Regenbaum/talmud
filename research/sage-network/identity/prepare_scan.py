"""Build unaccepted D1 review records from a reproducible namesake scan."""
import argparse
import json
from pathlib import Path
from network_scan import VERSION, LIMITATIONS, encode, read_database, scan, sha


def records_for(result, parent, registry_hash):
    records = []
    for family in result['families']:
        for mention in family['mentions']:
            data = {k:v for k,v in mention.items() if k not in {'evidence','existingAssessments'}}
            data.update(schemaVersion=VERSION, status='needs_review', accepted=False,
                family=family['family'], inputRevision=parent['revision'],
                inputRecordSetSha256=parent['recordSetSha256'], registrySha256=registry_hash,
                coverage=result['coverage'], quarantinedClaimCount=len(result['errors']), limitations=LIMITATIONS)
            # Full evidence remains in its immutable original record.
            data['evidenceRecords'] = [{k:v for k,v in edge.items() if k not in {'quote','originalClaim'}}
                                       for edge in mention['evidence']]
            data['existingAssessments'] = [{k:v for k,v in review.items() if k!='assessment'}
                                           for review in mention['existingAssessments']]
            records.append(dict(record_id='namesake_scan:'+mention['personKey'], kind='namesake_scan',
                passage_id=mention['passageId'], ref=mention['ref'], subject_id=mention['nodeId'],
                object_id=None, authority='screening', decision='needs_review', data=data))
    return sorted(records,key=lambda r:r['record_id'])


def build(rows, registry, parent):
    result=scan(rows,registry,None)
    if sum(result['coverage']['claimDispositions'].values())!=result['coverage']['inputClaims']:
        raise ValueError('Incomplete claim accounting')
    registry_hash=sha(encode(registry))
    records=records_for(result,parent,registry_hash)
    for slug,entry in sorted(registry.items()):
        records.append(dict(record_id='namesake_registry:'+slug,kind='namesake_registry',
            passage_id=None,ref=None,subject_id=slug,object_id=None,authority='screening',decision='needs_review',
            data=dict(status='needs_review',accepted=False,slug=slug,registryEntry=entry,
                registrySha256=registry_hash,inputRevision=parent['revision'],
                note='Registry metadata used for name comparisons. Generations are not independently verified.')))
    return dict(parentRevision=parent['revision'],
        description='Add source-linked namesake review groups without accepting identities or eras.',
        namesakeRegistry=registry, namesakeRegistrySha256=sha(encode(registry)),
        records=sorted(records,key=lambda r:r['record_id']))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['database','manifest','registry','output']:
        p.add_argument(name,type=Path)
    args=p.parse_args()
    parent=json.loads(args.manifest.read_text())
    result=build(read_database(args.database.resolve(),parent),json.loads(args.registry.read_text())['rabbis'],parent)
    content=encode(result)+'\n'
    if args.output.exists() and args.output.read_text()!=content:
        raise ValueError('Refusing to overwrite different changes')
    pending=args.output.with_suffix('.part');pending.write_text(content);pending.replace(args.output)
    print(json.dumps(dict(records=len(result['records']),bytes=len(content.encode()))))
