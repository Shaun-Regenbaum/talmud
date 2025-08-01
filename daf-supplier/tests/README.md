# Daf Supplier Tests

## Overview
This test suite provides comprehensive coverage for the daf-supplier Cloudflare Worker that fetches Talmud text from HebrewBooks.org.

## Test Files

### 1. `index.test.js` - Main Worker Tests
- **CORS handling**: Tests preflight requests and CORS headers
- **Parameter validation**: Tests missing parameter handling
- **Cache functionality**: Tests KV storage caching and expiration
- **Daf conversion**: Tests daf number to page/amud conversion
- **Tractate mapping**: Tests mesechta number to name mapping
- **Browser rendering**: Tests Puppeteer/Browser API integration
- **Error handling**: Tests graceful fallback behavior
- **Response format**: Tests complete response structure

### 2. `ketubot-parsing.test.js` - Real Data Parsing Tests
Based on actual Ketubot 10b data:
- **Text structure parsing**: Tests identification of Gemara, Rashi, and Tosafot sections
- **Hebrew text integrity**: Tests preservation of Hebrew characters
- **Special punctuation**: Tests handling of geresh (׳) and gershayim (״)
- **Content extraction**: Tests regex patterns for different text sections
- **HTML structure**: Tests expected HebrewBooks div classes

### 3. `scraping.test.js` - Web Scraping Logic Tests
- **URL construction**: Tests proper HebrewBooks URL formation
- **HTML parsing**: Tests fieldset and iframe structure extraction
- **Text cleaning**: Tests HTML entity handling and normalization
- **Error recovery**: Tests fallback behavior
- **Cache keys**: Tests consistent key generation

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test -- --watch

# Run tests with coverage
pnpm test:coverage

# Run tests with UI
pnpm test:ui
```

## Test Data

The tests use real data from Ketubot 10b including:
- Main Gemara text with discussions about virginity tests
- Rashi commentary explaining terms and concepts
- Tosafot dialectical analysis

## Key Testing Patterns

1. **Mock Environment**: All tests use a mock Cloudflare Worker environment with KV and Browser bindings
2. **Real Data**: Tests use actual HebrewBooks HTML structure and content
3. **Error Scenarios**: Tests cover both success and failure paths
4. **Hebrew Support**: Special attention to Hebrew text handling and preservation

## Coverage Goals

- Core functionality: 100%
- Error handling: 100%
- Edge cases: 90%+
- Integration paths: Mocked appropriately

## Notes

- Browser rendering tests are mocked since Cloudflare Browser Rendering API isn't available in test environment
- HTTP fetch fallback is tested separately from browser rendering
- Cache expiration is set to 7 days as per production configuration