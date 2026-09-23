# Review on staging before releasing

Open pull requests against `staging`. Passing pull requests can merge there. The Release workflow tests the commit and deploys both readers:

- https://staging.talmud.dev
- https://staging.tanach.dev
- https://staging.talmud.dev/components/

The workflow then waits for Shaun to approve its **Production** job in GitHub Actions. Approval advances `master` to that exact commit and deploys both production readers. The production branch keeps its existing name, `master`.

If staging changed after a run started, that run stops before deploying and skips its Production job. Only the newest run asks for approval. If staging changes while a run waits for approval, that run refuses to promote. Review and approve the newest run. A failed deployment can be retried from the same run. Production deployments run one at a time.

## Staging uses real saved content

The staging readers have separate KV namespaces and a separate billing database. A private service reads saved production KV values when staging has no local value. That service has no public route and no write endpoint. Staging edits and deletion markers stay in staging. Saved content can change as production warms new pages; this is not a frozen content snapshot.

Paid generation is disabled. Staging has no generation queue, scheduled warming, email binding, or inference secrets. Missing generated content stays missing. Existing content still opens. A page that production has not generated yet shows the usual "AI generation is paused" banner on staging. That banner does not mean production is out of budget. Billing starts from a real production snapshot taken when staging was created. It does not track later production charges automatically.

The component library uses the same shared controls as both readers. It is included in the staging deployment.

## Release controls

The Production environment requires Shaun's approval, including for administrator-triggered runs. `master` requires the test check and `staging-approved` status, and administrators cannot skip them. The release workflow writes that status only after the approval job starts. Repository administrators can still change these settings; ordinary releases should use this workflow.

`pnpm ship` still works as a fallback for when this workflow is broken. It only deploys a clean tree whose content matches `origin/master`, so it can only ship what was already approved. `SHIP_FORCE=1` overrides that check for a deliberate emergency deploy.

`/api/release` reports the environment and commit. The workflow checks both staging apps before asking for approval and checks them again before promotion.

To refresh billing, export `corpus-billing` and import it into a new staging database, then update only the staging bindings. Do not import a staging snapshot into production. Cache keys and producer recipes remain unchanged.
