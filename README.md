# Talmud Study Application

A modern, interactive Talmud study application that enhances traditional text study with AI-powered tools and authentic Vilna Shas layout rendering.

## Features

- **Authentic Talmud Layout**: Faithful reproduction of the traditional Vilna page layout using daf-renderer
- **Multiple Display Modes**: Toggle between Vilna (with line breaks) and Custom (traditional flow) rendering
- **AI-Powered Enhancements**:
  - Real-time text translation on selection
  - Page summaries with engaging narratives
  - Educational stories for better retention
- **Multiple Data Sources**: Seamlessly combines content from Sefaria API and HebrewBooks.org
- **Responsive Design**: Scales beautifully across different screen sizes
- **Hebrew Font Support**: Authentic Vilna and Rashi fonts

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Cloudflare account (for deployment)
- OpenRouter API key (for AI features)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd talmud

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your OpenRouter API key
```

### Local Development

```bash
# Start the development server
pnpm run dev

# Run with Cloudflare Workers environment
pnpm run preview
```

### Deployment

```bash
# Deploy to Cloudflare Workers
pnpm run deploy
```

## Architecture

### Core Technologies

- **Frontend**: SvelteKit 5 with TypeScript
- **Styling**: TailwindCSS with custom Hebrew typography
- **Rendering**: daf-renderer for authentic Talmud page layout
- **Deployment**: Cloudflare Workers with KV storage
- **AI Integration**: OpenRouter API (Claude Sonnet 4)

### Project Structure

```
src/
├── lib/
│   ├── daf-renderer/        # Talmud page rendering engine
│   ├── stores/             # Svelte stores for state management
│   ├── components/         # Reusable UI components
│   ├── styles/            # Global and component styles
│   ├── hebrewbooks.ts     # HebrewBooks integration
│   ├── openrouter-translator.ts  # AI translation service
│   └── text-processor.ts  # Text processing utilities
├── routes/
│   ├── +page.svelte       # Main Talmud viewer
│   ├── story/            # Educational stories page
│   └── api/              # API endpoints
└── app.html              # App shell

static/
├── fonts/                # Hebrew fonts (Vilna, Rashi)
└── favicon.png
```

### Key Components

#### daf-renderer
The heart of the application - renders Talmud pages with authentic layout:
- Calculates precise spacing for main text and commentaries
- Handles Hebrew RTL text flow
- Supports both line-break and continuous text modes

#### Text Processing
- **processTextsForRenderer**: Adds styling classes for headers, first words, etc.
- **HebrewBooks Integration**: Fetches and caches formatted Talmud text
- **Sefaria Integration**: Provides structured text with translations

#### AI Features
- **Translation Service**: Real-time Hebrew to English translation
- **Summary Generation**: Creates engaging page summaries
- **Educational Stories**: Generates memorable narratives for learning

## API Documentation

### Internal Endpoints

#### GET /api/summary
Generates AI-powered page summaries.

Query params:
- `tractate`: Talmud tractate name
- `page`: Page number (2-76)
- `amud`: Side (a or b)
- `refresh`: Force regenerate (boolean)

#### GET /api/stories
Generates educational stories for a Talmud page.

Query params: Same as /api/summary

#### GET /api/hebrewbooks
Proxy for HebrewBooks data with caching.

Query params:
- `tractate`: Talmud tractate name
- `daf`: Page in Sefaria format (e.g., "2a")

### External APIs

- **Sefaria API**: `https://www.sefaria.org/api/texts/{tractate}.{daf}`
- **daf-supplier**: `https://daf-supplier.402.workers.dev/`

## Configuration

### Environment Variables

```env
# Required for AI features
PUBLIC_OPENROUTER_API_KEY=your-api-key

# Optional - defaults provided
PUBLIC_SEFARIA_API_URL=https://www.sefaria.org
```

### Cloudflare KV Namespaces

Required for caching (configured in `wrangler.toml`):
- `HEBREWBOOKS_CACHE`: Caches HebrewBooks data
- `SUMMARIES_KV`: Caches AI-generated summaries
- `STORIES_KV`: Caches educational stories

## Development Guidelines

### Code Style

- Use TypeScript for all new code
- Follow existing patterns for consistency
- Prefer composition over inheritance
- Keep components focused and reusable

### Testing

```bash
# Run type checking
pnpm run check

# Run linting
pnpm run lint
```

### Performance Considerations

- HebrewBooks data is cached for 7 days
- AI summaries are cached for 24 hours
- Use `refresh=true` to bypass cache when needed

## Troubleshooting

### Common Issues

1. **Fonts not loading**: Ensure Hebrew fonts are properly installed in `static/fonts/`
2. **API rate limits**: Implement proper caching to avoid hitting external API limits
3. **Cloudflare deployment errors**: Check wrangler.toml configuration and KV namespace bindings

### Debug Mode

Enable debug logging by setting:
```javascript
console.log('Debug mode enabled');
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Ensure all tests pass
5. Submit a pull request

## License

[License information here]

## Acknowledgments

- daf-renderer by TalmudLab for the rendering engine
- Sefaria for structured Talmud text
- HebrewBooks.org for formatted page data
- OpenRouter for AI capabilities