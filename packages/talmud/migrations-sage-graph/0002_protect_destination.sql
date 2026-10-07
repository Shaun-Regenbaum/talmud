CREATE TRIGGER IF NOT EXISTS sage_graph_no_move_into_verified
BEFORE UPDATE ON sage_graph_records
WHEN (SELECT state FROM sage_graph_revisions WHERE id=NEW.revision_id)='verified'
BEGIN SELECT RAISE(ABORT, 'Verified graph revisions are immutable'); END;
CREATE INDEX IF NOT EXISTS sage_graph_decision ON sage_graph_records(revision_id, decision, record_id);
