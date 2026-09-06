-- Older worker versions can still finish requests during deployment. Record
-- those requests too. New versions reserve first, so INSERT OR IGNORE keeps
-- their request-specific hold and custom-question flag.
CREATE TRIGGER reserve_older_attempt AFTER INSERT ON billing_attempts
BEGIN
  INSERT OR IGNORE INTO spend_reservations
    (attempt_id, app, started_at, custom, held_nanos)
    VALUES (NEW.id, NEW.app, NEW.started_at, 1, 1000000000);
END;
CREATE TRIGGER settle_older_attempt
AFTER UPDATE OF charge_id, gateway_hit, status, estimated_nanos ON billing_attempts
BEGIN
  UPDATE spend_reservations SET
    settled_nanos = COALESCE(
      CASE WHEN NEW.gateway_hit = 1 THEN 0
           WHEN NEW.charge_id IS NOT NULL THEN COALESCE(
             (SELECT billed_nanos FROM billing_charges WHERE attempt_id = NEW.id), 0)
           WHEN NEW.status = 'succeeded' AND NEW.model LIKE '@cf/%' THEN NEW.estimated_nanos
           ELSE NULL END, settled_nanos),
    basis = CASE WHEN NEW.gateway_hit = 1 OR NEW.charge_id IS NOT NULL THEN 'receipt'
                 WHEN NEW.status = 'succeeded' AND NEW.model LIKE '@cf/%' AND NEW.estimated_nanos IS NOT NULL THEN 'estimate'
                 ELSE basis END
    WHERE attempt_id = NEW.id;
END;
