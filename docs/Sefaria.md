# Sefaria API Documentation

## Overview

The Sefaria API provides programmatic access to Sefaria's comprehensive database of Jewish texts and their interconnections. This document covers how to use the Sefaria API for fetching Talmud texts, commentaries, and related content.

## Base URL

```
https://www.sefaria.org/api
```

## Key Features

- **No Authentication Required**: All documented endpoints are publicly accessible
- **JSON Responses**: All API responses are in JSON format
- **JSONP Support**: All methods support JSONP for cross-domain requests
- **Live Data**: Real-time access to Sefaria's continuously updated database

## Core Endpoints

### 1. Text Retrieval (v3)

The most up-to-date way to retrieve texts from Sefaria.

**Endpoint**: `/v3/texts/{tref}`

**Example**:
```javascript
// Fetch Berakhot 2a
const response = await fetch('https://www.sefaria.org/api/v3/texts/Berakhot.2a');
const data = await response.json();
```

**Query Parameters**:
- `lang`: Language preference (e.g., "he", "en")
- `version`: Specific version to retrieve
- `commentary`: Include commentaries (0 or 1)
- `context`: Include surrounding text for context

### 2. Text Retrieval (Legacy v1)

Still widely used in the codebase for specific version requests.

**Endpoint**: `/texts/{tref}`

**Example**:
```javascript
// Fetch specific Hebrew version
const url = 'https://www.sefaria.org/api/texts/Berakhot.2a?vhe=William_Davidson_Edition_-_Aramaic';
```

**Common Version Parameters**:
- `vhe`: Hebrew version name
- `ven`: English version name

### 3. Related Texts

Get all texts related to a specific reference (commentaries, cross-references, etc.)

**Endpoint**: `/related/{tref}`

**Example**:
```javascript
const response = await fetch('https://www.sefaria.org/api/related/Berakhot.2a');
const data = await response.json();
// Returns links array with commentary references
```

**Response Structure**:
```json
{
  "links": [{
    "index_title": "Rashi on Berakhot",
    "category": "Commentary",
    "type": "commentary",
    "ref": "Rashi on Berakhot 2a:1",
    "anchorRef": "Berakhot 2a:1"
  }],
  "sheets": [],
  "notes": []
}
```

## Talmud-Specific Usage

### Text References (tref)

Talmud references follow the pattern: `{Tractate}.{Daf}{Amud}`

Examples:
- `Berakhot.2a` - Berakhot, page 2, side a
- `Shabbat.31b` - Shabbat, page 31, side b
- `Bava_Metzia.85a` - Bava Metzia, page 85, side a (note underscore for multi-word names)

### Fetching Talmud with Commentaries

```javascript
// 1. Fetch main text
const mainText = await fetch('https://www.sefaria.org/api/texts/Berakhot.2a');

// 2. Fetch related to find commentary references
const related = await fetch('https://www.sefaria.org/api/related/Berakhot.2a');

// 3. Extract Rashi and Tosafot references
const rashiLink = related.links.find(link => 
  link.index_title === 'Rashi on Berakhot' && 
  link.type === 'commentary'
);

// 4. Fetch specific commentary
if (rashiLink) {
  const rashi = await fetch(`https://www.sefaria.org/api/texts/${rashiLink.ref}`);
}
```

### Common Talmud Versions

**Hebrew/Aramaic**:
- `William_Davidson_Edition_-_Aramaic` - Modern vocalized edition (primary)
- `Wikisource_Talmud_Bavli` - Standard Vilna text
- `Edmond J. Safra - French Edition` - French translation base

**English Translations**:
- `William Davidson Edition - English` - Modern English translation
- `Sefaria Community Translation` - Community contributed
- `The Schottenstein Edition` - ArtScroll translation (when available)

**Commentaries**:
- Rashi: `Rashi_on_{Tractate}` (e.g., `Rashi_on_Berakhot`)
- Tosafot: `Tosafot_on_{Tractate}` (e.g., `Tosafot_on_Berakhot`)
- Maharsha: `Chidushei_Halachot_on_{Tractate}`
- Maharshal: `Chokhmat_Shlomo_on_{Tractate}`

## Response Format

### Text Response Structure

```json
{
  "ref": "Berakhot 2a",
  "heRef": "ברכות ב׳ א",
  "text": ["English text array"],
  "he": ["Hebrew text array"],
  "versions": [{
    "title": "William Davidson Edition - English",
    "language": "en",
    "versionTitle": "William Davidson Edition - English",
    "versionSource": "https://korenpub.com/..."
  }],
  "commentary": [],
  "links": []
}
```

## Implementation in the Codebase

### Current Usage Pattern

The codebase uses two main approaches:

1. **Direct API calls** (in `/src/routes/api/talmud-merged/+server.ts`):
```javascript
const sefariaUrl = `https://www.sefaria.org/api/texts/${tractate}.${sefariaRef}?vhe=William_Davidson_Edition_-_Aramaic`;
```

2. **Abstracted service** (in `/src/lib/sefaria.ts`):
```javascript
import { sefariaAPI } from '$lib/sefaria';
const data = await sefariaAPI.getText('Berakhot.2a', { 
  lang: 'he',
  commentary: true 
});
```

### Tractate Name Mapping

When integrating with other sources (like HebrewBooks), use proper Sefaria tractate names:

```javascript
const TRACTATE_MAPPING = {
  '1': 'Berakhot',
  '2': 'Shabbat',
  '3': 'Eruvin',
  '4': 'Pesachim',
  // ... etc
  '22': 'Bava_Metzia',  // Note underscore for multi-word names
  '23': 'Bava_Batra',
};
```

## Additional Endpoints

### Index API

#### All Texts Index
Get a complete listing of all texts in the library organized by category.

**Endpoint**: `/api/index`

**Response**: Large JSON with all texts categorized. Recommended to cache locally.

```javascript
const response = await fetch('https://www.sefaria.org/api/index');
const library = await response.json();
// Returns categorized list of all texts
```

#### Individual Text Index (v2)
Get detailed metadata for a specific text.

**Endpoint**: `/api/v2/raw/index/{title}`

**Example**:
```javascript
const response = await fetch('https://www.sefaria.org/api/v2/raw/index/Berakhot');
const metadata = await response.json();
// Returns full MongoDB record with text structure, categories, etc.
```

### Version API
Get all available versions of a text.

**Endpoint**: `/api/texts/versions/{tref}`

**Example**:
```javascript
const response = await fetch('https://www.sefaria.org/api/texts/versions/Berakhot');
const versions = await response.json();
// Returns array of all available versions with metadata
```

### Calendars API
Study schedules and calendar data: `/calendars`

### Topic API
Topic relationships and graph: `/topics/graph`

### Search API
Full-text search across the library (undocumented, see GitHub wiki)

## Best Practices

1. **Cache responses** - Text content doesn't change frequently
2. **Handle arrays** - Text and Hebrew fields often return arrays of strings
3. **Check response status** - API returns 404 for non-existent texts
4. **Use specific versions** - When consistency is important, specify exact version names
5. **Batch related requests** - Fetch main text and commentaries in parallel

## Error Handling

```javascript
try {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Sefaria API error: ${response.status}`);
  }
  const data = await response.json();
  // Process data
} catch (error) {
  console.error('Failed to fetch from Sefaria:', error);
  // Fallback logic
}
```

### Common Error Responses

- **404 Not Found**: Invalid text reference or non-existent text
- **400 Bad Request**: Malformed reference or invalid parameters
- **500 Server Error**: Temporary server issues (implement retry logic)

## Performance Optimization

### Caching Strategy
```javascript
// Simple in-memory cache
const textCache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

async function getCachedText(ref) {
  const cacheKey = ref;
  const cached = textCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const data = await sefariaAPI.getText(ref);
  textCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}
```

### Batch Requests
```javascript
// Fetch multiple texts in parallel
const [mainText, rashi, tosafot] = await Promise.all([
  fetch(`${SEFARIA_API_BASE}/texts/Berakhot.2a`),
  fetch(`${SEFARIA_API_BASE}/texts/Rashi_on_Berakhot.2a`),
  fetch(`${SEFARIA_API_BASE}/texts/Tosafot_on_Berakhot.2a`)
]);
```

### Response Headers
- `Cache-Control`: Sefaria sets appropriate cache headers
- `ETag`: Use for conditional requests to save bandwidth
- `Last-Modified`: Track when content was last updated

## Rate Limiting

While Sefaria doesn't publish specific rate limits, best practices include:
- Add appropriate User-Agent headers
- Implement caching to reduce requests
- Use batch endpoints where available
- Consider downloading database dumps for heavy usage

## Further Resources

- [Official Developer Portal](https://developers.sefaria.org/)
- [API Reference](https://developers.sefaria.org/reference/getting-started)
- [GitHub Wiki](https://github.com/Sefaria/Sefaria-Project/wiki/API-Documentation)
- [Database Downloads](https://github.com/Sefaria/Sefaria-Export)