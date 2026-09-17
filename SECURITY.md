# Security

## Reporting a problem

Please do not open a public issue for a security problem. Use one of these instead:

- GitHub's private report form: **Security → Report a vulnerability** on this repository.
- Email: shaunregenbaum@gmail.com with "talmud.dev security" in the subject.

You will get a reply within a week. There is no bug bounty. This is a personal, non-commercial project, but reports are taken seriously and fixes ship as soon as they are ready.

## What counts

Things worth reporting:

- Reaching an admin or generation route without the shared secret. Routes that change state, spend money, or edit cached content sit behind an `x-studio-secret` header. Getting past that is a real problem.
- Making the site spend money you should not be able to spend. Generation calls a paid model and is protected by per-hour and per-day budget caps and a credit-balance gate. A way around those caps matters.
- Script injection through the page. Talmud text, commentary, and study aids arrive as HTML from outside sources and are rendered into the reader. A way to run script from that content is a bug.
- Prompt injection that lands in generated notes. Producers read source texts and write notes for other people. A crafted source that makes a producer write something it should not is worth a report, even though the text sources are curated.
- Leaked secrets, keys, or private data in the repository, the build, or a response.

Things that are not security problems:

- A generated note that is wrong. Use the "Wrong or misplaced note" issue template.
- Rate limits, cold pages that take minutes to fill, or an "AI paused" banner. Those are how the system says it is out of budget.

## Which versions

Only what is deployed from the `master` branch. Production always equals `master`; there are no other supported versions.
