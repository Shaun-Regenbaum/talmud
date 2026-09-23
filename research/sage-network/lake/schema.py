"""Saved source evidence and the additive passage-reading pilot."""

from prophex_lake.config import Lake
from pilot_store import PILOT_TABLES
from followup_store import RESEARCH_TABLES

VERSION = "sage-import-v1"
STORAGE_VERSION = "sage-import-v1+passage-pilot-v1+source-investigation-v1"
FAMILIES = (
    ("family", "Family"), ("transmission", "Transmission"),
    ("teaching", "Teaching"), ("speech", "Speech"), ("views", "Views"),
    ("scenes", "Scenes"), ("time", "Time"),
)
# Every row has a stable key; JSON preserves fields the first import does not index.
TABLES = {
    "ingests": "ingest_id VARCHAR PRIMARY KEY, importer_version VARCHAR NOT NULL, inputs_json VARCHAR NOT NULL",
    "source_units": "unit_id VARCHAR PRIMARY KEY, corpus VARCHAR NOT NULL, work VARCHAR NOT NULL, edition VARCHAR NOT NULL, unit_ref VARCHAR NOT NULL, segment_count BIGINT NOT NULL, segments_sha256 VARCHAR NOT NULL, document_json VARCHAR NOT NULL",
    "source_segments": "segment_id VARCHAR PRIMARY KEY, unit_id VARCHAR NOT NULL, ordinal BIGINT NOT NULL, ref VARCHAR NOT NULL, text VARCHAR NOT NULL, text_sha256 VARCHAR NOT NULL",
    "input_files": "file_id VARCHAR PRIMARY KEY, ingest_id VARCHAR NOT NULL, relative_path VARCHAR NOT NULL, sha256 VARCHAR NOT NULL, byte_count BIGINT NOT NULL, row_count BIGINT NOT NULL",
    "legacy_pairs": "record_id VARCHAR PRIMARY KEY, file_id VARCHAR NOT NULL, ordinal BIGINT NOT NULL, pair_key VARCHAR NOT NULL, ref VARCHAR NOT NULL, name_a VARCHAR NOT NULL, name_b VARCHAR NOT NULL, label VARCHAR, direction VARCHAR, sure BOOLEAN, payload_json VARCHAR NOT NULL",
    "legacy_first_pass": "record_id VARCHAR PRIMARY KEY, file_id VARCHAR NOT NULL, ordinal BIGINT NOT NULL, pair_key VARCHAR NOT NULL, payload_json VARCHAR NOT NULL",
    "legacy_readings": "record_id VARCHAR PRIMARY KEY, file_id VARCHAR NOT NULL, ordinal BIGINT NOT NULL, pair_key VARCHAR NOT NULL, payload_json VARCHAR NOT NULL",
    "review_documents": "document_id VARCHAR PRIMARY KEY, filename VARCHAR NOT NULL, sha256 VARCHAR NOT NULL, document_json VARCHAR NOT NULL",
    "review_cases": "case_id VARCHAR PRIMARY KEY, document_id VARCHAR NOT NULL, local_id VARCHAR NOT NULL, ref VARCHAR NOT NULL, title VARCHAR NOT NULL, genre_json VARCHAR NOT NULL, payload_json VARCHAR NOT NULL",
    "review_sources": "review_source_id VARCHAR PRIMARY KEY, case_id VARCHAR NOT NULL, ref VARCHAR NOT NULL, edition VARCHAR NOT NULL, text VARCHAR NOT NULL, text_sha256 VARCHAR NOT NULL, payload_json VARCHAR NOT NULL",
    "review_claims": "claim_id VARCHAR PRIMARY KEY, case_id VARCHAR NOT NULL, ordinal BIGINT NOT NULL, subject VARCHAR NOT NULL, relation VARCHAR NOT NULL, object VARCHAR NOT NULL, quote VARCHAR NOT NULL, branch VARCHAR NOT NULL, status VARCHAR NOT NULL, payload_json VARCHAR NOT NULL",
    "review_claim_sources": "link_id VARCHAR PRIMARY KEY, claim_id VARCHAR NOT NULL, review_source_id VARCHAR NOT NULL, start_offset BIGINT NOT NULL, end_offset BIGINT NOT NULL, match_status VARCHAR NOT NULL",
    "relation_families": "family_id VARCHAR PRIMARY KEY, label VARCHAR NOT NULL",
}
TABLES.update(PILOT_TABLES)
TABLES.update(RESEARCH_TABLES)
KEYS = {name: (ddl.split()[0],) for name, ddl in TABLES.items()}
LAKE = Lake("sage_network", "Source passages, earlier pair readings and proposed relationship reviews.", KEYS)
