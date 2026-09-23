# Review on staging before releasing

Open pull requests against `staging`, the default branch. A pull request can merge once its `check` job passes. Each merge runs the Release workflow. It tests the commit and deploys both readers and the component library to staging:

- https://staging.talmud.dev
- https://staging.tanach.dev
- https://staging.talmud.dev/components/

The workflow then waits for Shaun to approve its **Production** job in GitHub Actions. Approval moves `master` to that exact commit and deploys both production readers. The production branch keeps its existing name, `master`.

## Which run to approve

Approve the newest run. If another merge reaches staging before a run starts deploying, the older run stops and skips its Production job. If staging moves while a run is already waiting for approval, that run still asks, but it refuses to promote when approved. Reject it, or let it fail, and approve the newer one. Production deployments run one at a time. A failed deployment can be retried from the same run.

## Staging uses real saved content

The staging readers have their own KV namespaces and their own billing database. When staging has no copy of a key, a private service reads the saved production value. That service has no public address and no write route. Staging's edits and deletions stay in staging, and each one expires within a day. After that, staging shows production's value again. Saved content changes as production warms new pages. It is not a frozen snapshot.

The private service is the only staging Worker bound to production storage. Once `master` contains it, a change to it deploys only after Production approval. Until then, staging keeps running the approved version.

Paid generation is off. Staging has no generation queue, scheduled warming, email binding, or model keys. A page production has not generated yet stays empty on staging and shows the usual "AI generation is paused" banner. That banner does not mean production is out of budget. Pages production has already generated open normally.

Billing starts from a copy of production's billing database taken when staging was created. It does not follow later production charges.

Staging tells search engines not to index it (`robots.txt` and `X-Robots-Tag: noindex`).

## What the approval does and does not protect

The Production environment requires Shaun's approval, and administrators cannot skip it. `master` requires the `check` job and a `staging-approved` status, and administrators cannot skip those either. Only the approved Production job writes `staging-approved` and moves `master`. It pushes with a write key for this repository only, stored as a Production environment secret. GitHub does not let a workflow's own token move a branch past a change to workflow files, so the key is needed.

This keeps releases in order. It is not a security wall. The Cloudflare token is a repository secret, a Cloudflare token cannot be limited to one Worker, and anyone with push access or the local Cloudflare login can still deploy directly.

`pnpm ship` still works as a fallback for when the workflow is broken. It deploys only a clean tree whose content matches `origin/master`, so in normal use it ships what was already approved. `SHIP_FORCE=1` overrides that check for a deliberate emergency deploy.

`/api/release` reports the environment and commit. The workflow checks both staging apps before asking for approval and again before promotion.

## Refreshing staging billing

Export `corpus-billing`, import it into a new staging database, then update only the staging bindings. Never import a staging copy into production. Cache keys and producer recipes do not change.
