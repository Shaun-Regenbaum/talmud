CREATE TABLE IF NOT EXISTS sage_graph_revisions (
  id TEXT PRIMARY KEY,
  manifest_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('loading', 'verified')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS sage_graph_records (
  revision_id TEXT NOT NULL REFERENCES sage_graph_revisions(id),
  record_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  passage_id TEXT,
  ref TEXT,
  subject_id TEXT,
  object_id TEXT,
  authority TEXT NOT NULL,
  decision TEXT,
  payload_sha256 TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (revision_id, record_id)
);
CREATE INDEX IF NOT EXISTS sage_graph_kind ON sage_graph_records(revision_id, kind, record_id);
CREATE INDEX IF NOT EXISTS sage_graph_passage ON sage_graph_records(revision_id, passage_id, record_id);
CREATE INDEX IF NOT EXISTS sage_graph_ref ON sage_graph_records(revision_id, ref, record_id);
CREATE INDEX IF NOT EXISTS sage_graph_subject ON sage_graph_records(revision_id, subject_id, record_id);
CREATE INDEX IF NOT EXISTS sage_graph_object ON sage_graph_records(revision_id, object_id, record_id);
CREATE TRIGGER IF NOT EXISTS sage_graph_no_verified_update
BEFORE UPDATE ON sage_graph_records
WHEN (SELECT state FROM sage_graph_revisions WHERE id=OLD.revision_id)='verified'
BEGIN SELECT RAISE(ABORT, 'Verified graph revisions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS sage_graph_no_verified_delete
BEFORE DELETE ON sage_graph_records
WHEN (SELECT state FROM sage_graph_revisions WHERE id=OLD.revision_id)='verified'
BEGIN SELECT RAISE(ABORT, 'Verified graph revisions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS sage_graph_no_verified_insert
BEFORE INSERT ON sage_graph_records
WHEN (SELECT state FROM sage_graph_revisions WHERE id=NEW.revision_id)='verified'
BEGIN SELECT RAISE(ABORT, 'Verified graph revisions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS sage_graph_no_revision_update
BEFORE UPDATE ON sage_graph_revisions WHEN OLD.state='verified'
BEGIN SELECT RAISE(ABORT, 'Verified graph revisions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS sage_graph_no_revision_delete
BEFORE DELETE ON sage_graph_revisions WHEN OLD.state='verified'
BEGIN SELECT RAISE(ABORT, 'Verified graph revisions are immutable'); END;
