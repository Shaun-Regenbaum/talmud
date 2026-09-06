-- During deployment, a previous worker version cannot reserve before its
-- attempt insert. Pause those new calls before contacting the provider. Cached
-- reads and already-started requests continue; the new worker reserves first.
CREATE TRIGGER require_spend_reservation BEFORE INSERT ON billing_attempts
WHEN NOT EXISTS (SELECT 1 FROM spend_reservations WHERE attempt_id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'A spending reservation is required before generation');
END;
-- next statement
-- Catch requests that arrived between the earlier backfill and trigger setup.
INSERT OR IGNORE INTO spend_reservations
  (attempt_id, app, started_at, custom, held_nanos)
SELECT id, app, started_at, 1, MAX(COALESCE(estimated_nanos, 0), 1000000000)
FROM billing_attempts;
-- next statement
-- Fire the settlement trigger for costs learned between migrations. Unknown
-- requests keep their holds. Known receipts and native estimates release them.
UPDATE billing_attempts SET charge_id = charge_id
WHERE id IN (SELECT attempt_id FROM spend_reservations WHERE settled_nanos IS NULL);
