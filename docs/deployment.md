# Review on staging before releasing

Open pull requests against `staging`. Passing pull requests can merge there. The Release workflow tests the commit and deploys both readers:

- https://staging.talmud.dev
- https://staging.tanach.dev
- https://staging.talmud.dev/components/

The workflow then waits for Shaun to approve its **Production** job in GitHub Actions. Approval advances `master` to that exact commit and deploys both production readers. The production branch keeps its existing name, `master`.

If staging changed after a run started, that run cannot promote. Review and approve the newest successful run. A failed deployment can be retried from the same run. Production deployments run one at a time.

## Staging uses real saved content

The staging readers have separate KV namespaces and a separate billing database. A private service reads saved production KV values when staging has no local value. That service has no public route and no write endpoint. Staging edits and deletion markers stay in staging. Saved content can change as production warms new pages; this is not a frozen content snapshot.

Paid generation is disabled. Staging has no generation queue, scheduled warming, email binding, or inference secrets. Missing generated content stays missing. Existing content still opens. Billing starts from a real production snapshot taken when staging was created. It does not track later production charges automatically.

The component library uses the same shared controls as both readers. It is included in the staging deployment.

## Release controls

The Production environment requires Shaun's approval, including for administrator-triggered runs. `master` requires the test check and `staging-approved` status. The release workflow writes that status only after the approval job starts. Direct `pnpm ship` commands are blocked. Repository administrators can still change these settings; ordinary releases should use this workflow.

`/api/release` reports the environment and commit. The workflow checks both staging apps before asking for approval and checks them again before promotion.

To refresh billing, export `corpus-billing` and import it into a new staging database, then update only the staging bindings. Do not import a staging snapshot into production. Cache keys and producer recipes remain unchanged.
