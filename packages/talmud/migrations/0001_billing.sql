CREATE TABLE billing_attempts (
  id TEXT PRIMARY KEY,
  app TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  model TEXT NOT NULL,
  producer TEXT,
  work TEXT,
  unit TEXT,
  lang TEXT,
  version TEXT,
  kind TEXT,
  tag TEXT,
  status TEXT NOT NULL DEFAULT 'started',
  provider_id TEXT,
  charge_id TEXT,
  gateway_hit INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER,
  tokens_out INTEGER,
  tokens_cached INTEGER,
  estimated_nanos INTEGER,
  error_code TEXT
);
CREATE INDEX billing_attempts_app_date ON billing_attempts(app, started_at);
CREATE INDEX billing_attempts_unresolved ON billing_attempts(app, provider_id, charge_id);
CREATE TABLE billing_charges (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES billing_attempts(id),
  app TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  charged_at TEXT NOT NULL,
  billed_nanos INTEGER NOT NULL CHECK(billed_nanos >= 0)
);
CREATE INDEX billing_charges_app_date ON billing_charges(app, charged_at);
