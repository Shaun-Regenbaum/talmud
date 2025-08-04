
# Sefaria API Documentation (Updated 3 Aug 2025)

## Base URL
```
https://www.sefaria.org/api
```

| Feature | Notes |
|---------|-------|
| Auth    | None (public) |
| Format  | JSON (JSONP supported) |
| Data    | Real‑time | 

## 1 Texts (v3)
`GET /v3/texts/{tref}`  
Query params: `lang`, `version`, `commentary` (0/1), `context` (0/1)

Example:
```js
const res = await fetch('https://www.sefaria.org/api/v3/texts/Berakhot.2a?lang=en');
```

## 2 Texts (legacy v1)
`GET /texts/{tref}` – still useful for `vhe` / `ven` version selection.

Key params (all strings unless noted):
- `vhe`, `ven`
- `commentary` 0/1
- `context`, `pad`, `firstAvailableRef`, `layer`, `alts`, `wrapLinks`, `wrapNamedEntities`, `stripItags`
- `multiple` (int)

## 3 Related
`GET /related/{tref}` returns **links, sheets, notes, webpages, topics, manuscripts, media**.

## 4 Links
`GET /links/{tref}` – fine‑grained control.  
Params: `with_text`, `with_sheet_links` (0/1)

## 5 Versions
`GET /texts/versions/{index}` – list every version (title, language, license, etc.).

## 6 Translations & Languages
* `GET /texts/translations` → array of ISO‑639‑1 codes  
* `GET /texts/translations/{lang}` → dictionary of translated titles.

## 7 Manuscripts
`GET /manuscripts/{tref}` – high‑res images & metadata when available.

## 8 Calendars
* `GET /calendars` – daily/weekly learning schedule.  
  Params: `diaspora` 0/1, `custom` (ashkenazi|sephardi|edot%20hamizrach), optional `year`, `month`, `day`, `timezone`.
* `GET /calendars/next-read/{parasha}` – next reading of a parasha.

## 9 Lexicon
* `GET /words/{word}` – dictionary entries.  Extra params: `lookup_ref`, `never_split`, `always_split`, `always_consonants`.
* `GET /words/completion/{word}/{lexicon}` – auto‑complete, optional `limit`.

## 10 Topics
* `GET /topics` – list (param `limit` default 1000).  
* `GET /topics/{slug}` (v1) or `/v2/topics/{slug}` (groupable with `with_refs=1`).  
* `GET /topics-graph/{slug}` – topic‑to‑topic links.  
* `GET /texts/random-by-topic` – random text from popular topic.

## 11 Index
* `GET /index` – full library TOC (cache!).  
* `GET /shape/{title}` – chapter/segment counts.

## 12 Search & Misc
Search endpoints are still experimental – see GitHub wiki.  
Other helpers: `/category`, `/find-refs`, `/social` image builder.

## Talmud Tips
| Pattern | Example |
|---------|---------|
| `{Tractate}.{Daf}{Amud}` | `Berakhot.2a`, `Shabbat.31b` |
| Multi‑word names | Use `_` e.g. `Bava_Metzia.85a` |

### Fetch with Commentaries
```js
const [main, rel] = await Promise.all([
  fetch('/api/texts/Berakhot.2a'),
  fetch('/api/related/Berakhot.2a')
]);
const rashiRef = (await rel.json()).links
  .find(l => l.index_title.startsWith('Rashi') && l.type==='commentary').ref;
const rashi = await fetch(`/api/texts/${rashiRef}`);
```

### Common Versions
| Type | Name |
|------|------|
| Primary Aramaic | `William_Davidson_Edition_-_Aramaic` |
| English | `William Davidson Edition - English` |
| Commentaries | `Rashi_on_{Tractate}`, `Tosafot_on_{Tractate}` |

## Best Practices
- **Cache** heavy endpoints (`/index`, long texts).
- Always check `response.ok`.
- Use specific versions for consistency.
- Batch parallel requests.

## Error Codes
| Code | Meaning |
|------|---------|
| 400  | Bad params |
| 404  | Ref not found |
| 500  | Server issue (retry) |

---

*This update reflects the OpenAPI spec commit 3 Aug 2025 and developer docs pages.* 
