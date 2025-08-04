# OpenRouter Translation Setup

This guide explains how to set up and use OpenRouter for AI-powered translations in the Talmud app.

## Features

- **Automatic fallback**: When Sefaria translations aren't available, the app automatically uses OpenRouter
- **Context-aware translations**: Translations include context about the specific Talmud page
- **Multiple model support**: Uses Claude 3 Sonnet by default, with automatic fallback to GPT-4
- **Real-time translation**: Select any Hebrew/Aramaic text to get instant translations

## Setup

1. **Get an API Key**
   - Sign up at [OpenRouter.ai](https://openrouter.ai)
   - Go to [API Keys](https://openrouter.ai/keys) and create a new key
   - Add credits to your account ($5-10 is plenty for thousands of translations)

2. **Configure the App**
   - Copy `.env.example` to `.env`
   - Add your API key:
     ```
     PUBLIC_OPENROUTER_API_KEY=your-api-key-here
     ```

3. **Run the App**
   - Start the development server: `pnpm run dev`
   - The translation feature will automatically be enabled

## How It Works

1. **Text Selection**: When you select Hebrew/Aramaic text on a Talmud page
2. **Translation Priority**:
   - First checks if Sefaria has a translation for that segment
   - If not, uses OpenRouter to generate a translation
   - Shows "Translating..." while the API call is in progress

3. **Translation Models**:
   - **Primary**: Claude 3 Sonnet (best for Hebrew/Aramaic)
   - **Fallback**: GPT-4 Turbo (if Claude fails)
   - **Batch**: Claude 3 Haiku (for translating multiple segments)

## API Usage & Costs

- Each translation costs approximately $0.001-0.003
- The app includes smart caching to avoid re-translating the same text
- Batch translation is used when possible to reduce costs

## Troubleshooting

1. **No translations appearing**:
   - Check browser console for errors
   - Verify API key is correctly set in `.env`
   - Ensure you have credits in your OpenRouter account

2. **Slow translations**:
   - First translation may take 2-3 seconds
   - Subsequent translations should be faster
   - Consider using the fast model for quicker responses

3. **Translation errors**:
   - The app automatically falls back to alternate models
   - Check your OpenRouter dashboard for API limits
   - Ensure your selected text is valid Hebrew/Aramaic

## Advanced Configuration

You can customize the translation behavior by modifying `src/lib/openrouter-translator.ts`:

- Change models in the `models` object
- Adjust temperature for more/less creative translations
- Modify the system prompt for different translation styles
- Add support for other target languages