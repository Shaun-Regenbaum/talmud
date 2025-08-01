# Talmud Study Application

## Overview
A modern, interactive Talmud study application that enhances traditional text study with AI-powered tools and a beautiful interface inspired by the traditional Vilna Shas layout.

## Core Technologies
- **Frontend**: SvelteKit with TypeScript
- **Talmud Layout**: daf-renderer (https://github.com/TalmudLab/daf-renderer) for authentic Vilna-style page rendering
- **Data Sources**: 
  - Sefaria API for Talmud text and commentaries
  - HebrewBooks.org scraping with Cloudflare Browser Rendering
- **AI Integration**: Multiple LLMs via OpenRouter for translations, analysis, and study assistance
- **Deployment**: Cloudflare Workers with KV storage for caching
- **Browser Rendering**: Cloudflare Browser Rendering API for web scraping

## Key Features
- Authentic Talmud page layout using daf-renderer
- Real-time text and commentary loading from multiple sources
- HebrewBooks.org integration with intelligent caching
- AI-powered translations with word-by-word accuracy
- Contextual analysis and explanations
- Interactive study tools and annotations
- Multi-LLM support for different types of assistance

## HebrewBooks Integration
The app includes a HebrewBooks.org scraping service that:
- Uses Cloudflare Browser Rendering to extract structured text
- Caches results in KV storage for 7 days
- Provides API endpoints at `/api/hebrewbooks` and `/api/hebrewbooks-scraper`
- Supports all major Talmud tractates

### Setup
1. Run `./setup-kv.sh` to create KV namespaces
2. Update the KV namespace IDs in `wrangler.toml`
3. Deploy with `pnpm run deploy`

### API Usage
```typescript
import { hebrewBooksAPI } from '$lib/hebrewbooks';
const data = await hebrewBooksAPI.fetchPage('Berakhot', '2a');
```

## Development
- Always use `pnpm` for package management
- Focus on clean, minimal code - avoid unnecessary files
- Prefer editing existing files over creating new ones