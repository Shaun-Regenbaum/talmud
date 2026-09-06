# How request costs are recorded

Every paid request starts with a database record. Retries get separate records.
When a provider returns a receipt, its ID identifies the charge. Repeated
receipt delivery cannot add the same charge again. A gateway cache hit adds no
new charge. If a request fails after returning its usage, its charge still counts.

The shared `corpus-billing` database separates Talmud and Tanach by application.
It also records the key hash, model, producer, text location, language, and version
when the caller supplies them. It does not store credentials or prompt text.

`GET /api/billing?from=YYYY-MM-DD&through=YYYY-MM-DD` shows known charges and
unknown costs for an inclusive UTC date range. The Cost page displays those
figures separately from provider billing and the older daily estimates. New
records have no expiry. Missing historical records cannot be reconstructed.

A scheduled reconciliation checks interrupted requests that have a receipt ID.
It uses the same key that made the request. A missing receipt ID or a retired
key leaves the request unresolved. A later cached response does not prove which
earlier request paid for it, so it cannot safely fill that gap.

# How new requests reserve spending room

Admission and the request record are written in one database transaction. The
conditional insert checks the sum already spent or reserved before admitting
another request. This prevents concurrent jobs from spending the same room.
A retry must obtain its own reservation.

Reservations use a conservative text-size estimate and the requested output
limit. Provider routing caps input and output rates at four times the configured
list rates and excludes per-request fees. An unknown model price blocks the
request until a rate is configured. The reservation is an estimate, not a
promise about the final invoice. Actual receipts always replace it, even when
a charge exceeds the reservation. Such an excess reduces room for later calls.

A gateway cache hit releases its reservation. A charged response settles it
exactly once. An interrupted request without a known cost keeps its hold,
including across midnight and hourly boundaries. Holds do not expire merely
because a connection timed out. Completed requests through the native model
binding use a list-price estimate for the spending guard. Those estimates stay
excluded from the dashboard's known-charge total.

The daily window uses request start time in UTC. Custom questions also count
against the previous 60 minutes. Existing limits stay unchanged: Talmud has
$300 per day and $10 for custom questions; Tanach has $20 and $5. Budget status
reports spending and reserved amounts separately. Clearing the old pause
latches cannot erase spending or unresolved holds.

Migration preserves earlier recorded charges. Older records did not store the
custom-question flag, so they conservatively count toward both limits. A database guard briefly pauses new generation from the previous worker
version during deployment. Cached reads continue, and started requests still
settle. The new worker reserves before recording its attempt. A catch-up step
repairs records that changed between migrations. Pre-ledger spending is still outside these new records.

# Deployment

CI applies additive migrations before deploying all three workers. The existing
`talmud-tanach-deploy-2026-06-10` credential has D1 Write permission on the
existing account. Other deployment permissions are unchanged.

Verification uses captured paid responses and a real local database. The suite
checks duplicate receipts, concurrent admission, charged failures, and unknown
costs. No full-corpus reprocessing is needed to enable accounting.
