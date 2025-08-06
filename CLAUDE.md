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
- **Click-to-context**: Select any text to see corresponding Sefaria segments with translations

## HebrewBooks Integration
The app includes a HebrewBooks.org scraping service that:
- Uses Cloudflare Browser Rendering to extract structured text
- Caches results in KV storage for 7 days
- Provides API endpoint at `/api/daf-supplier` with browser rendering
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

## API Architecture

### Merged API Strategy
The application uses a sophisticated merging strategy to combine data from multiple sources:

1. **Sefaria API** (`/api/texts/`) - Provides structured, segmented text with translations
2. **HebrewBooks.org** (via daf-supplier) - Provides formatted text with traditional layout markers
3. **Merged API** (`/api/talmud-merged/`) - Intelligently combines both sources using a diff algorithm

### Key API Endpoints

#### Internal APIs
- `/api/talmud-merged` - Returns merged content from both Sefaria and HebrewBooks
- `/api/daf-supplier` - Internal HebrewBooks scraping with browser rendering

#### External APIs
- Sefaria: `https://www.sefaria.org/api/texts/{tractate}.{daf}`

### Daf Number Conversion
**Important**: HebrewBooks and Sefaria use different daf numbering:
- HebrewBooks: Sequential numbers (2, 3, 4, 5...)
- Sefaria: Traditional format (2a, 2b, 3a, 3b...)

Conversion formula:
```javascript
const pageNum = Math.floor((dafNum + 1) / 2);
const amud = dafNum % 2 === 0 ? 'a' : 'b';
const sefariaRef = `${pageNum}${amud}`;
```

## Testing & Debugging

### Test Pages
- `/talmud-merged-test` - Comprehensive API testing interface with:
  - Direct Sefaria API testing
  - Source comparison views
  - Debug information display
  - API endpoint documentation
- `/test/sefaria` - Advanced text alignment testing with:
  - HebrewBooks to Sefaria text alignment
  - Click-to-context functionality demo
  - Segment-by-segment comparison
  - Alignment quality metrics

### Key Debug Features
- Response time tracking for all API calls
- Side-by-side source comparison
- Raw data inspection
- API call logging with timestamps

## Text Alignment Service
The application includes an advanced text alignment service (`/src/lib/services/textAlignment.ts`) that:
- Performs fuzzy matching between Hebrew texts from different sources
- Handles nikud (vowel marks), punctuation, and formatting differences
- Uses multiple matching strategies (exact, normalized, substring, root, Levenshtein)
- Supports click-to-context functionality for text selection
- Maps words between sources to maintain segment boundaries

### Click-to-Context Feature
Users can select any text in the HebrewBooks display to:
1. See the corresponding Sefaria text
2. View the full Sefaria segment(s) containing that text
3. Access English translations and commentary
4. Navigate to the source for deeper study

### Alignment API
```typescript
import { 
  alignTexts, 
  findSelectionInAlignment,
  getSegmentsFromSelection,
  createSegmentMappings 
} from '$lib/services/textAlignment';

// Align two Hebrew texts
const result = alignTexts(sefariaText, hebrewBooksText);

// Find selected text in alignment
const selection = findSelectionInAlignment(selectedText, result.alignment);

// Get Sefaria segments for selection
const segments = getSegmentsFromSelection(selection, segmentMappings);
```

## Documentation
- `/docs/Sefaria.md` - Comprehensive Sefaria API documentation
- Includes endpoint details, response formats, and usage examples
- Performance optimization strategies and caching patterns

## Development Guidelines
- Always use `pnpm` for package management
- Focus on clean, minimal code - avoid unnecessary files
- Prefer editing existing files over creating new ones
- Test API changes using the talmud-merged-test page
- Test alignment features using the /test/sefaria page
- Document any new API integrations or data sources