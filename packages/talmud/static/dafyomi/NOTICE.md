# dafyomi.co.il study content — attribution & usage

The JSON files under this directory are a **structured ingestion** of per-daf
study material published by **Kollel Iyun HaDaf** (the Dafyomi Advancement
Forum, headed by Rav Mordecai Kornfeld) at <https://www.dafyomi.co.il>.

- Source content © Kollel Iyun HaDaf. All rights remain with them.
- This is a personal, non-commercial, open-source study project. The content
  is ingested as a **source** to align against the daf and surface as study
  context, with attribution and links back to the original pages (see each
  daf's `source.urls`).
- Scraping honors the site's `robots.txt` `Crawl-delay: 30`.
- It is not redistributed as a standalone copy of their site.

If you are from Kollel Iyun HaDaf and would like anything changed, please reach
out via the project repository.

Content types ingested: Insights, Background, Halacha, Tosfos outlines, Review
questions, Points outline, Hebrew charts, Yerushalmi outlines, and Revach l'Daf
(brief per-daf highlights, co-published with Revach l'Neshamah,
<https://www.revach.net>). Regenerate with
`node scripts/scrape-dafyomi.mjs --tractate <Tractate>`.
