CREATE TABLE spend_reservations (
  attempt_id TEXT PRIMARY KEY,
  app TEXT NOT NULL,
  started_at TEXT NOT NULL,
  custom INTEGER NOT NULL,
  held_nanos INTEGER NOT NULL CHECK(held_nanos >= 0),
  settled_nanos INTEGER CHECK(settled_nanos >= 0),
  basis TEXT NOT NULL DEFAULT 'reserved'
);
CREATE INDEX spend_reservations_app_date ON spend_reservations(app, started_at);
CREATE INDEX spend_reservations_pending ON spend_reservations(app, settled_nanos);
-- Keep charges recorded before this migration in the admission total. Unknown
-- older attempts retain a conservative hold rather than becoming free.
INSERT INTO spend_reservations (attempt_id, app, started_at, custom, held_nanos, settled_nanos, basis)
SELECT a.id, a.app, a.started_at, 1, MAX(COALESCE(a.estimated_nanos, 0), 1000000000),
  CASE WHEN a.gateway_hit = 1 THEN 0
       WHEN a.charge_id IS NOT NULL THEN COALESCE(c.billed_nanos, 0)
       WHEN a.status = 'succeeded' AND a.model LIKE '@cf/%' THEN a.estimated_nanos
       ELSE NULL END,
  CASE WHEN a.gateway_hit = 1 OR a.charge_id IS NOT NULL THEN 'receipt'
       WHEN a.status = 'succeeded' AND a.model LIKE '@cf/%' AND a.estimated_nanos IS NOT NULL THEN 'estimate'
       ELSE 'reserved' END
FROM billing_attempts a LEFT JOIN billing_charges c ON c.attempt_id = a.id;
