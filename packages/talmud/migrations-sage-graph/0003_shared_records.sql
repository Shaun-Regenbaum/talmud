-- New revisions can share immutable record versions. Existing snapshots stay intact.
CREATE TRIGGER sage_graph_revision_no_replace BEFORE INSERT ON sage_graph_revisions
WHEN EXISTS (SELECT 1 FROM sage_graph_revisions WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT, 'Graph revision IDs cannot be replaced'); END;

CREATE TABLE sage_graph_record_versions (
  id INTEGER PRIMARY KEY,
  version_sha256 TEXT NOT NULL UNIQUE,
  record_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  passage_id TEXT,
  ref TEXT,
  subject_id TEXT,
  object_id TEXT,
  authority TEXT NOT NULL,
  decision TEXT,
  payload_sha256 TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX sage_graph_version_kind ON sage_graph_record_versions(kind,record_id);
CREATE INDEX sage_graph_version_record ON sage_graph_record_versions(record_id);
CREATE INDEX sage_graph_version_passage ON sage_graph_record_versions(passage_id,record_id);
CREATE INDEX sage_graph_version_ref ON sage_graph_record_versions(ref,record_id);
CREATE INDEX sage_graph_version_subject ON sage_graph_record_versions(subject_id,record_id);
CREATE INDEX sage_graph_version_object ON sage_graph_record_versions(object_id,record_id);
CREATE INDEX sage_graph_version_decision ON sage_graph_record_versions(decision,record_id);

CREATE TABLE sage_graph_revision_members (
  revision_id TEXT NOT NULL REFERENCES sage_graph_revisions(id),
  record_id TEXT NOT NULL,
  version_id INTEGER NOT NULL REFERENCES sage_graph_record_versions(id),
  PRIMARY KEY (revision_id,record_id)
);
CREATE INDEX sage_graph_member_version ON sage_graph_revision_members(version_id,revision_id);

CREATE VIEW sage_graph_all_records AS
SELECT revision_id,record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,
       payload_sha256,payload_json FROM sage_graph_records
UNION ALL
SELECT m.revision_id,v.record_id,v.kind,v.passage_id,v.ref,v.subject_id,v.object_id,
       v.authority,v.decision,v.payload_sha256,v.payload_json
FROM sage_graph_record_versions v CROSS JOIN sage_graph_revision_members m ON v.id=m.version_id;

CREATE TRIGGER sage_graph_version_no_update BEFORE UPDATE ON sage_graph_record_versions
BEGIN SELECT RAISE(ABORT, 'Record versions are immutable'); END;
CREATE TRIGGER sage_graph_version_no_delete BEFORE DELETE ON sage_graph_record_versions
BEGIN SELECT RAISE(ABORT, 'Record versions are immutable'); END;
CREATE TRIGGER sage_graph_version_no_replace BEFORE INSERT ON sage_graph_record_versions
WHEN EXISTS (SELECT 1 FROM sage_graph_record_versions
             WHERE id=NEW.id OR version_sha256=NEW.version_sha256)
BEGIN SELECT RAISE(ABORT, 'Record versions are immutable'); END;

CREATE TRIGGER sage_graph_member_insert BEFORE INSERT ON sage_graph_revision_members
WHEN NOT EXISTS (
    SELECT 1 FROM sage_graph_revisions WHERE id=NEW.revision_id AND state='loading'
      AND json_extract(manifest_json,'$.storageFormat')='shared-v1'
  )
BEGIN SELECT RAISE(ABORT, 'Shared revisions must be loading'); END;
CREATE TRIGGER sage_graph_member_insert_matches BEFORE INSERT ON sage_graph_revision_members
WHEN NOT EXISTS (
    SELECT 1 FROM sage_graph_record_versions WHERE id=NEW.version_id AND record_id=NEW.record_id
  )
BEGIN SELECT RAISE(ABORT, 'Record membership differs from its version'); END;
CREATE TRIGGER sage_graph_member_update BEFORE UPDATE ON sage_graph_revision_members
WHEN NOT EXISTS (
    SELECT 1 FROM sage_graph_revisions WHERE id=OLD.revision_id AND state='loading'
  ) OR NOT EXISTS (
    SELECT 1 FROM sage_graph_revisions WHERE id=NEW.revision_id AND state='loading'
      AND json_extract(manifest_json,'$.storageFormat')='shared-v1'
  )
BEGIN SELECT RAISE(ABORT, 'Shared revisions must be loading'); END;
CREATE TRIGGER sage_graph_member_update_matches BEFORE UPDATE ON sage_graph_revision_members
WHEN NOT EXISTS (
    SELECT 1 FROM sage_graph_record_versions WHERE id=NEW.version_id AND record_id=NEW.record_id
  )
BEGIN SELECT RAISE(ABORT, 'Record membership differs from its version'); END;
CREATE TRIGGER sage_graph_member_delete BEFORE DELETE ON sage_graph_revision_members
WHEN (SELECT state FROM sage_graph_revisions WHERE id=OLD.revision_id)='verified'
BEGIN SELECT RAISE(ABORT, 'Verified graph revisions are immutable'); END;

CREATE TRIGGER sage_graph_no_snapshot_in_shared BEFORE INSERT ON sage_graph_records
WHEN json_extract((SELECT manifest_json FROM sage_graph_revisions WHERE id=NEW.revision_id),
                  '$.storageFormat')='shared-v1'
BEGIN SELECT RAISE(ABORT, 'Shared revisions cannot contain copied records'); END;
CREATE TRIGGER sage_graph_no_move_snapshot_into_shared BEFORE UPDATE ON sage_graph_records
WHEN json_extract((SELECT manifest_json FROM sage_graph_revisions WHERE id=NEW.revision_id),
                  '$.storageFormat')='shared-v1'
BEGIN SELECT RAISE(ABORT, 'Shared revisions cannot contain copied records'); END;

CREATE TRIGGER sage_graph_no_change_storage BEFORE UPDATE OF manifest_json ON sage_graph_revisions
WHEN json_extract(OLD.manifest_json,'$.storageFormat') IS NOT
     json_extract(NEW.manifest_json,'$.storageFormat')
 AND (EXISTS (SELECT 1 FROM sage_graph_records WHERE revision_id=OLD.id)
   OR EXISTS (SELECT 1 FROM sage_graph_revision_members WHERE revision_id=OLD.id))
BEGIN SELECT RAISE(ABORT, 'A populated revision cannot change storage format'); END;
